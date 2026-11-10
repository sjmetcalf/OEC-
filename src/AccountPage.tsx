import { useMemo, useState, type FormEvent } from "react";
import { BackButton } from "./BackButton.tsx";
import { Threads } from "./threads.tsx";
import { CountUp } from "./bits.tsx";
import { CometDial } from "./comet-dial.tsx";
import { scorePercent, type PracticeTest } from "./exams.ts";
import { MagicBento } from "./magic-bento.tsx";
import { cleanDisplayName, displayNameError, type Profile } from "./profile.ts";
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
      <defs>
        <linearGradient id="score-brand" gradientUnits="userSpaceOnUse" x1={pad.left} y1="0" x2={width - pad.right} y2="0">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="42%" stopColor="var(--accent-mid)" />
          <stop offset="100%" stopColor="var(--accent-warm)" />
        </linearGradient>
      </defs>
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
      {points.length > 1 ? <path className="score-chart-line" d={line} stroke="url(#score-brand)" /> : null}
      {points.map((point, index) => (
        <circle
          key={tests[index]?.id ?? index}
          className={point.percent >= examLine ? "score-chart-point" : "score-chart-point is-under"}
          cx={point.x}
          cy={point.y}
          r={5}
          stroke="url(#score-brand)"
        />
      ))}
    </svg>
  );
}

export default function AccountPage({
  email,
  profile,
  onSaveProfile,
  tests,
  aptitude,
  coverage,
  lower,
  deviceNote,
  busy,
  onBack,
  onStudyChapter,
  onSignOut,
}: {
  email: string;
  profile: Profile | null;
  onSaveProfile: (input: { displayName: string }) => Promise<string | null>;
  tests: PracticeTest[];
  aptitude: number;
  coverage: StudyCoverage;
  lower: Array<{ id: string; title: string; aptitude: number }>;
  deviceNote: string | null;
  busy: boolean;
  onBack: () => void;
  onStudyChapter: (chapterId: string) => void;
  onSignOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile?.displayName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const savedName = profile?.displayName ?? "";
  const nameRule = "Use 2–24 letters, numbers, spaces, periods, hyphens, or underscores.";

  function beginEdit() {
    setDraft(savedName);
    setNameError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(savedName);
    setNameError(null);
    setEditing(false);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingName || busy) return;
    const displayName = cleanDisplayName(draft);
    setDraft(displayName);
    const format = displayName ? displayNameError(displayName) : nameRule;
    if (format) {
      setNameError(format);
      return;
    }
    setSavingName(true);
    setNameError(null);
    const error = await onSaveProfile({ displayName });
    setSavingName(false);
    if (error) {
      setNameError(error);
      return;
    }
    setEditing(false);
  }

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

  const stats = useMemo(
    () => [
      {
        id: "aptitude",
        content: (
          <div className="account-stat">
            <header className="account-card-head">
              <h2>Aptitude</h2>
              <p>Correct answers out of every try.</p>
            </header>
            <CometDial
              className="stat-dial"
              value={aptitude}
              label="Aptitude, correct answers out of every try"
              unit="%"
              size={152}
              accent="var(--accent)"
              ink="var(--ink)"
              disabled
            />
            {lower.length > 0 ? (
              <div className="account-stat-foot">
                <div className="account-weak-block">
                  <ul className="account-weak">
                    {lower.map((chapter) => (
                      <li key={chapter.id}>
                        <button className="text-button" type="button" onClick={() => onStudyChapter(chapter.id)}>
                          <span className="account-weak-name">{chapter.title}</span>
                          <strong>{chapter.aptitude}%</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "questions",
        content: (
          <div className="account-stat">
            <header className="account-card-head">
              <h2>Questions</h2>
              <p>
                {coverage.seen} of {coverage.total} seen
              </p>
            </header>
            <CometDial
              className="stat-dial"
              value={seenPercent}
              label={`${coverage.seen} of ${coverage.total} questions seen`}
              unit="%"
              size={152}
              accent="var(--accent-warm)"
              ink="var(--ink)"
              disabled
            />
            <div className="account-stat-foot">
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
            </div>
          </div>
        ),
      },
      {
        id: "tests",
        colSpan: 2,
        content: (
          <>
            <header className="account-card-head">
              <h2>Practice tests</h2>
              <p>
                {tests.length === 0 ? "No finished tests yet." : `${tests.length} finished ${tests.length === 1 ? "test" : "tests"}`}
              </p>
            </header>
            {tests.length > 0 ? (
              <>
                <div className="account-stat-row">
                  <div>
                    <span>Recent</span>
                    <strong>{recent === undefined ? "—" : <><CountUp to={recent} />%</>}</strong>
                  </div>
                  <div>
                    <span>Best</span>
                    <strong>{best === null ? "—" : <><CountUp to={best} />%</>}</strong>
                  </div>
                  <div>
                    <span>Average</span>
                    <strong>{average === null ? "—" : <><CountUp to={average} />%</>}</strong>
                  </div>
                </div>
                <ScoreChart tests={tests} />
                <p className="account-caption">Dashed line = 80% OEC exam line.</p>
                <p className="account-readiness">{readiness}</p>
              </>
            ) : null}
          </>
        ),
      },
    ],
    [aptitude, average, best, coverage, lower, onStudyChapter, readiness, recent, seenPercent, tests],
  );

  return (
    <section className="account-page">
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
      <div className="drill-meta">
        <BackButton onClick={onBack} />
      </div>
      <header className="pool-intro">
        <p className="section-label">Account</p>
        {editing ? (
          <form className="account-alias" onSubmit={(event) => void saveName(event)}>
            <input
              className="account-alias-input"
              value={draft}
              size={Math.min(24, Math.max(draft.length + 1, 8))}
              maxLength={24}
              autoFocus
              autoComplete="nickname"
              spellCheck={false}
              aria-label="Display name"
              aria-invalid={nameError ? true : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setNameError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
              }}
            />
            <button className="text-button" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          </form>
        ) : (
          <div className="account-alias">
            <h1>{savedName || "Your practice"}</h1>
            {savedName ? (
              <button className="text-button" type="button" onClick={beginEdit}>
                Edit
              </button>
            ) : null}
          </div>
        )}
        {nameError ? (
          <p className="account-error" role="alert">
            {nameError}
          </p>
        ) : null}
        <p className="lede">{email}</p>
        {!savedName && !editing ? (
          <button className="text-button" type="button" onClick={beginEdit}>
            Add a name
          </button>
        ) : null}
        {deviceNote ? <p className="account-local">{deviceNote}</p> : null}
      </header>
      <MagicBento
        className="account-bento"
        columns={2}
        minCell={112}
        gap={14}
        radius={12}
        glowColor="#a855f7"
        textAutoHide={false}
        enableStars={false}
        items={stats}
      />
      <button className="ghost account-sign-out" type="button" disabled={busy} onClick={onSignOut}>
        Sign out
      </button>
    </section>
  );
}
