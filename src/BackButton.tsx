export function BackButton({ onClick }: { onClick: () => void }) {
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
