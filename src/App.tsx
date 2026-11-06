import { useEffect, useMemo, useState } from "react";
import {
  questions,
  questionsForTopic,
  shuffle,
  topics,
  type Question,
  type Topic,
} from "./questions.ts";

type Mode = "drill" | "exam";
type TopicFilter = Topic | "All";

type Stats = {
  seen: number;
  correct: number;
  missed: string[];
};

type Session = {
  mode: Mode;
  items: Question[];
  index: number;
  picks: Record<string, number>;
  revealed: boolean;
  finished: boolean;
};

const emptyStats: Stats = { seen: 0, correct: 0, missed: [] };
const storageKey = "oec-practice-stats";

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyStats;
    const parsed = JSON.parse(raw) as Stats;
    if (!Array.isArray(parsed.missed)) return emptyStats;
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
  const missed = stats.missed.filter((item) => item !== id);
  if (!correct) missed.push(id);
  saveStats({
    seen: stats.seen + 1,
    correct: stats.correct + (correct ? 1 : 0),
    missed,
  });
}

export default function App() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [topic, setTopic] = useState<TopicFilter>("All");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  const pool = useMemo(() => questionsForTopic(topic), [topic]);

  function start(mode: Mode, source: Question[] = pool, count = source.length) {
    const items = shuffle(source).slice(0, Math.min(count, source.length));
    if (items.length === 0) return;
    setSession({
      mode,
      items,
      index: 0,
      picks: {},
      revealed: false,
      finished: false,
    });
  }

  function choose(choice: number) {
    if (!session || session.finished) return;
    const current = session.items[session.index];
    if (session.mode === "drill" && session.revealed) return;
    if (session.mode === "exam" && session.picks[current.id] !== undefined) return;

    const picks = { ...session.picks, [current.id]: choice };
    const revealed = session.mode === "drill";
    if (revealed && session.picks[current.id] === undefined) {
      recordAnswer(current.id, choice === current.answer);
      setStats(loadStats());
    }
    setSession({ ...session, picks, revealed });
  }

  function next() {
    if (!session) return;
    const current = session.items[session.index];
    const pick = session.picks[current.id];
    if (pick === undefined) return;

    if (session.mode === "exam" && session.index === session.items.length - 1) {
      for (const item of session.items) {
        recordAnswer(item.id, session.picks[item.id] === item.answer);
      }
      setStats(loadStats());
      setSession({ ...session, finished: true, revealed: true });
      return;
    }

    if (session.index === session.items.length - 1) {
      setSession({ ...session, finished: true });
      return;
    }

    setSession({
      ...session,
      index: session.index + 1,
      revealed: false,
    });
  }

  function retryMissed() {
    const missed = questions.filter((question) => stats.missed.includes(question.id));
    start("drill", missed);
  }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Unofficial study tool</p>
            <strong>OEC Practice</strong>
          </div>
        </div>
        {session && (
          <button className="text-button" type="button" onClick={() => setSession(null)}>
            Back to start
          </button>
        )}
      </header>

      <main>
        {session ? (
          <Quiz session={session} onChoose={choose} onNext={next} />
        ) : (
          <Home
            topic={topic}
            poolCount={pool.length}
            stats={stats}
            onTopic={setTopic}
            onStart={start}
            onRetryMissed={retryMissed}
          />
        )}
      </main>
    </div>
  );
}

function Home({
  topic,
  poolCount,
  stats,
  onTopic,
  onStart,
  onRetryMissed,
}: {
  topic: TopicFilter;
  poolCount: number;
  stats: Stats;
  onTopic: (topic: TopicFilter) => void;
  onStart: (mode: Mode, source?: Question[], count?: number) => void;
  onRetryMissed: () => void;
}) {
  const accuracy = stats.seen === 0 ? 0 : Math.round((stats.correct / stats.seen) * 100);

  return (
    <div className="home">
      <section className="intro">
        <p className="eyebrow">Outdoor Emergency Care</p>
        <h1>Practice the decisions you will make on the hill.</h1>
        <p className="lede">
          Twenty-four original questions across scene size-up, assessment, trauma,
          medical problems, and the environment. This is study material, not the
          National Ski Patrol exam and not a certification.
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => onStart("drill", undefined, 10)}>
            10-question drill
          </button>
          <button type="button" className="secondary" onClick={() => onStart("exam", undefined, 20)}>
            20-question exam
          </button>
          <button
            type="button"
            className="secondary"
            disabled={poolCount === 0}
            onClick={() => onStart("drill")}
          >
            Drill this topic ({poolCount})
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Topic</h2>
        <div className="topics">
          <TopicButton current={topic} value="All" onTopic={onTopic} />
          {topics.map((item) => (
            <TopicButton key={item} current={topic} value={item} onTopic={onTopic} />
          ))}
        </div>
        <dl className="stats">
          <div>
            <dt>Answered</dt>
            <dd>{stats.seen}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{stats.seen === 0 ? "—" : `${accuracy}%`}</dd>
          </div>
          <div>
            <dt>To review</dt>
            <dd>{stats.missed.length}</dd>
          </div>
        </dl>
        {stats.missed.length > 0 && (
          <button type="button" className="secondary wide" onClick={onRetryMissed}>
            Retry missed questions
          </button>
        )}
      </section>
    </div>
  );
}

function TopicButton({
  current,
  value,
  onTopic,
}: {
  current: TopicFilter;
  value: TopicFilter;
  onTopic: (topic: TopicFilter) => void;
}) {
  return (
    <button
      type="button"
      className={current === value ? "chip on" : "chip"}
      onClick={() => onTopic(value)}
    >
      {value}
    </button>
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
  if (session.finished) {
    const correct = session.items.filter((item) => session.picks[item.id] === item.answer).length;
    return (
      <section className="quiz">
        <p className="eyebrow">{session.mode === "exam" ? "Exam" : "Drill"} complete</p>
        <h1>
          {correct} of {session.items.length}
        </h1>
        <p className="lede">
          {correct === session.items.length
            ? "Clean run. Try another set, or switch topics."
            : "Review the ones you missed, then run them again."}
        </p>
        <ol className="review">
          {session.items.map((item, index) => {
            const pick = session.picks[item.id];
            const right = pick === item.answer;
            return (
              <li key={item.id} className={right ? "right" : "wrong"}>
                <span>
                  {index + 1}. {item.prompt}
                </span>
                <strong>{right ? "Correct" : item.choices[item.answer]}</strong>
                {!right && <p>{item.explanation}</p>}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  const current = session.items[session.index];
  const pick = session.picks[current.id];
  const locked = session.mode === "drill" ? session.revealed : pick !== undefined;

  return (
    <section className="quiz">
      <div className="progress">
        <span>
          {session.mode === "exam" ? "Exam" : "Drill"} · {current.topic}
        </span>
        <span>
          {session.index + 1} / {session.items.length}
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <span style={{ width: `${((session.index + (pick === undefined ? 0 : 1)) / session.items.length) * 100}%` }} />
      </div>
      <h1>{current.prompt}</h1>
      <div className="choices" role="listbox" aria-label="Answers">
        {current.choices.map((choice, index) => {
          const selected = pick === index;
          const correct = session.revealed && index === current.answer;
          const incorrect = session.revealed && selected && index !== current.answer;
          const className = ["choice", selected ? "selected" : "", correct ? "correct" : "", incorrect ? "incorrect" : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={choice}
              type="button"
              className={className}
              disabled={locked && session.mode === "drill"}
              onClick={() => onChoose(index)}
            >
              <span>{String.fromCharCode(65 + index)}</span>
              {choice}
            </button>
          );
        })}
      </div>
      {session.revealed && <p className="explain">{current.explanation}</p>}
      <div className="actions">
        <button type="button" className="primary" disabled={pick === undefined} onClick={onNext}>
          {session.index === session.items.length - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </section>
  );
}
