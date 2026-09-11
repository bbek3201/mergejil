// Google Gemini API-тай харилцах хамгийн бага клиент. Зөвхөн сервер талд
// ажиллана — GEMINI_API_KEY-г хэзээ ч браузерт гаргахгүй.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Ашиглах модель. `gemini-3.1-pro-preview` зэрэг preview модель нь түлхүүр
 * тус бүрт нээлттэй байдаггүй тул анхдагчаар нээлттэй flash моделийг авна.
 * Хүсвэл .env дээр GEMINI_MODEL-ээр дарж бичиж болно.
 */
// gemini-3.6-flash-ийн үнэгүй квот өдөрт 20 хүсэлт бөгөөд хурдан барагддаг.
// 3.7-flash нь илүү шинэ бөгөөд тусдаа квоттой.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new GeminiError(
      'GEMINI_API_KEY тохируулагдаагүй байна. apps/mergejil/.env дээр нэмнэ үү.',
      500,
    );
  }
  return key;
}

type JsonSchema = Record<string, unknown>;

/**
 * Схемээс JSON-ы "араг яс" гаргана. Gemini схемийг хүлээж авахгүй тохиолдолд
 * (хэт нийлмэл схемийг 400-аар татгалздаг) энэ бүтцийг prompt-д зааж өгнө.
 */
export function schemaSkeleton(schema: JsonSchema): unknown {
  const type = schema.type;

  if (type === 'object') {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const shape: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      shape[key] = schemaSkeleton(value);
    }
    return shape;
  }

  if (type === 'array') {
    const count = Number(schema.minItems ?? 1) || 1;
    const item = schemaSkeleton((schema.items ?? {}) as JsonSchema);
    // Хэдэн элемент шаардлагатайг тоогоор нь харуулахын тулд 2 хүртэл үзүүлнэ.
    return count > 1 ? [item, `… нийт ${count} элемент`] : [item];
  }

  if (Array.isArray(schema.enum)) {
    return `нэг нь: ${(schema.enum as string[]).join(' | ')}`;
  }

  return type === 'integer' || type === 'number' ? 0 : 'string';
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 429/503 үед Gemini-ийн зөвлөсөн хугацааг уншина (секундээр). */
function retryDelaySeconds(payload: unknown, attempt: number): number {
  const details = (payload as { error?: { details?: unknown[] } })?.error
    ?.details;
  const retryInfo = Array.isArray(details)
    ? details.find(
        (item): item is { retryDelay?: string } =>
          typeof item === 'object' &&
          item !== null &&
          '@type' in item &&
          String((item as { '@type': string })['@type']).includes('RetryInfo'),
      )
    : undefined;
  const advised = Number.parseFloat(retryInfo?.retryDelay ?? '');
  // Үнэгүй квот минутанд 20 хүсэлт тул зөвлөсөн хугацаа 60 сек хүрч болно.
  if (Number.isFinite(advised) && advised > 0) return Math.min(advised + 2, 70);
  // Зөвлөмж байхгүй бол экспоненциалаар нэмэгдүүлнэ.
  return Math.min(2 ** attempt * 10, 70);
}

/**
 * Gemini-ээс хатуу JSON схемийн дагуу хариу авна. Схем зааж өгснөөр модель
 * зөвхөн тухайн бүтэцтэй JSON буцаах тул parse хийхэд найдвартай.
 */
export async function generateJson<T>({
  prompt,
  schema,
  systemInstruction,
  temperature = 0.4,
  signal,
}: {
  prompt: string;
  schema: JsonSchema;
  systemInstruction?: string;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{ data: T; model: string }> {
  const model = geminiModel();

  // Схемийг заавал биш болгож дуудах хувилбар: энэ үед хүссэн бүтцийг
  // prompt дотор нь зааж өгнө.
  const buildBody = (useSchema: boolean) =>
    JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: useSchema
                ? prompt
                : `${prompt}

Хариултаа ЗӨВХӨН дараах бүтэцтэй JSON-оор буцаа (нэмэлт текст, markdown бичихгүй):
${JSON.stringify(schemaSkeleton(schema), null, 2)}`,
            },
          ],
        },
      ],
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
        ...(useSchema ? { responseSchema: schema } : {}),
      },
    });

  let withSchema = true;
  let body = buildBody(true);

  let payload: {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null = null;
  let status = 0;

  // Үнэгүй квот дээр 429/503 нь түр зуурын байдаг тул хэд оролдоно.
  let attempt = 0;
  while (attempt < 4) {
    // Зарим модель (3.7-flash г.м) header-ийн түлхүүрийг таньдаггүй тул
    // `?key=` query параметрээр дамжуулна.
    const response = await fetch(
      `${API_BASE}/${model}:generateContent?key=${apiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body,
      },
    );

    payload = await response.json().catch(() => null);
    status = response.status;
    if (response.ok) break;

    // Хэт нийлмэл схемийг Gemini 400-аар татгалздаг — тэр үед схемгүйгээр
    // (бүтцийг prompt-д зааж) нэг удаа дахин оролдоно.
    if (status === 400 && withSchema) {
      console.warn(
        'Gemini rejected the response schema; retrying without it.',
        payload?.error?.message,
      );
      withSchema = false;
      body = buildBody(false);
      // Схем солих нь оролдлого болж тоологдохгүй.
      continue;
    }

    const retryable = status === 429 || status === 503;
    if (!retryable || attempt === 3) {
      const detail =
        typeof payload?.error?.message === 'string'
          ? payload.error.message
          : `Gemini API ${status}`;
      throw new GeminiError(detail, status);
    }
    await sleep(retryDelaySeconds(payload, attempt) * 1000);
    attempt += 1;
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('');

  if (!text) {
    throw new GeminiError('Gemini хоосон хариу буцаалаа.', 502);
  }

  try {
    return { data: JSON.parse(text) as T, model };
  } catch {
    throw new GeminiError('Gemini-ийн JSON хариуг уншиж чадсангүй.', 502);
  }
}
