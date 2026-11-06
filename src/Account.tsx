import { useEffect, useId, useState, type FormEvent } from "react";

type AccountProps = {
  email: string | null;
  busy: boolean;
  notice: string | null;
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onClearFeedback: () => void;
};

export default function Account({
  email,
  busy,
  notice,
  error,
  onSignIn,
  onSignUp,
  onSignOut,
  onClearFeedback,
}: AccountProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (email) setOpen(false);
  }, [email]);

  function close() {
    setOpen(false);
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

  if (email) {
    return (
      <div className="account-signed-in">
        <span className="account-email" title={email}>
          {email}
        </span>
        <button className="text-button" type="button" disabled={busy} onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          onClearFeedback();
          setOpen(true);
        }}
      >
        Sign in
      </button>
      {open && (
        <div className="account-layer">
          <button className="account-backdrop" type="button" aria-label="Close sign in" onClick={close} />
          <form className="account-dialog" role="dialog" aria-labelledby={titleId} onSubmit={(event) => void submit(event)}>
            <h2 id={titleId}>{creating ? "Create account" : "Sign in"}</h2>
            <p>Answers are saved to this account, including study you already did on this device.</p>
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
            <div className="account-actions">
              <button className="primary" type="submit" disabled={busy}>
                {creating ? "Create account" : "Sign in"}
              </button>
              <button className="text-button" type="button" onClick={close}>
                Close
              </button>
            </div>
            <button
              className="text-button account-switch"
              type="button"
              onClick={() => {
                setCreating((value) => !value);
                onClearFeedback();
              }}
            >
              {creating ? "Already have an account?" : "Create an account"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
