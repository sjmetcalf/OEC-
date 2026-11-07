import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Account from "./Account.tsx";
import AccountPage from "./AccountPage.tsx";
import { ThemeControl } from "./theme.tsx";
import { BackButton } from "./BackButton.tsx";
import { BlurText, CountUp } from "./bits.tsx";
import { Threads } from "./threads.tsx";
import { loadPracticeTests, practiceTestsSavedLocally, recordPracticeTest, syncPracticeTests, type PracticeTest } from "./exams.ts";
import {
  attemptCountsSavedLocally,
  chapterMeters,
  loadStats,
  lowerChapters,
  studyCoverage,
  mergeRemote,
  missedIds,
  recordLocal,
  recordRemote,
  recordRemoteMany,
  syncFailureMessage,
  type Attempt,
  type Stats,
} from "./progress.ts";
import {
  chapterById,
  chapters,
  questions,
  questionsIn,
  shuffle,
  type Question,
} from "./questions.ts";
import {
  clearChapter,
  ensureVisitor,
  linkVisitor,
  track,
  trackChapter,
  trackScreen,
  trackVisit,
  visitorId,
} from "./analytics.ts";
import { supabase } from "./supabase.ts";

type Mode = "study" | "exam" | "drill";

type ChoiceOrder = [number, number, number, number];

type Session = {
  mode: Mode;
  title: string;
  items: Question[];
  index: number;
  picks: Record<string, number>;
  orders: Record<string, ChoiceOrder>;
  revealed: boolean;
  finished: boolean;
  fromChapter?: string;
};

const letters = ["A", "B", "C", "D"] as const;
const straightOrder: ChoiceOrder = [0, 1, 2, 3];
const shuffleAnswersKey = "oec-shuffle-answers";

function readShuffleAnswers() {
  try {
    return localStorage.getItem(shuffleAnswersKey) === "1";
  } catch {
    return false;
  }
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledOrder(questionId: string, seed: number): ChoiceOrder {
  const order: ChoiceOrder = [0, 1, 2, 3];
  let state = (hashString(questionId) ^ seed) >>> 0;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = order[index]!;
    order[index] = order[swap]!;
    order[swap] = current;
  }
  return order;
}

function answerOrder(questionId: string, saved: ChoiceOrder | undefined, shuffleAnswers: boolean, seed: number): ChoiceOrder {
  if (saved) return saved;
  return shuffleAnswers ? shuffledOrder(questionId, seed) : straightOrder;
}
const examLengths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
type ExamLength = (typeof examLengths)[number];

function examLength(count: number): ExamLength | undefined {
  return examLengths.find((length) => length === count);
}
const emptyStats: Stats = { results: {}, owner: null, synced: null };

function scrollTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function continueDeck(items: Question[], avoidId: string): Question[] {
  const next = shuffle(items);
  if (next.length < 2 || next[0]?.id !== avoidId) return next;
  const swapAt = next.findIndex((item) => item.id !== avoidId);
  if (swapAt <= 0) return next;
  const copy = next.slice();
  const first = copy[0];
  copy[0] = copy[swapAt]!;
  copy[swapAt] = first!;
  return copy;
}

function deviceSaveNote(note: { tests: boolean; counts: boolean } | null) {
  if (!note) return null;
  if (note.tests && note.counts) return "Practice test scores and attempt totals are saved on this device.";
  if (note.tests) return "Practice test scores are saved on this device.";
  if (note.counts) return "Attempt totals are saved on this device.";
  return null;
}

export default function App() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [session, setSession] = useState<Session | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [pickingExam, setPickingExam] = useState(false);
  const [hideDistractors, setHideDistractors] = useState(false);
  const [shuffleAnswers, setShuffleAnswers] = useState(readShuffleAnswers);
  const [shuffleSeed, setShuffleSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState<"home" | "setup" | null>(null);
  const [deviceNote, setDeviceNote] = useState<{ tests: boolean; counts: boolean } | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const leaveTitleId = useId();

  function noteDeviceSave() {
    setDeviceNote({ tests: practiceTestsSavedLocally(), counts: attemptCountsSavedLocally() });
  }

  useEffect(() => {
    if (!supabase) {
      setStats(loadStats());
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event, authSession) => {
      const nextUser = authSession?.user ?? null;
      window.setTimeout(() => {
        userIdRef.current = nextUser?.id ?? null;
        setUserEmail(nextUser?.email ?? null);
        if (!nextUser) {
          setStats(loadStats());
          setTests(loadPracticeTests(null));
          setDeviceNote(null);
          return;
        }
        void linkVisitor();
        void syncPracticeTests(nextUser.id).then((rows) => {
          if (userIdRef.current === nextUser.id) {
            setTests(rows);
            noteDeviceSave();
          }
        });
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
          void mergeRemote(nextUser.id)
            .then((merged) => {
              if (userIdRef.current === nextUser.id) {
                setStats(merged);
                noteDeviceSave();
              }
            })
            .catch((error: unknown) => {
              setSyncError(syncFailureMessage(error));
              setStats(loadStats());
            });
        }
      }, 0);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  function remember(id: string, correct: boolean) {
    const owner = userIdRef.current;
    setStats(recordLocal(id, correct, owner));
    setSyncError(null);
    if (!owner) return;
    void recordRemote(owner, id, correct).catch((error: unknown) => {
      setSyncError(syncFailureMessage(error));
    });
  }

  function rememberMany(entries: Array<[string, boolean]>) {
    const owner = userIdRef.current;
    let next = loadStats();
    for (const [id, correct] of entries) next = recordLocal(id, correct, owner);
    setStats(next);
    setSyncError(null);
    if (!owner) return;
    void recordRemoteMany(owner, entries).catch((error: unknown) => {
      setSyncError(syncFailureMessage(error));
    });
  }

  async function signIn(email: string, password: string) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    void track("sign_in");
    void linkVisitor();
  }

  async function signUp(email: string, password: string) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    const origin = window.location.origin;
    const redirectTo =
      origin === "https://oec.fyi" || origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173"
        ? origin
        : "https://oec.fyi";
    await ensureVisitor();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { visitor_id: visitorId() },
      },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    void track("sign_up");
    if (!data.session) {
      setAuthNotice("Check your email to confirm the account, then sign in.");
    }
  }

  async function signOut() {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError(null);
    await track("sign_out");
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  }

  function start(mode: Mode, source: Question[], title: string, length?: ExamLength, fromChapter?: string) {
    if (source.length === 0) return;
    setReading(null);
    setPickingExam(false);
    setSession({
      mode,
      title,
      items: shuffle(source),
      index: 0,
      picks: {},
      orders: {},
      revealed: false,
      finished: false,
      fromChapter,
    });
    if (mode === "study" || mode === "drill") void track("study_start");
    if (mode === "exam" && length) void track("exam_start", { length });
    scrollTop();
  }

  function toggleShuffleAnswers() {
    const next = !shuffleAnswers;
    try {
      localStorage.setItem(shuffleAnswersKey, next ? "1" : "0");
    } catch {
      // The choice still applies for this visit.
    }
    if (next) setShuffleSeed(Math.floor(Math.random() * 0x7fffffff));
    setShuffleAnswers(next);
    setSession((current) => {
      if (!current || current.finished) return current;
      const question = current.items[current.index];
      if (!question || current.picks[question.id] !== undefined || !current.orders[question.id]) return current;
      const orders = { ...current.orders };
      delete orders[question.id];
      return { ...current, orders };
    });
  }

  useEffect(() => {
    if (!session || session.finished) return;
    const current = session.items[session.index];
    if (!current || session.orders[current.id]) return;
    const order = shuffleAnswers ? shuffledOrder(current.id, shuffleSeed) : straightOrder;
    setSession((existing) => {
      if (!existing || existing.finished) return existing;
      const question = existing.items[existing.index];
      if (!question || question.id !== current.id || existing.orders[question.id]) return existing;
      return { ...existing, orders: { ...existing.orders, [question.id]: order } };
    });
  }, [session, shuffleAnswers, shuffleSeed]);

  function home() {
    setSession(null);
    setReading(null);
    setPickingExam(false);
    setAccountOpen(false);
    scrollTop();
  }

  function backToChapter() {
    const chapterId = session?.fromChapter;
    if (!chapterId) return;
    setSession(null);
    setReading(chapterId);
    setPickingExam(false);
    scrollTop();
  }

  function backToExam() {
    setSession(null);
    setReading(null);
    setPickingExam(true);
    scrollTop();
  }

  function choose(choice: number) {
    if (!session || session.finished) return;
    const current = session.items[session.index];
    if (!current) return;
    const drilling = session.mode === "study" || session.mode === "drill";
    if (drilling && session.revealed) return;

    const firstPick = session.picks[current.id] === undefined;
    const picks = { ...session.picks, [current.id]: choice };
    if (drilling && firstPick) remember(current.id, choice === current.answer);
    setSession({ ...session, picks, revealed: drilling });
  }

  function next() {
    if (!session) return;
    const current = session.items[session.index];
    if (!current || session.picks[current.id] === undefined) return;

    const last = session.index === session.items.length - 1;
    scrollTop();
    if (last && session.mode === "drill") {
      if (shuffleAnswers) setShuffleSeed(Math.floor(Math.random() * 0x7fffffff));
      setSession({
        ...session,
        items: continueDeck(session.items, current.id),
        index: 0,
        picks: {},
        orders: {},
        revealed: false,
        finished: false,
      });
      return;
    }
    if (last) {
      if (session.mode === "exam") {
        const correct = session.items.filter((item) => session.picks[item.id] === item.answer).length;
        rememberMany(session.items.map((item) => [item.id, session.picks[item.id] === item.answer]));
        void track("exam_finish");
        const owner = userIdRef.current;
        void recordPracticeTest({ length: session.items.length, correct }, owner)
          .then((rows) => {
            if (userIdRef.current === owner) {
              setTests(rows);
              noteDeviceSave();
            }
          })
          .catch((error: unknown) => {
            if (userIdRef.current === owner) setTests(loadPracticeTests(owner));
            setSyncError(syncFailureMessage(error));
          });
      }
      setSession({ ...session, finished: true, revealed: true });
      return;
    }

    setSession({ ...session, index: session.index + 1, revealed: false });
  }

  useEffect(() => {
    if (!leaveTo) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLeaveTo(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaveTo]);

  const screen = session?.finished
    ? "results"
    : session?.mode === "study" || session?.mode === "drill"
      ? "study"
      : session?.mode === "exam"
        ? "exam"
        : reading
          ? "read"
          : pickingExam
            ? "exam-setup"
            : "home";

  useEffect(() => {
    trackVisit();
  }, []);

  useEffect(() => {
    trackScreen(screen);
  }, [screen]);

  useEffect(() => {
    if (reading) trackChapter(reading);
    else clearChapter();
  }, [reading]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-constrain">
          <div className="topbar-lead">
            <button
              type="button"
              className="brand"
              onClick={() => {
                if (session?.mode === "exam" && !session.finished) setLeaveTo("home");
                else home();
              }}
            >
              oec<span className="brand-tld">.fyi</span>
            </button>
          </div>
          <div className="topbar-actions">
            <ThemeControl />
            {supabase && (
              <Account
                email={userEmail}
                busy={authBusy}
                notice={authNotice}
                error={authError}
                onSignIn={signIn}
                onSignUp={signUp}
                onOpen={() => {
                  setAccountOpen(true);
                  scrollTop();
                }}
                onClearFeedback={() => {
                  setAuthError(null);
                  setAuthNotice(null);
                }}
              />
            )}
          </div>
        </div>
      </header>
      <main
        className={session || pickingExam ? "is-quiz" : reading ? "is-reading" : undefined}
      >
        {syncError && (session || reading || pickingExam || accountOpen) ? (
          <p className="sync-error" role="alert">
            Progress did not save. {syncError}
          </p>
        ) : null}
        {accountOpen && userEmail ? (
          <AccountPage
            email={userEmail}
            tests={tests}
            aptitude={
              chapterMeters(
                questions.map((question) => stats.results[question.id]),
                questions.length,
              ).aptitude
            }
            coverage={studyCoverage(stats.results, questions)}
            lower={lowerChapters(stats.results, questions).map((chapter) => ({
              ...chapter,
              title: chapterById(chapter.id)?.title ?? chapter.id,
            }))}
            deviceNote={deviceSaveNote(deviceNote)}
            busy={authBusy}
            onBack={() => {
              setAccountOpen(false);
              scrollTop();
            }}
            onStudyChapter={(chapterId) => {
              const chapter = chapterById(chapterId);
              setAccountOpen(false);
              start("drill", questionsIn(chapterId), chapter?.title ?? "Study", undefined, chapterId);
            }}
            onSignOut={() => {
              setAccountOpen(false);
              void signOut();
            }}
          />
        ) : session ? (
          <Quiz
            session={session}
            stats={stats}
            shuffleAnswers={shuffleAnswers}
            shuffleSeed={shuffleSeed}
            onToggleShuffle={toggleShuffleAnswers}
            onChoose={choose}
            onNext={next}
            onBack={
              session.fromChapter
                ? backToChapter
                : session.mode === "exam" && !session.finished
                  ? () => setLeaveTo("setup")
                  : session.mode === "exam"
                    ? backToExam
                    : home
            }
          />
        ) : reading ? (
          <ReadPool
            chapterId={reading}
            stats={stats}
            hideDistractors={hideDistractors}
            shuffleAnswers={shuffleAnswers}
            shuffleSeed={shuffleSeed}
            onBack={home}
            onChapter={setReading}
            onToggleDistractors={() => setHideDistractors((value) => !value)}
            onToggleShuffle={toggleShuffleAnswers}
            onStudy={(chapterId) => {
              const chapter = chapterById(chapterId);
              start("drill", questionsIn(chapterId), chapter?.title ?? "Study", undefined, chapterId);
            }}
          />
        ) : pickingExam ? (
          <ExamLength
            onBack={home}
            shuffleAnswers={shuffleAnswers}
            onToggleShuffle={toggleShuffleAnswers}
            onExam={(count, chapterIds) => {
              const pool = chapterIds.flatMap((id) => questionsIn(id));
              start("exam", shuffle(pool).slice(0, count), `${count}-question practice test`, examLength(count));
            }}
          />
        ) : (
          <Home
            stats={stats}
            onStudy={() => start("study", questions, "All questions")}
            onRead={() => setReading(chapters[0]?.id ?? "1")}
            onExam={() => {
              setPickingExam(true);
              scrollTop();
            }}
            onReadChapter={setReading}
            onRetry={() => {
              const missed = questions.filter((question) => missedIds(stats).includes(question.id));
              start("study", missed, "Missed questions");
            }}
            syncError={syncError}
          />
        )}
      </main>
      {leaveTo ? (
        <div className="account-layer">
          <button className="account-backdrop" type="button" aria-label="Stay on this test" onClick={() => setLeaveTo(null)} />
          <div className="account-dialog leave-dialog" role="dialog" aria-labelledby={leaveTitleId}>
            <h2 id={leaveTitleId}>Leave this test?</h2>
            <p>It will not be saved.</p>
            <button className="primary account-choice" type="button" onClick={() => setLeaveTo(null)}>
              Stay
            </button>
            <button
              className="ghost account-choice"
              type="button"
              onClick={() => {
                const next = leaveTo;
                setLeaveTo(null);
                if (next === "home") home();
                else backToExam();
              }}
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function OfflineInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [saved, setSaved] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (!import.meta.env.PROD || installed || !("serviceWorker" in navigator)) return;
    setHidden(false);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    let cancel = false;
    function onPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    void navigator.serviceWorker.ready.then(() => {
      if (!cancel) setSaved(true);
    });
    return () => {
      cancel = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (hidden) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
  }

  return (
    <p className="offline-note">
      <span>{saved ? "Questions are saved on this device." : "Saving the questions on this device."}</span>
      {prompt ? (
        <button type="button" className="offline-install" onClick={() => void install()}>
          Install
        </button>
      ) : ios ? (
        <span>Add to Home Screen to open it like an app.</span>
      ) : null}
    </p>
  );
}

function useModeGlow(rootRef: { current: HTMLDivElement | null }) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let raf = 0;
    let last = 0;
    const pointer = { x: -1e5, y: -1e5, live: false };
    const light = { x: -1e5, y: -1e5, ready: false, near: 0 };
    const heat = new WeakMap<HTMLElement, number>();

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const bounds = root.getBoundingClientRect();
      const margin = 150;
      const nearTarget =
        pointer.live &&
        pointer.x > bounds.left - margin &&
        pointer.x < bounds.right + margin &&
        pointer.y > bounds.top - margin &&
        pointer.y < bounds.bottom + margin
          ? 1
          : 0;
      if (!light.ready && nearTarget) {
        light.x = pointer.x;
        light.y = pointer.y;
        light.ready = true;
      }
      light.x += (pointer.x - light.x) * (1 - Math.exp(-dt / 0.05));
      light.y += (pointer.y - light.y) * (1 - Math.exp(-dt / 0.05));
      light.near += (nearTarget - light.near) * (1 - Math.exp(-dt / (nearTarget > light.near ? 0.12 : 0.4)));
      let busy =
        Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.3 || Math.abs(nearTarget - light.near) > 0.002;
      if (Math.abs(nearTarget - light.near) < 0.002) light.near = nearTarget;

      root.querySelectorAll<HTMLElement>(".mode").forEach((card) => {
        const rect = card.getBoundingClientRect();
        const px = pointer.x - rect.left;
        const py = pointer.y - rect.top;
        const inside = pointer.live && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;
        const target = inside ? 1 : 0;
        const current = heat.get(card) ?? 0;
        let next = current + (target - current) * (1 - Math.exp(-dt / (target > current ? 0.14 : 0.32)));
        if (Math.abs(target - next) < 0.002) next = target;
        else busy = true;
        heat.set(card, next);
        card.style.setProperty("--mode-x", `${(light.x - rect.left).toFixed(1)}px`);
        card.style.setProperty("--mode-y", `${(light.y - rect.top).toFixed(1)}px`);
        card.style.setProperty("--mode-near", light.near.toFixed(3));
        card.style.setProperty("--mode-hot", next.toFixed(3));
      });

      if (busy) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.live = true;
      wake();
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (event.relatedTarget) return;
      pointer.live = false;
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave);
    };
  }, [rootRef]);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ChapterMeter({ percent }: { percent: number }) {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" && prefersReducedMotion() ? percent : 0,
  );

  useEffect(() => {
    if (prefersReducedMotion() || percent === 0) {
      setWidth(percent);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - progress) ** 3;
      setWidth(percent * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${width}%`, transition: "none" }} />
    </span>
  );
}

function Home({
  stats,
  onStudy,
  onRead,
  onExam,
  onReadChapter,
  onRetry,
  syncError,
}: {
  stats: Stats;
  onStudy: () => void;
  onRead: () => void;
  onExam: () => void;
  onReadChapter: (chapterId: string) => void;
  onRetry: () => void;
  syncError: string | null;
}) {
  const missed = missedIds(stats);
  const modesRef = useRef<HTMLDivElement>(null);
  useModeGlow(modesRef);

  return (
    <div className="pool">
      <div className="snowfield" aria-hidden="true">
        <Threads
          color="#a855f7"
          midColor="#e879f9"
          accentColor="#fb7185"
          distance={1.4}
          split={0.18}
          waves={2.4}
          thickness={0.8}
          softness={0}
          amplitude={0.8}
          speed={0.2}
          lineCount={77}
          taper={0.55}
          brightness={2}
          fadeLeft={0.46}
          opacity={0.68}
          enableMouseInteraction
        />
      </div>
      <header className="pool-intro">
        {syncError ? (
          <p className="sync-error" role="alert">
            Progress did not save. {syncError}
          </p>
        ) : null}
        <p className="section-label">Outdoor Emergency Care</p>
        <h1>
          <BlurText text="Practice" />
        </h1>
        <p className="lede">
          <CountUp to={questions.length} /> questions across the OEC chapters.
        </p>
        <OfflineInstall />
      </header>
      <div className="modes" ref={modesRef}>
        <button type="button" className="mode mode-study" onClick={onStudy}>
          <span className="mode-mark" aria-hidden="true" />
          <strong>All questions</strong>
          <span>
            <CountUp to={questions.length} /> questions, one at a time. The answer shows as soon as you pick.
          </span>
        </button>
        <button type="button" className="mode mode-chapter" onClick={onRead}>
          <span className="mode-mark" aria-hidden="true" />
          <strong>Chapter questions</strong>
          <span>Every question in one chapter, with the correct answer marked.</span>
        </button>
        <button type="button" className="mode mode-exam" onClick={onExam}>
          <span className="mode-mark" aria-hidden="true" />
          <strong>Practice test</strong>
          <span>Mixed questions. Answers stay hidden until the end.</span>
        </button>
      </div>
      {missed.length > 0 && (
        <button type="button" className="review-banner" onClick={onRetry}>
          <span>
            Study {missed.length} missed {missed.length === 1 ? "question" : "questions"}
          </span>
          <strong>Start</strong>
        </button>
      )}
      <section className="progress-panel" aria-label="Chapters">
        <div className="section-head">
          <h2>Chapters</h2>
          <p>Answered out of the total. Open a chapter to study its questions.</p>
        </div>
        <div className="chapter-list">
          {chapters.map((chapter) => {
            const pool = questionsIn(chapter.id);
            const known = pool.filter((question) => stats.results[question.id]?.last === true).length;
            const seen = pool.filter((question) => (stats.results[question.id]?.seen ?? 0) > 0).length;
            const width = pool.length === 0 ? 0 : Math.round((known / pool.length) * 100);
            const splitAt = chapter.title.indexOf(". ");
            const number = splitAt === -1 ? chapter.title : chapter.title.slice(0, splitAt + 1);
            const name = splitAt === -1 ? chapter.title : chapter.title.slice(splitAt + 2);
            return (
              <button key={chapter.id} type="button" className="chapter-row" onClick={() => onReadChapter(chapter.id)}>
                <span className="chapter-row-name">
                  <span className="chapter-row-num">{number}</span>
                  <span className="chapter-row-label">{name}</span>
                </span>
                <ChapterMeter percent={width} />
                <span className="chapter-row-count">
                  <CountUp to={seen} />/<CountUp to={pool.length} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ShuffleToggle({ pressed, onClick }: { pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className="shuffle-switch" role="switch" aria-checked={pressed} onClick={onClick}>
      <span className="shuffle-switch-label">Shuffle answers</span>
      <span className="shuffle-switch-track" aria-hidden="true">
        <span className="shuffle-switch-thumb" />
      </span>
    </button>
  );
}

function ExamLength({
  onBack,
  onExam,
  shuffleAnswers,
  onToggleShuffle,
}: {
  onBack: () => void;
  onExam: (count: number, chapterIds: string[]) => void;
  shuffleAnswers: boolean;
  onToggleShuffle: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(chapters.map((chapter) => chapter.id)));
  const [count, setCount] = useState(10);
  const poolSize = chapters.reduce(
    (total, chapter) => (selected.has(chapter.id) ? total + questionsIn(chapter.id).length : total),
    0,
  );
  const cap = poolSize >= 10 ? Math.min(100, Math.floor(poolSize / 10) * 10) : 0;
  const shown = cap === 0 ? 0 : Math.min(Math.max(10, count), cap);
  const sliderValue = shown === 0 ? 10 : shown;
  const fill = shown < 10 ? 0 : cap <= 10 ? 100 : ((shown - 10) / (cap - 10)) * 100;
  const questionWord = shown === 1 ? "question" : "questions";

  useEffect(() => {
    setCount((current) => {
      if (cap < 10) return current;
      const next = Math.min(cap, Math.max(10, Math.round(current / 10) * 10));
      return next === current ? current : next;
    });
  }, [cap]);

  function toggleChapter(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCount = selected.size;
  const chapterLabel =
    selectedCount === 0
      ? "At least one chapter is needed."
      : selectedCount === chapters.length
        ? "All chapters"
        : `${selectedCount} ${selectedCount === 1 ? "chapter" : "chapters"}`;

  return (
    <>
      <div className="drill-meta">
        <BackButton onClick={onBack} />
        <ShuffleToggle pressed={shuffleAnswers} onClick={onToggleShuffle} />
      </div>
      <section className="exam-setup">
      <header className="pool-intro">
        <p className="section-label">Practice test</p>
        <h1>Build a practice test</h1>
        <p className="lede">Mixed questions. Answers stay hidden until the end.</p>
      </header>
      <div className="exam-range">
        <p className="exam-count">
          <strong>{shown}</strong>
          <span>{questionWord}</span>
        </p>
        <input
          id="practice-length"
          className="exam-slider"
          type="range"
          min={10}
          max={cap < 10 ? 10 : cap}
          step={10}
          value={sliderValue}
          disabled={cap < 10}
          aria-label="Number of questions"
          aria-valuetext={`${shown} ${questionWord}`}
          style={{ "--fill": `${fill}%` } as CSSProperties}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            setCount(Math.min(Math.max(10, next), cap));
          }}
        />
      </div>
      <details className="exam-chapters-disclosure">
        <summary className="exam-chapters-summary" id={selectedCount === 0 ? "exam-chapter-hint" : undefined}>
          <span>{chapterLabel}</span>
        </summary>
        <div className="exam-chapters-panel">
          <div className="exam-tools">
            <button
              type="button"
              className="exam-tool"
              onClick={() => setSelected(new Set(chapters.map((chapter) => chapter.id)))}
            >
              All chapters
            </button>
            <button type="button" className="exam-tool" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className="exam-chapters" role="group" aria-label="Chapters">
            {chapters.map((chapter) => {
              const total = questionsIn(chapter.id).length;
              const on = selected.has(chapter.id);
              const splitAt = chapter.title.indexOf(". ");
              const number = splitAt === -1 ? chapter.title : chapter.title.slice(0, splitAt + 1);
              const name = splitAt === -1 ? chapter.title : chapter.title.slice(splitAt + 2);
              return (
                <button
                  key={chapter.id}
                  type="button"
                  className="exam-chapter"
                  aria-pressed={on}
                  onClick={() => toggleChapter(chapter.id)}
                >
                  <span className="exam-chapter-mark" aria-hidden="true" />
                  <span className="exam-chapter-name">
                    <span className="exam-chapter-num">{number}</span>
                    <span className="exam-chapter-label">{name}</span>
                  </span>
                  <span className="exam-chapter-count">{total}</span>
                </button>
              );
            })}
          </div>
        </div>
      </details>
      <button
        type="button"
        className="primary exam-start"
        disabled={selectedCount === 0 || shown < 10}
        aria-describedby={selectedCount === 0 ? "exam-chapter-hint" : undefined}
        onClick={() => {
          const chapterIds = chapters.map((chapter) => chapter.id).filter((id) => selected.has(id));
          onExam(shown, chapterIds);
        }}
      >
        Start practice test
      </button>
      </section>
    </>
  );
}

function ChoiceOption({
  letter,
  text,
  selected,
  correct,
  incorrect,
  disabled,
  onChoose,
}: {
  letter: string;
  text: string;
  selected?: boolean;
  correct?: boolean;
  incorrect?: boolean;
  disabled?: boolean;
  onChoose?: () => void;
}) {
  const className = ["choice", selected ? "selected" : "", correct ? "correct" : "", incorrect ? "incorrect" : ""]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <span>{letter}</span>
      {text}
    </>
  );
  if (onChoose) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={onChoose}>
        {body}
      </button>
    );
  }
  return <li className={className}>{body}</li>;
}

function ChapterStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="read-meter">
      <span className="read-meter-top">
        {label}
        <strong>{value}%</strong>
      </span>
      <span
        className="meter read-meter-bar"
        role="meter"
        aria-label={detail}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

function ReadPool({
  chapterId,
  stats,
  hideDistractors,
  shuffleAnswers,
  shuffleSeed,
  onBack,
  onChapter,
  onToggleDistractors,
  onToggleShuffle,
  onStudy,
}: {
  chapterId: string;
  stats: Stats;
  hideDistractors: boolean;
  shuffleAnswers: boolean;
  shuffleSeed: number;
  onBack: () => void;
  onChapter: (chapterId: string) => void;
  onToggleDistractors: () => void;
  onToggleShuffle: () => void;
  onStudy: (chapterId: string) => void;
}) {
  const chapter = chapterById(chapterId) ?? chapters[0];
  const pool = questionsIn(chapter.id);
  const meters = chapterMeters(
    pool.map((question) => stats.results[question.id]),
    pool.length,
  );
  const tabsRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  useEffect(() => {
    window.scrollTo(0, 0);
    const list = tabsRef.current;
    const tab = list?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const pad = 8;
    const left = tab.offsetLeft - pad;
    const right = tab.offsetLeft + tab.offsetWidth + pad;
    if (left < list.scrollLeft) list.scrollLeft = Math.max(0, left);
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [chapter.id]);

  useEffect(() => {
    const list = tabsRef.current;
    if (!list) return;
    const tabs = list;

    function updateEdges() {
      const max = tabs.scrollWidth - tabs.clientWidth;
      const left = tabs.scrollLeft > 4;
      const right = max - tabs.scrollLeft > 4;
      setEdges((current) => (current.left === left && current.right === right ? current : { left, right }));
    }

    updateEdges();
    const frame = requestAnimationFrame(updateEdges);
    tabs.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(tabs);
    return () => {
      cancelAnimationFrame(frame);
      tabs.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
  }, []);

  return (
    <section className="read">
      <div className={`read-bar${edges.left ? " fade-left" : ""}${edges.right ? " fade-right" : ""}`}>
        <div className="read-tabs" role="tablist" aria-label="Chapters" ref={tabsRef}>
          {chapters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === chapter.id}
              className={item.id === chapter.id ? "is-active" : ""}
              onClick={() => onChapter(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>
      <div className="drill-meta">
        <BackButton onClick={onBack} />
        <ShuffleToggle pressed={shuffleAnswers} onClick={onToggleShuffle} />
      </div>
      <header className="pool-intro">
        <h1>{chapter.title}</h1>
        {chapter.summary ? <p className="lede">{chapter.summary}</p> : null}
      </header>
      <div className="read-tools">
        <div className="read-actions">
          <button type="button" className="primary" onClick={() => onStudy(chapter.id)}>
            Study this chapter
          </button>
          <button type="button" className="ghost" aria-pressed={hideDistractors} onClick={onToggleDistractors}>
            {hideDistractors ? "Show choices" : "Hide distractors"}
          </button>
        </div>
        <div className="read-meters">
          <ChapterStat
            label="Aptitude"
            value={meters.aptitude}
            detail="Aptitude, correct attempts out of all attempts in this chapter"
          />
          <ChapterStat
            label="Seen"
            value={meters.seen}
            detail="Seen, questions with at least one attempt out of this chapter"
          />
        </div>
      </div>
      <div className="qlist">
        {pool.map((question, index) => (
          <article key={question.id} className="qcard">
            <p className="qid">
              {index + 1} / {pool.length}
            </p>
            <h2>{question.prompt}</h2>
            <ol className="choices">
              {answerOrder(question.id, undefined, shuffleAnswers, shuffleSeed).map((choiceIndex, displayIndex) => {
                const correct = choiceIndex === question.answer;
                if (hideDistractors && !correct) return null;
                return (
                  <ChoiceOption
                    key={choiceIndex}
                    letter={letters[displayIndex]}
                    text={question.choices[choiceIndex]}
                    correct={correct}
                  />
                );
              })}
            </ol>
            {question.explanation ? <p className="explain">{question.explanation}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function AttemptScore({ attempt }: { attempt: Attempt | undefined }) {
  if (!attempt || attempt.seen < 1) return null;
  const perfect = attempt.correct === attempt.seen;
  return (
    <p className={perfect ? "attempt-tally perfect" : "attempt-tally"} aria-label={`${attempt.correct} correct of ${attempt.seen}`}>
      <strong>
        {attempt.correct}
        <span>/{attempt.seen}</span>
      </strong>
      correct
    </p>
  );
}

function Quiz({
  session,
  stats,
  shuffleAnswers,
  shuffleSeed,
  onToggleShuffle,
  onChoose,
  onNext,
  onBack,
}: {
  session: Session;
  stats: Stats;
  shuffleAnswers: boolean;
  shuffleSeed: number;
  onToggleShuffle: () => void;
  onChoose: (choice: number) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (session.finished || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".quiz-back, .shuffle-switch")) return;
      const current = session.items[session.index];
      const number = Number(event.key);
      if (current && number >= 1 && number <= 4 && !event.repeat) {
        const order = answerOrder(current.id, session.orders[current.id], shuffleAnswers, shuffleSeed);
        const choice = order[number - 1];
        if (choice !== undefined) onChoose(choice);
      }
      if (event.key === "Enter") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChoose, onNext, session.finished, session.index, session.items, session.orders, session.picks, shuffleAnswers, shuffleSeed]);

  if (session.finished) {
    const correct = session.items.filter((item) => session.picks[item.id] === item.answer).length;
    return (
      <section className="quiz">
        {onBack ? (
          <div className="drill-meta">
            <BackButton onClick={onBack} />
          </div>
        ) : null}
        <div className="sheet result">
        <p className="section-label">{session.title}</p>
        <h1>
          {correct} <span>of {session.items.length}</span>
        </h1>
        <p className="lede">
          {correct === session.items.length
            ? "Every one. Run another topic while it is fresh."
            : "The misses are below, with the correct answer."}
        </p>
        <ol className="review">
          {session.items.map((item, index) => {
            const pick = session.picks[item.id];
            const right = pick === item.answer;
            const chapter = chapterById(item.chapter);
            return (
              <li key={item.id} className={right ? "right" : "wrong"}>
                <div className="review-top">
                  <span>
                    {index + 1}. {chapter?.title}
                  </span>
                  <strong>{right ? "Correct" : "Review"}</strong>
                </div>
                <p>{item.prompt}</p>
                {!right && (
                  <>
                    <p className="answer-line">
                      Answer: {letters[answerOrder(item.id, session.orders[item.id], false, 0).indexOf(item.answer)]}.{" "}
                      {item.choices[item.answer]}
                    </p>
                    {item.explanation ? <p className="why">{item.explanation}</p> : null}
                  </>
                )}
              </li>
            );
          })}
        </ol>
        </div>
      </section>
    );
  }

  const current = session.items[session.index];
  if (!current) return null;
  const pick = session.picks[current.id];
  const chapter = chapterById(current.chapter);
  const drilling = session.mode === "drill";
  const locked = (session.mode === "study" || drilling) && session.revealed;
  const label = drilling
    ? session.title
    : `${session.mode === "exam" ? "Practice test" : session.title === "All questions" ? session.title : "Study"} · ${chapter?.title}`;

  return (
    <section className="quiz">
      {onBack ? (
        <div className="drill-meta">
          <BackButton onClick={onBack} />
          <ShuffleToggle pressed={shuffleAnswers} onClick={onToggleShuffle} />
        </div>
      ) : null}
      <article key={current.id} className="qcard">
        {drilling ? null : (
          <>
            <div className="progress">
              <span>{label}</span>
              <span>
                {session.index + 1} / {session.items.length}
              </span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${(session.index / session.items.length) * 100}%` }} />
            </div>
          </>
        )}
        <h1>{current.prompt}</h1>
        <div className="choices">
          {answerOrder(current.id, session.orders[current.id], shuffleAnswers, shuffleSeed).map((choiceIndex, displayIndex) => {
            const selected = pick === choiceIndex;
            const correct = session.revealed && choiceIndex === current.answer;
            const incorrect = session.revealed && selected && choiceIndex !== current.answer;
            return (
              <ChoiceOption
                key={choiceIndex}
                letter={letters[displayIndex]}
                text={current.choices[choiceIndex]}
                selected={selected}
                correct={correct}
                incorrect={incorrect}
                disabled={locked}
                onChoose={() => onChoose(choiceIndex)}
              />
            );
          })}
        </div>
        {session.revealed && current.explanation ? <p className="explain">{current.explanation}</p> : null}
        <div className={drilling ? "quiz-foot drill-foot" : "quiz-foot"}>
          {drilling ? (
            <AttemptScore attempt={stats.results[current.id]} />
          ) : (
            <p className="quiz-hint">
              {session.mode === "exam"
                ? "Answers stay hidden until the end. Press 1–4, then Enter."
                : "Press 1–4 to answer. Enter for the next question."}
            </p>
          )}
          <button type="button" className="primary" disabled={pick === undefined} onClick={onNext}>
            {drilling || session.index !== session.items.length - 1 ? "Next" : "See results"}
          </button>
        </div>
      </article>
    </section>
  );
}
