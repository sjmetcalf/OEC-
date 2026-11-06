import { supabase } from "./supabase.ts";

const visitorKey = "oec.visitor";
const visitKey = "oec.visit";

export const screens = ["home", "study", "exam", "read", "exam-setup", "results"] as const;
export type ScreenName = (typeof screens)[number];

export type AnalyticsEvent =
  | "visit"
  | "page_view"
  | "sign_up"
  | "sign_in"
  | "sign_out"
  | "study_start"
  | "exam_start"
  | "exam_finish"
  | "chapter_open";

type EventProperties = {
  screen?: ScreenName;
  length?: number;
  chapter?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memoryVisitor: string | null = null;
let visitorReady: Promise<boolean> | null = null;
let visitStarted = false;
let lastScreen: ScreenName | null = null;
let lastChapter: string | null = null;

function warn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("analytics", message);
}

export function visitorId(): string {
  try {
    const existing = localStorage.getItem(visitorKey);
    if (existing && uuidPattern.test(existing)) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(visitorKey, next);
    return next;
  } catch (error) {
    warn(error);
    memoryVisitor ??= crypto.randomUUID();
    return memoryVisitor;
  }
}

async function registerVisitor(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("visitors").insert({ id: visitorId() });
    if (!error || error.code === "23505") return true;
    warn(error.message);
    return false;
  } catch (error) {
    warn(error);
    return false;
  }
}

export function ensureVisitor(): Promise<boolean> {
  if (!supabase) return Promise.resolve(false);
  if (visitorReady) return visitorReady;
  const pending = registerVisitor().then((saved) => {
    if (!saved) visitorReady = null;
    return saved;
  });
  visitorReady = pending;
  return pending;
}

export async function track(name: AnalyticsEvent, properties: EventProperties = {}): Promise<boolean> {
  try {
    if (!supabase) return false;
    await ensureVisitor();
    const { data } = await supabase.auth.getSession();
    const payload = { ...properties };
    if (name === "exam_start") {
      const length = payload.length;
      if (length === undefined || !Number.isInteger(length) || length < 1 || length > 100) return false;
    }
    const { error } = await supabase.from("events").insert({
      visitor_id: visitorId(),
      user_id: data.session?.user.id ?? null,
      name,
      properties: payload,
    });
    if (error) {
      warn(error.message);
      return false;
    }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export function trackVisit() {
  try {
    if (visitStarted || sessionStorage.getItem(visitKey) === "1") return;
  } catch (error) {
    warn(error);
    if (visitStarted) return;
  }
  visitStarted = true;
  void track("visit").then((saved) => {
    if (!saved) {
      visitStarted = false;
      return;
    }
    try {
      sessionStorage.setItem(visitKey, "1");
    } catch (error) {
      warn(error);
    }
  });
}

export function trackScreen(screen: ScreenName) {
  if (lastScreen === screen) return;
  lastScreen = screen;
  void track("page_view", { screen });
}

export function trackChapter(chapter: string) {
  if (!/^[0-9]{1,2}$/.test(chapter) || lastChapter === chapter) return;
  lastChapter = chapter;
  void track("chapter_open", { chapter });
}

export function clearChapter() {
  lastChapter = null;
}

export async function linkVisitor() {
  try {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await ensureVisitor();
    const { error } = await supabase.rpc("link_visitor", { p_visitor: visitorId() });
    if (error) warn(error.message);
  } catch (error) {
    warn(error);
  }
}
