import { supabase } from "./supabase.ts";

export type Attempt = {
  seen: number;
  correct: number;
  last: boolean;
};

export type Stats = {
  results: Record<string, Attempt>;
  owner: string | null;
};

const emptyStats: Stats = { results: {}, owner: null };
const storageKey = "oec-practice-v2";

function isAttempt(value: unknown): value is Attempt {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Attempt>;
  return (
    typeof row.seen === "number" &&
    typeof row.correct === "number" &&
    typeof row.last === "boolean" &&
    Number.isInteger(row.seen) &&
    Number.isInteger(row.correct) &&
    row.seen >= 1 &&
    row.correct >= 0 &&
    row.correct <= row.seen &&
    (row.last ? row.correct >= 1 : row.correct < row.seen)
  );
}

function migrateAttempt(value: unknown): Attempt | null {
  if (typeof value === "boolean") return { seen: 1, correct: value ? 1 : 0, last: value };
  if (!isAttempt(value)) return null;
  return { seen: value.seen, correct: value.correct, last: value.last };
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyStats;
    const parsed = JSON.parse(raw) as Partial<Stats>;
    if (!parsed.results || typeof parsed.results !== "object") return emptyStats;
    const results: Record<string, Attempt> = {};
    for (const [id, value] of Object.entries(parsed.results)) {
      const attempt = migrateAttempt(value);
      if (attempt) results[id] = attempt;
    }
    return { results, owner: typeof parsed.owner === "string" ? parsed.owner : null };
  } catch {
    return emptyStats;
  }
}

export function saveStats(stats: Stats) {
  localStorage.setItem(storageKey, JSON.stringify(stats));
}

export function missedIds(stats: Stats): string[] {
  return Object.entries(stats.results)
    .filter(([, attempt]) => !attempt.last)
    .map(([id]) => id);
}

export function attemptTally(attempt: Attempt | undefined): string {
  if (!attempt || attempt.seen < 1) return "Not seen yet";
  return `Right ${attempt.correct} of ${attempt.seen}`;
}

export function studyCoverage(results: Record<string, Attempt>, pool: Array<{ id: string; chapter: string }>) {
  let seen = 0;
  let correct = 0;
  let missed = 0;
  const chapters = new Map<string, { size: number; seen: number }>();
  for (const question of pool) {
    const chapter = chapters.get(question.chapter) ?? { size: 0, seen: 0 };
    chapter.size += 1;
    const attempt = results[question.id];
    if (attempt && attempt.seen > 0) {
      seen += 1;
      chapter.seen += 1;
      if (attempt.last) correct += 1;
      else missed += 1;
    }
    chapters.set(question.chapter, chapter);
  }
  let chaptersStarted = 0;
  for (const chapter of chapters.values()) if (chapter.seen > 0) chaptersStarted += 1;
  return { total: pool.length, seen, correct, missed, chaptersStarted, chapterCount: chapters.size };
}

export type StudyCoverage = ReturnType<typeof studyCoverage>;

export function chapterMeters(attempts: Array<Attempt | undefined>, poolSize: number): { aptitude: number; seen: number } {
  let seenQuestions = 0;
  let totalAttempts = 0;
  let totalCorrect = 0;
  for (const attempt of attempts) {
    if (!attempt || attempt.seen < 1) continue;
    seenQuestions += 1;
    totalAttempts += attempt.seen;
    totalCorrect += attempt.correct;
  }
  return {
    aptitude: totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100),
    seen: poolSize === 0 ? 0 : Math.round((seenQuestions / poolSize) * 100),
  };
}

function withAnswer(stats: Stats, id: string, correct: boolean, owner: string | null): Stats {
  const previous = stats.results[id];
  return {
    results: {
      ...stats.results,
      [id]: {
        seen: (previous?.seen ?? 0) + 1,
        correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
        last: correct,
      },
    },
    owner: owner ?? stats.owner,
  };
}

export function recordLocal(id: string, correct: boolean, owner: string | null): Stats {
  const next = withAnswer(loadStats(), id, correct, owner);
  saveStats(next);
  return next;
}

type AnswerWrite = {
  user_id: string;
  question_id: string;
  correct: boolean;
  seen_count: number;
  correct_count: number;
  updated_at: string;
};

function missingCountColumns(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; message?: unknown };
  const code = typeof row.code === "string" ? row.code : "";
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return (
    code === "PGRST204" ||
    code === "42703" ||
    message.includes("seen_count") ||
    message.includes("correct_count")
  );
}

async function uploadAnswers(rows: AnswerWrite[]) {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from("answers").upsert(rows, { onConflict: "user_id,question_id" });
  if (error) throw error;
}

function rowsFromStats(userId: string, entries: Array<[string, boolean]>): AnswerWrite[] {
  const stats = loadStats();
  const updated_at = new Date().toISOString();
  return entries.map(([question_id, correct]) => {
    const attempt = stats.results[question_id];
    return {
      user_id: userId,
      question_id,
      correct: attempt?.last ?? correct,
      seen_count: attempt?.seen ?? 1,
      correct_count: attempt?.correct ?? (correct ? 1 : 0),
      updated_at,
    };
  });
}

export async function recordRemote(userId: string, id: string, correct: boolean) {
  try {
    await uploadAnswers(rowsFromStats(userId, [[id, correct]]));
  } catch (error) {
    if (missingCountColumns(error)) return;
    throw error;
  }
}

export async function recordRemoteMany(userId: string, entries: Array<[string, boolean]>) {
  try {
    await uploadAnswers(rowsFromStats(userId, entries));
  } catch (error) {
    if (missingCountColumns(error)) return;
    throw error;
  }
}

function attemptFromRemote(row: {
  question_id?: unknown;
  correct?: unknown;
  seen_count?: unknown;
  correct_count?: unknown;
}): Attempt | null {
  if (typeof row.question_id !== "string" || typeof row.correct !== "boolean") return null;
  if (row.seen_count == null && row.correct_count == null) {
    return { seen: 1, correct: row.correct ? 1 : 0, last: row.correct };
  }
  return migrateAttempt({
    seen: row.seen_count,
    correct: row.correct_count,
    last: row.correct,
  });
}

export async function mergeRemote(userId: string): Promise<Stats> {
  if (!supabase) return loadStats();
  const { data, error } = await supabase.from("answers").select("question_id, correct, seen_count, correct_count");
  if (error) {
    if (missingCountColumns(error)) return loadStats();
    throw error;
  }

  const remote: Record<string, Attempt> = {};
  for (const row of data ?? []) {
    const attempt = attemptFromRemote(row);
    if (attempt && typeof row.question_id === "string") remote[row.question_id] = attempt;
  }

  const local = loadStats();
  const claimLocal = local.owner === null || local.owner === userId;
  const missing = claimLocal ? Object.entries(local.results).filter(([id]) => !(id in remote)) : [];
  if (missing.length > 0) {
    await recordRemoteMany(
      userId,
      missing.map(([id, attempt]) => [id, attempt.last]),
    );
  }

  const latest = loadStats();
  const results: Record<string, Attempt> = claimLocal ? { ...latest.results } : {};
  for (const [id, attempt] of Object.entries(remote)) results[id] = attempt;

  const merged = { results, owner: userId };
  saveStats(merged);
  return merged;
}
