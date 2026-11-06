import { useEffect, useRef, useState, type CSSProperties } from "react";
import Account from "./Account.tsx";
import {
  attemptTally,
  chapterMeters,
  loadStats,
  mergeRemote,
  missedIds,
  recordLocal,
  recordRemote,
  recordRemoteMany,
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

type Session = {
  mode: Mode;
  title: string;
  items: Question[];
  index: number;
  picks: Record<string, number>;
  revealed: boolean;
  finished: boolean;
  fromChapter?: string;
};

const letters = ["A", "B", "C", "D"] as const;
const examLengths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
type ExamLength = (typeof examLengths)[number];

function examLength(count: number): ExamLength | undefined {
  return examLengths.find((length) => length === count);
}
const emptyStats: Stats = { results: {}, owner: null };

function scrollTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="quiz-back" onClick={onClick}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M10.25 3.5 5.75 8l4.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </button>
  );
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

export default function App() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [session, setSession] = useState<Session | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [pickingExam, setPickingExam] = useState(false);
  const [hideDistractors, setHideDistractors] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

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
          return;
        }
        void linkVisitor();
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
          void mergeRemote(nextUser.id)
            .then((merged) => {
              if (userIdRef.current === nextUser.id) setStats(merged);
            })
            .catch((error: unknown) => {
              setSyncError(error instanceof Error ? error.message : "Could not sync progress.");
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
      setSyncError(error instanceof Error ? error.message : "Could not sync progress.");
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
      setSyncError(error instanceof Error ? error.message : "Could not sync progress.");
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
      revealed: false,
      finished: false,
      fromChapter,
    });
    if (mode === "study" || mode === "drill") void track("study_start");
    if (mode === "exam" && length) void track("exam_start", { length });
    scrollTop();
  }

  function home() {
    setSession(null);
    setReading(null);
    setPickingExam(false);
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
      setSession({
        ...session,
        items: continueDeck(session.items, current.id),
        index: 0,
        picks: {},
        revealed: false,
        finished: false,
      });
      return;
    }
    if (last) {
      if (session.mode === "exam") {
        rememberMany(session.items.map((item) => [item.id, session.picks[item.id] === item.answer]));
        void track("exam_finish");
      }
      setSession({ ...session, finished: true, revealed: true });
      return;
    }

    setSession({ ...session, index: session.index + 1, revealed: false });
  }

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
            <button type="button" className="brand" onClick={home}>
              oec<span className="brand-tld">.fyi</span>
            </button>
          </div>
          <div className="topbar-actions">
            {supabase && (
              <Account
                email={userEmail}
                busy={authBusy}
                notice={authNotice}
                error={authError}
                onSignIn={signIn}
                onSignUp={signUp}
                onSignOut={signOut}
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
        {syncError ? (
          <p className="sync-error" role="alert">
            Progress did not save. {syncError}
          </p>
        ) : null}
        {session ? (
          <Quiz
            session={session}
            stats={stats}
            onChoose={choose}
            onNext={next}
            onBack={session.fromChapter ? backToChapter : session.mode === "exam" ? backToExam : home}
          />
        ) : reading ? (
          <ReadPool
            chapterId={reading}
            stats={stats}
            hideDistractors={hideDistractors}
            onBack={home}
            onChapter={setReading}
            onToggleDistractors={() => setHideDistractors((value) => !value)}
            onStudy={(chapterId) => {
              const chapter = chapterById(chapterId);
              start("drill", questionsIn(chapterId), chapter?.title ?? "Study", undefined, chapterId);
            }}
          />
        ) : pickingExam ? (
          <ExamLength
            onBack={home}
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
          />
        )}
      </main>
    </div>
  );
}

function Home({
  stats,
  onStudy,
  onRead,
  onExam,
  onReadChapter,
  onRetry,
}: {
  stats: Stats;
  onStudy: () => void;
  onRead: () => void;
  onExam: () => void;
  onReadChapter: (chapterId: string) => void;
  onRetry: () => void;
}) {
  const missed = missedIds(stats);

  return (
    <div className="pool">
      <div className="snowfield" aria-hidden="true">
        <span className="snow-blob snow-sky" />
        <span className="snow-blob snow-field" />
        <span className="snow-blob snow-ridge" />
        <span className="snow-blob snow-glow" />
      </div>
      <header className="pool-intro">
        <p className="section-label">Outdoor Emergency Care</p>
        <h1>Practice</h1>
        <p className="lede">811 questions across the OEC chapters.</p>
      </header>
      <div className="modes">
        <button type="button" className="mode" onClick={onStudy}>
          <strong>All questions</strong>
          <span>811 questions, one at a time. The answer shows as soon as you pick.</span>
        </button>
        <button type="button" className="mode" onClick={onRead}>
          <strong>Chapter questions</strong>
          <span>Every question in one chapter, with the correct answer marked.</span>
        </button>
        <button type="button" className="mode" onClick={onExam}>
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
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${width}%` }} />
                </span>
                <span className="chapter-row-count">
                  {seen}/{pool.length}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ExamLength({
  onBack,
  onExam,
}: {
  onBack: () => void;
  onExam: (count: number, chapterIds: string[]) => void;
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

function ChapterStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="read-meter">
      <div className="read-meter-top">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div
        className="meter read-meter-bar"
        role="meter"
        aria-label={detail}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReadPool({
  chapterId,
  stats,
  hideDistractors,
  onBack,
  onChapter,
  onToggleDistractors,
  onStudy,
}: {
  chapterId: string;
  stats: Stats;
  hideDistractors: boolean;
  onBack: () => void;
  onChapter: (chapterId: string) => void;
  onToggleDistractors: () => void;
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
            <ol className="qchoices">
              {question.choices.map((choice, choiceIndex) => {
                const correct = choiceIndex === question.answer;
                if (hideDistractors && !correct) return null;
                return (
                  <li key={choice} className={correct ? "correct" : ""}>
                    <span>{letters[choiceIndex]}</span>
                    {choice}
                  </li>
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

function Quiz({
  session,
  stats,
  onChoose,
  onNext,
  onBack,
}: {
  session: Session;
  stats: Stats;
  onChoose: (choice: number) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (session.finished) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".quiz-back")) return;
      const number = Number(event.key);
      if (number >= 1 && number <= 4) onChoose(number - 1);
      if (event.key === "Enter") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChoose, onNext, session.finished]);

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
                      Answer: {letters[item.answer]}. {item.choices[item.answer]}
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
        </div>
      ) : null}
      <article className="qcard">
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
          {current.choices.map((choice, index) => {
            const selected = pick === index;
            const correct = session.revealed && index === current.answer;
            const incorrect = session.revealed && selected && index !== current.answer;
            const className = ["choice", selected ? "selected" : "", correct ? "correct" : "", incorrect ? "incorrect" : ""]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={choice} type="button" className={className} disabled={locked} onClick={() => onChoose(index)}>
                <span>{letters[index]}</span>
                {choice}
              </button>
            );
          })}
        </div>
        {session.revealed && current.explanation ? <p className="explain">{current.explanation}</p> : null}
        <div className={drilling ? "quiz-foot drill-foot" : "quiz-foot"}>
          {drilling ? (
            <p className="attempt-tally">{attemptTally(stats.results[current.id])}</p>
          ) : (
            <p>
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
