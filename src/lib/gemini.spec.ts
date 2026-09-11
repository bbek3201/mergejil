import { generateJson, schemaSkeleton } from './gemini';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    score: { type: 'integer' },
    level: { type: 'string', enum: ['low', 'high'] },
    items: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
  required: ['title', 'score', 'level', 'items'],
};

const okResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  }),
});

const errorResponse = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ error: { message, code: status } }),
});

describe('schemaSkeleton', () => {
  it('turns a response schema into a JSON shape hint', () => {
    expect(schemaSkeleton(SCHEMA)).toEqual({
      title: 'string',
      score: 0,
      level: 'нэг нь: low | high',
      items: [{ name: 'string' }, '… нийт 3 элемент'],
    });
  });
});

describe('generateJson', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-3.7-flash';
  });

  it('sends the response schema and parses the JSON back', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ title: 'ok' }));

    const { data, model } = await generateJson<{ title: string }>({
      prompt: 'Хэл',
      schema: SCHEMA,
    });

    expect(data.title).toBe('ok');
    expect(model).toBe('gemini-3.7-flash');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseSchema).toEqual(SCHEMA);
    // Түлхүүрийг `?key=` query параметрээр дамжуулна.
    expect(fetchMock.mock.calls[0][0]).toContain('key=test-key');
  });

  it('retries without the schema when Gemini rejects it', async () => {
    fetchMock
      .mockResolvedValueOnce(
        errorResponse(400, 'Request contains an invalid argument.'),
      )
      .mockResolvedValueOnce(okResponse({ title: 'fallback' }));

    const { data } = await generateJson<{ title: string }>({
      prompt: 'Хэл',
      schema: SCHEMA,
    });

    expect(data.title).toBe('fallback');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.generationConfig.responseSchema).toBeUndefined();
    // Схемгүй үед хүссэн бүтцийг prompt дотор зааж өгнө.
    expect(second.contents[0].parts[0].text).toContain('"title": "string"');
  });

  it('surfaces a quota error instead of hanging', async () => {
    fetchMock.mockResolvedValue(errorResponse(403, 'Permission denied'));

    await expect(
      generateJson({ prompt: 'Хэл', schema: SCHEMA }),
    ).rejects.toThrow('Permission denied');
  });
});
