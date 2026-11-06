import { supabase } from "./supabase.ts";

export type PracticeTest = {
  id: string;
  at: string;
  length: number;
  correct: number;
  owner: string | null;
};

const storageKey = "oec-practice-tests-v1";
let testsSavedLocally = false;

export function practiceTestsSavedLocally() {
  return testsSavedLocally;
}

function relationMissing(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  const message = error.message?.toLowerCase() ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

function isTest(value: unknown): value is PracticeTest {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PracticeTest>;
  return (
    typeof row.id === "string" &&
    typeof row.at === "string" &&
    typeof row.length === "number" &&
    typeof row.correct === "number" &&
    (row.owner === null || typeof row.owner === "string") &&
    Number.isInteger(row.length) &&
    Number.isInteger(row.correct) &&
    row.length >= 1 &&
    row.length <= 100 &&
    row.correct >= 0 &&
    row.correct <= row.length
  );
}

export function loadPracticeTests(owner: string | null): PracticeTest[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTest).filter((test) => test.owner === owner).sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    return [];
  }
}

function readAll(): PracticeTest[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTest);
  } catch {
    return [];
  }
}

function writeAll(tests: PracticeTest[]) {
  localStorage.setItem(storageKey, JSON.stringify(tests));
}

async function upload(userId: string, tests: PracticeTest[]) {
  if (!supabase || tests.length === 0) return;
  const rows = tests.map((test) => ({
    id: test.id,
    user_id: userId,
    taken_at: test.at,
    length: test.length,
    correct: test.correct,
  }));
  const { error } = await supabase.from("practice_tests").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (!error) return;
  if (relationMissing(error)) {
    testsSavedLocally = true;
    return;
  }
  console.warn("practice tests", error.message);
}

async function fetchRemote(userId: string): Promise<PracticeTest[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("practice_tests")
    .select("id, taken_at, length, correct")
    .eq("user_id", userId)
    .order("taken_at", { ascending: true });
  if (error) {
    if (relationMissing(error)) testsSavedLocally = true;
    else console.warn("practice tests", error.message);
    return null;
  }
  return (data ?? []).flatMap((row) => {
    const test = {
      id: String(row.id),
      at: String(row.taken_at),
      length: Number(row.length),
      correct: Number(row.correct),
      owner: userId,
    };
    return isTest(test) ? [test] : [];
  });
}

export async function recordPracticeTest(
  input: { length: number; correct: number },
  userId: string | null,
): Promise<PracticeTest[]> {
  const row: PracticeTest = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    length: input.length,
    correct: input.correct,
    owner: userId,
  };
  const next = [...readAll(), row];
  writeAll(next);
  if (userId) await upload(userId, [row]);
  return next.filter((test) => test.owner === userId).sort((a, b) => a.at.localeCompare(b.at));
}

export async function syncPracticeTests(userId: string): Promise<PracticeTest[]> {
  const claimed = readAll().map((test) => (test.owner === null ? { ...test, owner: userId } : test));
  writeAll(claimed);
  const mine = claimed.filter((test) => test.owner === userId);
  await upload(userId, mine);
  const remote = await fetchRemote(userId);
  if (!remote) return mine.sort((a, b) => a.at.localeCompare(b.at));
  const byId = new Map<string, PracticeTest>();
  for (const test of mine) byId.set(test.id, test);
  for (const test of remote) byId.set(test.id, test);
  const merged = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
  writeAll([...claimed.filter((test) => test.owner !== userId), ...merged]);
  return merged;
}

export function scorePercent(test: PracticeTest): number {
  return Math.round((test.correct / test.length) * 100);
}
