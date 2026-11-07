import { buildAnswerSync, sameAttempt, type AnswerBook, type Attempt } from "./answer-sync.ts";
import { supabase } from "./supabase.ts";

export type { Attempt };

export type Stats = AnswerBook;

const emptyStats: Stats = { results: {}, owner: null, synced: null };
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
    const owner = typeof parsed.owner === "string" ? parsed.owner : null;
    let synced: Record<string, Attempt> | null = null;
    if (owner && parsed.synced && typeof parsed.synced === "object") {
      const rows: Record<string, Attempt> = {};
      let valid = true;
      for (const [id, value] of Object.entries(parsed.synced)) {
        const attempt = migrateAttempt(value);
        if (!attempt) {
          valid = false;
          break;
        }
        rows[id] = attempt;
      }
      if (valid) synced = rows;
    }
    return { results, owner, synced };
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

let countsSavedLocally = false;

export function attemptCountsSavedLocally() {
  return countsSavedLocally;
}

export function lowerChapters(
  results: Record<string, Attempt>,
  pool: Array<{ id: string; chapter: string }>,
): Array<{ id: string; aptitude: number }> {
  const byChapter = new Map<string, Attempt[]>();
  for (const question of pool) {
    const attempt = results[question.id];
    if (!attempt || attempt.seen < 1) continue;
    const list = byChapter.get(question.chapter) ?? [];
    list.push(attempt);
    byChapter.set(question.chapter, list);
  }
  const overall = chapterMeters([...byChapter.values()].flat(), pool.length).aptitude;
  return [...byChapter.entries()]
    .flatMap(([id, attempts]) => {
      const tries = attempts.reduce((sum, attempt) => sum + attempt.seen, 0);
      if (tries < 4) return [];
      const aptitude = chapterMeters(attempts, attempts.length).aptitude;
      if (aptitude >= 80 || aptitude > overall - 15) return [];
      return [{ id, aptitude }];
    })
    .sort((a, b) => a.aptitude - b.aptitude)
    .slice(0, 3);
}

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
    synced: stats.synced,
  };
}

export function recordLocal(id: string, correct: boolean, owner: string | null): Stats {
  const next = withAnswer(loadStats(), id, correct, owner);
  saveStats(next);
  return next;
}

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

export function syncFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return "Could not sync progress.";
}

const pageSize = 1000;

async function fetchRemoteAnswers(): Promise<{ rows: Record<string, Attempt>; counts: boolean }> {
  if (!supabase) return { rows: {}, counts: true };
  const counted = await fetchAnswerRows("question_id, correct, seen_count, correct_count");
  if (!("error" in counted)) {
    countsSavedLocally = false;
    return { rows: counted.rows, counts: true };
  }
  if (!missingCountColumns(counted.error)) throw counted.error;
  countsSavedLocally = true;
  const plain = await fetchAnswerRows("question_id, correct");
  if ("error" in plain) throw plain.error;
  return { rows: plain.rows, counts: false };
}

async function fetchAnswerRows(columns: string): Promise<{ rows: Record<string, Attempt> } | { error: unknown }> {
  if (!supabase) return { rows: {} };
  const rows: Record<string, Attempt> = {};
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("answers").select(columns).range(from, from + pageSize - 1);
    if (error) return { error };
    for (const row of (data ?? []) as RemoteAnswer[]) {
      const attempt = attemptFromRemote(row);
      if (attempt && typeof row.question_id === "string") rows[row.question_id] = attempt;
    }
    if ((data ?? []).length < pageSize) break;
  }
  return { rows };
}

type RemoteAnswer = {
  question_id?: unknown;
  correct?: unknown;
  seen_count?: unknown;
  correct_count?: unknown;
};

function attemptFromRemote(row: RemoteAnswer): Attempt | null {
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

async function uploadAnswers(userId: string, attempts: Record<string, Attempt>, counts: boolean) {
  if (!supabase) return;
  const ids = Object.keys(attempts);
  if (ids.length === 0) return;
  const updated_at = new Date().toISOString();
  const rows = ids.map((question_id) => {
    const attempt = attempts[question_id]!;
    const base = { user_id: userId, question_id, correct: attempt.last, updated_at };
    if (!counts) return base;
    return { ...base, seen_count: attempt.seen, correct_count: attempt.correct };
  });
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabase.from("answers").upsert(rows.slice(index, index + 200), { onConflict: "user_id,question_id" });
    if (error) throw error;
  }
}

let syncChain: Promise<unknown> = Promise.resolve();

function enqueueSync<T>(work: () => Promise<T>): Promise<T> {
  const run = syncChain.then(work, work);
  syncChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sameUpload(left: Record<string, Attempt>, right: Record<string, Attempt>): boolean {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const id of ids) {
    const a = left[id];
    const b = right[id];
    if (!a || !b || !sameAttempt(a, b)) return false;
  }
  return true;
}

async function reconcile(userId: string): Promise<Stats> {
  if (!supabase) return loadStats();
  const started = loadStats();
  const remote = await fetchRemoteAnswers();
  let counts = remote.counts;
  let uploaded: { upload: Record<string, Attempt>; synced: Record<string, Attempt> | null } | null = null;
  for (let pass = 0; pass < 8; pass += 1) {
    const latest = loadStats();
    const plan = buildAnswerSync({
      userId,
      started,
      remote: remote.rows,
      countsOnServer: counts,
      latest,
    });
    if (uploaded && sameUpload(uploaded.upload, plan.upload)) break;
    try {
      await uploadAnswers(userId, plan.upload, counts);
    } catch (error) {
      if (!counts || !missingCountColumns(error)) throw error;
      counts = false;
      countsSavedLocally = true;
      await uploadAnswers(userId, plan.upload, false);
    }
    uploaded = { upload: plan.upload, synced: counts ? plan.synced : null };
  }
  const finalPlan = buildAnswerSync({
    userId,
    started,
    remote: remote.rows,
    countsOnServer: counts,
    latest: loadStats(),
  });
  const stable = uploaded ? sameUpload(uploaded.upload, finalPlan.upload) : false;
  const stats: Stats = {
    results: finalPlan.results,
    owner: userId,
    synced: counts ? (stable ? finalPlan.synced : uploaded?.synced ?? null) : null,
  };
  saveStats(stats);
  return stats;
}

export function recordRemote(userId: string, _id: string, _correct: boolean) {
  return enqueueSync(() => reconcile(userId));
}

export function recordRemoteMany(userId: string, _entries: Array<[string, boolean]>) {
  return enqueueSync(() => reconcile(userId));
}

export function mergeRemote(userId: string): Promise<Stats> {
  return enqueueSync(() => reconcile(userId));
}
