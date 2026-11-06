import { BackButton } from "./BackButton.tsx";
import { scorePercent, type PracticeTest } from "./exams.ts";
import type { StudyCoverage } from "./progress.ts";

const examLine = 80;

function ScoreChart({ tests }: { tests: PracticeTest[] }) {
  const width = 640;
  const height = 220;
  const pad = { left: 36, right: 16, top: 16, bottom: 28 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const y = (percent: number) => pad.top + ((100 - percent) / 100) * innerHeight;
  const x = (index: number) =>
    tests.length <= 1 ? pad.left + innerWidth / 2 : pad.left + (index / (tests.length - 1)) * innerWidth;
  const points = tests.map((test, index) => ({ x: x(index), y: y(scorePercent(test)), percent: scorePercent(test) }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const label =
    tests.length === 0
      ? "No finished practice tests yet. The dashed line is the 80 percent exam line."
      : tests.map((test, index) => `Test ${index + 1}, ${scorePercent(test)} percent`).join(". ");

  return (
    <svg className="score-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {[0, examLine, 100].map((mark) => (
        <g key={mark}>
          <line
            className={mark === examLine ? "score-chart-ref" : "score-chart-grid"}
            x1={pad.left}
            x2={width - pad.right}
            y1={y(mark)}
            y2={y(mark)}
          />
          <text className="score-chart-label" x={pad.left - 8} y={y(mark) + 4} textAnchor="end">
            {mark}
          </text>
        </g>
      ))}
      {points.length > 1 ? <path className="score-chart-line" d={line} /> : null}
      {points.map((point, index) => (
        <circle
          key={tests[index]?.id ?? index}
          className={point.percent >= examLine ? "score-chart-point" : "score-chart-point is-under"}
          cx={point.x}
          cy={point.y}
          r={5}
        />
      ))}
    </svg>
  );
}

export default function AccountPage({
  email,
  tests,
  aptitude,
  coverage,
  busy,
  onBack,
  onSignOut,
}: {
  email: string;
  tests: PracticeTest[];
  aptitude: number;
  coverage: StudyCoverage;
  busy: boolean;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const percents = tests.map(scorePercent);
  const recent = percents.at(-1);
  const best = percents.length > 0 ? Math.max(...percents) : null;
  const average = percents.length > 0 ? Math.round(percents.reduce((sum, percent) => sum + percent, 0) / percents.length) : null;
  const seenPercent = coverage.total === 0 ? 0 : Math.round((coverage.seen / coverage.total) * 100);
  const readiness =
    recent === undefined
      ? "Finish a practice test to see a score against the exam line."
      : recent >= examLine
        ? "Your last test clears the exam line."
        : "Your last test is under the exam line.";

  return (
    <section className="account-page">
      <div className="drill-meta">
        <BackButton onClick={onBack} />
      </div>
      <header className="pool-intro">
        <p className="section-label">Account</p>
        <h1>Your practice</h1>
        <p className="lede">{email}</p>
      </header>
      <div className="account-stats">
        <article className="account-card">
          <header className="account-card-head">
            <h2>Aptitude</h2>
            <p>Correct answers out of every try.</p>
          </header>
          <p className="account-hero">
            {aptitude}
            <span>%</span>
          </p>
          <div className="meter account-aptitude" role="meter" aria-label={`Aptitude ${aptitude}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={aptitude}>
            <span style={{ width: `${aptitude}%` }} />
          </div>
        </article>
        <article className="account-card">
          <header className="account-card-head">
            <h2>Practice tests</h2>
            <p>
              {tests.length} finished {tests.length === 1 ? "test" : "tests"}
            </p>
          </header>
          <div className="account-stat-row">
            <div>
              <span>Recent</span>
              <strong>{recent === undefined ? "—" : `${recent}%`}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{best === null ? "—" : `${best}%`}</strong>
            </div>
            <div>
              <span>Average</span>
              <strong>{average === null ? "—" : `${average}%`}</strong>
            </div>
          </div>
          <ScoreChart tests={tests} />
          <p className="account-caption">Dashed line = 80% OEC exam line.</p>
          <p className="account-readiness">{readiness}</p>
        </article>
        <article className="account-card">
          <header className="account-card-head">
            <h2>Questions</h2>
            <p>
              {coverage.seen} of {coverage.total} seen
            </p>
          </header>
          <div
            className="meter account-seen"
            role="meter"
            aria-label={`${coverage.seen} of ${coverage.total} questions seen`}
            aria-valuemin={0}
            aria-valuemax={coverage.total}
            aria-valuenow={coverage.seen}
          >
            <span style={{ width: `${seenPercent}%` }} />
          </div>
          <div className="account-stat-row account-coverage">
            <div>
              <span>Correct</span>
              <strong>{coverage.correct}</strong>
            </div>
            <div>
              <span>Missed</span>
              <strong>{coverage.missed}</strong>
            </div>
            <div>
              <span>Chapters</span>
              <strong>
                {coverage.chaptersStarted}
                <span>/{coverage.chapterCount}</span>
              </strong>
            </div>
          </div>
          <p className="account-caption">Correct and missed follow the latest answer. A chapter counts once any question in it has been seen.</p>
        </article>
      </div>
      <button className="ghost account-sign-out" type="button" disabled={busy} onClick={onSignOut}>
        Sign out
      </button>
    </section>
  );
}
