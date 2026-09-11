import { authStorage } from './authStorage';
import type { CareerProfile, ModuleCode } from './careerProfile';
import type { MbtiResult } from './mbtiScoring';
import type { IqSubScore } from './iqBreakdown';
import type { SkillsResult } from './skillsScoring';

function authHeaders(): Record<string, string> | null {
  const token = authStorage.getToken();
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Дууссан модулийн үр дүнг нэвтэрсэн хэрэглэгчийн хувьд хадгална. Нэвтрээгүй
 * үед үр дүнг хадгалах шаардлагагүй тул чимээгүй `false` буцаана.
 */
async function saveModuleResult(
  code: ModuleCode,
  summary: string | number,
  detail: unknown,
): Promise<boolean> {
  const headers = authHeaders();
  if (!headers) return false;

  try {
    const res = await fetch(`/api/assessments/${code}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ summary, detail }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function saveMbtiResult(result: MbtiResult): Promise<boolean> {
  return saveModuleResult('mbti', result.type, {
    alternativeType: result.alternativeType ?? null,
    dichotomyType: result.dichotomyType,
    credit: result.credit,
    confidence: result.confidence,
    scores: result.scores,
    functionPercents: result.functionPercents,
    dichotomies: result.dichotomies,
    ranking: result.ranking,
    answeredCount: result.answeredCount,
    totalQuestions: result.totalQuestions,
  });
}

export function saveIqResult(result: {
  iqScore: number;
  accuracyRate: number;
  difficultyLevelReached: string;
  cognitiveSpeedCategory: string;
  averageSeconds: number;
  subScores: IqSubScore[];
}): Promise<boolean> {
  return saveModuleResult('iq', result.iqScore, result);
}

export function saveSkillsResult(result: SkillsResult): Promise<boolean> {
  return saveModuleResult('skills', result.overallPercent, result);
}

export type ProfileStatus = {
  sessionId: string | null;
  completedModules: ModuleCode[];
  missingModules: ModuleCode[];
  profile: CareerProfile | null;
};

/** Хадгалагдсан профайл болон дууссан тестүүдийн байдлыг уншина. */
export async function fetchProfileStatus(): Promise<ProfileStatus | null> {
  const headers = authHeaders();
  if (!headers) return null;

  const res = await fetch('/api/profile', { headers });
  if (!res.ok) return null;
  return (await res.json()) as ProfileStatus;
}

export type GenerateProfileResult =
  | { profile: CareerProfile; error?: undefined; missingModules?: undefined }
  | { profile?: undefined; error: string; missingModules?: ModuleCode[] };

/** Gemini-ээр профайл үүсгүүлнэ. `force` бол хадгалсныг дахин үүсгэнэ. */
export async function generateProfile(
  force = false,
): Promise<GenerateProfileResult> {
  const headers = authHeaders();
  if (!headers) return { error: 'Нэвтэрсний дараа профайл үүснэ.' };

  try {
    const res = await fetch('/api/profile/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ force }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        error: data?.error ?? 'AI профайл үүсгэхэд алдаа гарлаа.',
        missingModules: data?.missingModules,
      };
    }
    return { profile: data.profile as CareerProfile };
  } catch {
    return { error: 'Сүлжээний алдаа — дахин оролдоно уу.' };
  }
}
