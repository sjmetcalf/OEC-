import { useEffect, useState } from "react";
import {
  chapterById,
  chapters,
  questions,
  questionsIn,
  shuffle,
  type Question,
} from "./questions.ts";

type Mode = "study" | "exam";

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

const letters = ["A", "B", "C", "D"] as const;
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
  const [reading, setReading] = useState<string | null>(null);
  const [hideDistractors, setHideDistractors] = useState(false);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  function start(mode: Mode, source: Question[], title: string) {
    if (source.length === 0) return;
    setReading(null);
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

  function home() {
    setSession(null);
    setReading(null);
  }

  function choose(choice: number) {
    if (!session || session.finished) return;
    const current = session.items[session.index];
    if (!current) return;
    if (session.mode === "study" && session.revealed) return;

    const firstPick = session.picks[current.id] === undefined;
    const picks = { ...session.picks, [current.id]: choice };
    const revealed = session.mode === "study";
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

  const away = session !== null || reading !== null;

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-constrain">
          <button type="button" className="brand" onClick={home}>
            oec<span className="brand-tld">.fyi</span>
          </button>
          {away && (
            <button className="text-button" type="button" onClick={home}>
              Pool
            </button>
          )}
        </div>
      </header>
      <main>
        {session ? (
          <Quiz session={session} onChoose={choose} onNext={next} />
        ) : reading ? (
          <ReadPool
            chapterId={reading}
            hideDistractors={hideDistractors}
            onChapter={setReading}
            onToggleDistractors={() => setHideDistractors((value) => !value)}
            onStudy={(chapterId) => {
              const chapter = chapterById(chapterId);
              start("study", questionsIn(chapterId), chapter?.title ?? "Study");
            }}
          />
        ) : (
          <Home
            stats={stats}
            onStudy={() => start("study", questions, "Study")}
            onRead={() => setReading(chapters[0]?.id ?? "1")}
            onExam={() => start("exam", shuffle(questions).slice(0, 25), "Practice test")}
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
      <div>
        <p className="section-label">Outdoor Emergency Care</p>
        <h1>Practice pool</h1>
        <p className="lede">
          Study one question at a time, read a chapter with the answer showing, or take a practice test.
          811 questions from the public practice set, with answers from the review bank. Not the National Ski Patrol exam.
        </p>
        <div className="modes">
          <button type="button" className="mode" onClick={onStudy}>
            <strong>Study</strong>
            <span>One card at a time. The answer shows as soon as you pick.</span>
          </button>
          <button type="button" className="mode" onClick={onRead}>
            <strong>Read questions</strong>
            <span>Every question in a topic, with the correct answer marked.</span>
          </button>
          <button type="button" className="mode" onClick={onExam}>
            <strong>Practice test</strong>
            <span>25 mixed questions. Answers stay hidden until the end.</span>
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
      </div>
      <section className="progress-panel" aria-label="Progress by topic">
        <h2>Progress</h2>
        <p>Seen answers in each topic. Open a topic to read it.</p>
        <div className="chapter-list">
          {chapters.map((chapter) => {
            const pool = questionsIn(chapter.id);
            const known = pool.filter((question) => stats.results[question.id] === true).length;
            const seen = pool.filter((question) => stats.results[question.id] !== undefined).length;
            const width = pool.length === 0 ? 0 : Math.round((known / pool.length) * 100);
            return (
              <button key={chapter.id} type="button" className="chapter-row" onClick={() => onReadChapter(chapter.id)}>
                <span className="chapter-row-name">{chapter.title}</span>
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

function ReadPool({
  chapterId,
  hideDistractors,
  onChapter,
  onToggleDistractors,
  onStudy,
}: {
  chapterId: string;
  hideDistractors: boolean;
  onChapter: (chapterId: string) => void;
  onToggleDistractors: () => void;
  onStudy: (chapterId: string) => void;
}) {
  const chapter = chapterById(chapterId) ?? chapters[0];
  const pool = questionsIn(chapter.id);

  return (
    <section className="read">
      <div className="read-bar">
        <div className="read-tabs" role="tablist" aria-label="Topics">
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
        <div className="read-tools">
          <button type="button" className="ghost" onClick={onToggleDistractors}>
            {hideDistractors ? "Show choices" : "Hide distractors"}
          </button>
          <button type="button" className="primary" onClick={() => onStudy(chapter.id)}>
            Study this topic
          </button>
        </div>
      </div>
      <header className="read-head">
        <p className="section-label">{pool.length} questions</p>
        <h1>{chapter.title}</h1>
        <p className="lede">{chapter.summary}</p>
      </header>
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
      </section>
    );
  }

  const current = session.items[session.index];
  if (!current) return null;
  const pick = session.picks[current.id];
  const chapter = chapterById(current.chapter);
  const locked = session.mode === "study" && session.revealed;

  return (
    <section className="sheet quiz">
      <div className="progress">
        <span>
          {session.mode === "exam" ? "Practice test" : "Study"} · {chapter?.title}
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
              <span>{letters[index]}</span>
              {choice}
            </button>
          );
        })}
      </div>
      {session.revealed && current.explanation ? <p className="explain">{current.explanation}</p> : null}
      <div className="quiz-foot">
        <p>
          {session.mode === "exam"
            ? "Answers stay hidden until the end. Press 1–4, then Enter."
            : "Press 1–4 to answer. Enter for the next question."}
        </p>
        <button type="button" className="primary" disabled={pick === undefined} onClick={onNext}>
          {session.index === session.items.length - 1 ? "See results" : "Next"}
        </button>
      </div>
    </section>
  );
}
