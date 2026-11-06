import { useEffect, useId, useState, type FormEvent } from "react";

type AccountProps = {
  email: string | null;
  busy: boolean;
  notice: string | null;
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onOpen: () => void;
  onClearFeedback: () => void;
};

function UserButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [seenLabel, setSeenLabel] = useState(() => localStorage.getItem("oec-connection-seen") === "1");

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const showLabel = !seenLabel || !online;

  return (
    <span className="user-wrap">
      {showLabel ? <span className={online ? "user-connection" : "user-connection is-offline"}>{online ? "Online" : "Offline"}</span> : null}
      <button
        className="user-button"
        type="button"
        aria-label={`${label}, ${online ? "online" : "offline"}`}
        onClick={() => {
          if (online) {
            localStorage.setItem("oec-connection-seen", "1");
            setSeenLabel(true);
          }
          onClick();
        }}
      >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M5.5 19.25c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      <span className={online ? "user-status is-online" : "user-status is-offline"} aria-hidden="true" />
    </button>
    </span>
  );
}

export default function Account({
  email,
  busy,
  notice,
  error,
  onSignIn,
  onSignUp,
  onOpen,
  onClearFeedback,
}: AccountProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<boolean | null>(null);

  useEffect(() => {
    if (email) setOpen(false);
  }, [email]);

  function close() {
    setOpen(false);
    setCreating(null);
    onClearFeedback();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextEmail = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (creating) await onSignUp(nextEmail, password);
    else await onSignIn(nextEmail, password);
  }

  function choose(next: boolean) {
    setCreating(next);
    onClearFeedback();
  }

  if (email) {
    return <UserButton label="Account" onClick={onOpen} />;
  }

  return (
    <>
      <UserButton
        label="Sign in"
        onClick={() => {
          onClearFeedback();
          setOpen(true);
        }}
      />
      {open && (
        <div className="account-layer">
          <button className="account-backdrop" type="button" aria-label="Close sign in" onClick={close} />
          <div className="account-dialog" role="dialog" aria-labelledby={titleId}>
            <button className="account-close" type="button" aria-label="Close" onClick={close}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
            {creating === null ? (
              <div className="account-intro">
                <span className="account-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
                    <path d="M5.5 19.25c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </span>
                <h2 id={titleId}>Account</h2>
                <p>Sign in to keep your answers and practice tests.</p>
                <button className="primary account-choice" type="button" onClick={() => choose(false)}>
                  Sign in
                </button>
                <button className="ghost account-choice" type="button" onClick={() => choose(true)}>
                  Create account
                </button>
              </div>
            ) : (
              <form className="account-form" onSubmit={(event) => void submit(event)}>
                <h2 id={titleId}>{creating ? "Create account" : "Sign in"}</h2>
                <label>
                  Email
                  <input name="email" type="email" autoComplete="email" required />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={creating ? "new-password" : "current-password"}
                    minLength={6}
                    required
                  />
                </label>
                {error ? (
                  <p className="account-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {notice ? <p className="account-notice">{notice}</p> : null}
                <button className="primary account-choice" type="submit" disabled={busy}>
                  {creating ? "Create account" : "Sign in"}
                </button>
                <button className="ghost account-choice" type="button" onClick={() => choose(!creating)}>
                  {creating ? "Already have an account?" : "Create account"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
