import { supabase } from "./supabase.ts";

export type Profile = {
  displayName: string | null;
  showOnLeaderboard: boolean;
};

export type BoardRow = {
  rank: number;
  displayName: string;
  percent: number;
  length: number;
  takenAt: string | null;
  isSelf: boolean;
};

export function formatBoardDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

const namePattern = /^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$/;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function cleanDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function displayNameError(value: string): string | null {
  if (!value) return null;
  if (value.length < 2 || value.length > 24 || !namePattern.test(value)) {
    return "Use 2–24 letters, numbers, spaces, periods, hyphens, or underscores.";
  }
  return null;
}

function relationMissing(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  const message = error.message?.toLowerCase() ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "42883" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

function saveError(error: { code?: string; message?: string }): string {
  if (relationMissing(error)) return "Names and the leaderboard are still being set up.";
  if (error.code === "23505") return "That name is already in use.";
  if (error.code === "23514") return "Use 2–24 letters, numbers, spaces, periods, hyphens, or underscores.";
  return "The name did not save. Try again.";
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, show_on_leaderboard")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (relationMissing(error)) return null;
    throw error;
  }
  if (!data) return { displayName: null, showOnLeaderboard: false };
  const displayName = typeof data.display_name === "string" ? data.display_name : null;
  return {
    displayName,
    showOnLeaderboard: Boolean(data.show_on_leaderboard) && displayName !== null,
  };
}

export async function saveProfile(
  userId: string,
  input: { displayName: string },
): Promise<{ profile: Profile | null; error: string | null }> {
  if (!supabase) return { profile: null, error: "The name did not save. Try again." };
  const displayName = cleanDisplayName(input.displayName);
  const format = displayNameError(displayName);
  if (format) return { profile: null, error: format };
  const showOnLeaderboard = displayName.length > 0;
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      display_name: displayName || null,
      show_on_leaderboard: showOnLeaderboard,
    },
    { onConflict: "user_id" },
  );
  if (error) return { profile: null, error: saveError(error) };
  return { profile: { displayName: displayName || null, showOnLeaderboard }, error: null };
}

export async function loadLeaderboard(): Promise<{ rows: BoardRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: "The leaderboard is still being set up." };
  const { data, error } = await supabase.rpc("leaderboard");
  if (error) {
    if (relationMissing(error)) return { rows: [], error: "The leaderboard is still being set up." };
    return { rows: [], error: "The leaderboard did not load. Try again." };
  }
  if (!Array.isArray(data)) return { rows: [], error: null };
  const rows = data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<
      Record<"rank" | "display_name" | "percent" | "length" | "taken_at" | "is_self", unknown>
    >;
    const rank = asNumber(row.rank);
    const percent = asNumber(row.percent);
    const length = asNumber(row.length);
    if (rank === null || percent === null || length === null || typeof row.display_name !== "string") return [];
    const takenAt = typeof row.taken_at === "string" ? row.taken_at : null;
    return [
      {
        rank,
        displayName: row.display_name,
        percent,
        length,
        takenAt,
        isSelf: row.is_self === true,
      },
    ];
  });
  return { rows, error: null };
}
