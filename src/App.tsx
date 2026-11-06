import { useEffect, useState } from "react";
import {
  chapterById,
  chapters,
  questions,
  questionsIn,
  shuffle,
  type Question,
} from "./questions.ts";

type Mode = "drill" | "exam";

type Stats = {
  results: Record<string, boolean>;
};

type Session = {
  mode: Mode;
  title: string;
  items: Question[];
  index: number;
  picks: Record<string, number>;
  revealed: boolean;
  finished: boolean;
};

const emptyStats: Stats = { results: {} };
const storageKey = "oec-practice-v2";

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyStats;
    const parsed = JSON.parse(raw) as Stats;
    if (!parsed.results || typeof parsed.results !== "object") return emptyStats;
    return parsed;
  } catch {
    return emptyStats;
  }
}

function saveStats(stats: Stats) {
  localStorage.setItem(storageKey, JSON.stringify(stats));
}

function recordAnswer(id: string, correct: boolean) {
  const stats = loadStats();
  saveStats({ results: { ...stats.results, [id]: correct } });
}

function missedIds(stats: Stats): string[] {
  return Object.entries(stats.results)
    .filter(([, correct]) => !correct)
    .map(([id]) => id);
}

export default function App() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  function start(mode: Mode, source: Question[], title: string) {
    if (source.length === 0) return;
    setSession({
      mode,
      title,
      items: shuffle(source),
      index: 0,
      picks: {},
      revealed: false,
      finished: false,
    });
  }

  function choose(choice: number) {
    if (!session || session.finished) return;
    const current = session.items[session.index];
    if (!current) return;
    if (session.mode === "drill" && session.revealed) return;

    const firstPick = session.picks[current.id] === undefined;
    const picks = { ...session.picks, [current.id]: choice };
    const revealed = session.mode === "drill";
    if (revealed && firstPick) {
      recordAnswer(current.id, choice === current.answer);
      setStats(loadStats());
    }
    setSession({ ...session, picks, revealed });
  }

  function next() {
    if (!session) return;
    const current = session.items[session.index];
    if (!current || session.picks[current.id] === undefined) return;

    const last = session.index === session.items.length - 1;
    if (last) {
      if (session.mode === "exam") {
        for (const item of session.items) {
          recordAnswer(item.id, session.picks[item.id] === item.answer);
        }
        setStats(loadStats());
      }
      setSession({ ...session, finished: true, revealed: true });
      return;
    }

    setSession({ ...session, index: session.index + 1, revealed: false });
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-constrain">
          <button type="button" className="brand" onClick={() => setSession(null)}>
            oec<span className="brand-tld">.fyi</span>
          </button>
          {session && (
            <button className="text-button" type="button" onClick={() => setSession(null)}>
              All topics
            </button>
          )}
        </div>
      </header>
      <main>
        {session ? (
          <Quiz session={session} onChoose={choose} onNext={next} />
        ) : (
          <Home
            stats={stats}
            onStart={start}
            onRetry={() => {
              const missed = questions.filter((question) => missedIds(stats).includes(question.id));
              start("drill", missed, "Missed questions");
            }}
          />
        )}
      </main>
    </div>
  );
}

function Home({
  stats,
  onStart,
  onRetry,
}: {
  stats: Stats;
  onStart: (mode: Mode, source: Question[], title: string) => void;
  onRetry: () => void;
}) {
  const seen = Object.keys(stats.results).length;
  const correctCount = Object.values(stats.results).filter(Boolean).length;
  const missed = missedIds(stats);
  const accuracy = seen === 0 ? null : Math.round((correctCount / seen) * 100);

  return (
    <>
      <section className="hero">
        <div>
          <p className="section-label">Outdoor Emergency Care</p>
          <h1>Practice one decision at a time.</h1>
          <p className="lede">
            Drill a topic and see the reason immediately, or take a quiet exam and review at the end.
            Original questions, organized the way the course is taught. Not the National Ski Patrol exam.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => onStart("drill", shuffle(questions).slice(0, 10), "10-question drill")}>
              10-question drill
            </button>
            <button type="button" className="ghost" onClick={() => onStart("exam", shuffle(questions).slice(0, 25), "25-question exam")}>
              25-question exam
            </button>
          </div>
        </div>
        <dl className="stats">
          <div>
            <dt>Answered</dt>
            <dd>{seen}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{accuracy === null ? "—" : `${accuracy}%`}</dd>
          </div>
          <div>
            <dt>To review</dt>
            <dd>{missed.length}</dd>
          </div>
        </dl>
      </section>

      {missed.length > 0 && (
        <button type="button" className="review-banner" onClick={onRetry}>
          <span>Retry {missed.length} missed {missed.length === 1 ? "question" : "questions"}</span>
          <strong>Start</strong>
        </button>
      )}

      <section className="topics">
        <div className="section-head">
          <h2>Topics</h2>
          <p>{questions.length} practice questions. Pick a topic or run the whole set.</p>
        </div>
        <div className="grid">
          {chapters.map((chapter) => {
            const pool = questionsIn(chapter.id);
            const known = pool.filter((question) => stats.results[question.id] === true);
            const width = pool.length === 0 ? 0 : Math.round((known.length / pool.length) * 100);
            return (
              <article key={chapter.id} className="topic">
                <div>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.summary}</p>
                </div>
                <div className="topic-foot">
                  <div className="meter" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </div>
                  <div className="topic-meta">
                    <span>
                      {known.length}/{pool.length} solid
                    </span>
                    <button type="button" onClick={() => onStart("drill", pool, chapter.title)}>
                      Practice
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Quiz({
  session,
  onChoose,
  onNext,
}: {
  session: Session;
  onChoose: (choice: number) => void;
  onNext: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (session.finished) return;
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
      <section className="sheet result">
        <p className="eyebrow">{session.title}</p>
        <h1>
          {correct} <span>of {session.items.length}</span>
        </h1>
        <p className="lede">
          {correct === session.items.length
            ? "Every one. Run another topic while it is fresh."
            : "The misses are below, with the answer and the reason."}
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
                    <p className="answer-line">Answer: {item.choices[item.answer]}</p>
                    <p className="why">{item.explanation}</p>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  const current = session.items[session.index];
  if (!current) return null;
  const pick = session.picks[current.id];
  const chapter = chapterById(current.chapter);
  const locked = session.mode === "drill" && session.revealed;

  return (
    <section className="sheet quiz">
      <div className="progress">
        <span>
          {session.mode === "exam" ? "Exam" : "Drill"} · {chapter?.title}
        </span>
        <span>
          {session.index + 1} / {session.items.length}
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <span style={{ width: `${(session.index / session.items.length) * 100}%` }} />
      </div>
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
              <span>{index + 1}</span>
              {choice}
            </button>
          );
        })}
      </div>
      {session.revealed && <p className="explain">{current.explanation}</p>}
      <div className="quiz-foot">
        <p>{session.mode === "exam" ? "Answers stay hidden until the end. Press 1–4, then Enter." : "Press 1–4 to answer. Enter for the next question."}</p>
        <button type="button" className="primary" disabled={pick === undefined} onClick={onNext}>
          {session.index === session.items.length - 1 ? "See results" : "Next"}
        </button>
      </div>
    </section>
  );
}
