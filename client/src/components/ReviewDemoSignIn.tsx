import { useEffect, useState } from "react";
import "./review-demo.css";

export function clearDemoBrowserData() {
  for (const key of [
    "mytown-market-cart-v1",
    "mytown-market-town-v1",
    "mytown-market-zone-v1",
    "mytown-market-locality-v1",
  ])
    try {
      localStorage.removeItem(key);
    } catch {
      /* Optional browser storage. */
    }
  try {
    sessionStorage.removeItem("manus-cookie");
  } catch {
    /* Optional browser storage. */
  }
}

export default function ReviewDemoSignIn() {
  const [enabled, setEnabled] = useState(false),
    [open, setOpen] = useState(false);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/review/status", {
      signal: controller.signal,
      credentials: "include",
    })
      .then(r => (r.ok ? r.json() : null))
      .then(value => setEnabled(value?.enabled === true))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!enabled) return null;
  return (
    <section className="mobile-auth-card" aria-label="Fictional demo access">
      <button
        type="button"
        className="mobile-auth-primary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Open demo sign-in
      </button>
      {open && (
        <>
          <h2>Try the demo marketplace</h2>
          <p>
            Use the supplied demo account. Shops, addresses and orders are
            fictional. No delivery or payment will take place. Enter fictional
            details only.
          </p>
          <form
            onSubmit={async event => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/auth/review/login", {
                  method: "POST",
                  credentials: "include",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ username, password }),
                });
                const result = await response.json();
                if (!response.ok)
                  throw Error(
                    result.message || "Demo sign-in could not be completed."
                  );
                setPassword("");
                clearDemoBrowserData();
                window.location.assign("/");
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Please try again."
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Demo username
              <input
                autoComplete="username"
                required
                maxLength={64}
                value={username}
                onChange={event => setUsername(event.target.value)}
              />
            </label>
            <label>
              Demo password
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </label>
            <button className="mobile-auth-primary" disabled={busy}>
              {busy ? "Opening demoÃ¢â‚¬Â¦" : "Sign in to demo"}
            </button>
          </form>
          {error && (
            <p role="alert" className="mobile-auth-error">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ReviewDemoBanner() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <aside className="review-demo-banner" aria-label="Demo workspace">
      <strong>Demo only Ã‚- no real orders or payments</strong>
      <span>
        Fictional shops and addresses. Please enter fictional details only.
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/auth/review/logout", {
              method: "POST",
              credentials: "include",
            });
            if (!response.ok) throw Error();
            clearDemoBrowserData();
            window.location.assign("/login");
          } catch {
            setError("Could not leave the demo. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "LeavingÃ¢â‚¬Â¦" : "Exit demo"}
      </button>
      {error && <span role="alert">{error}</span>}
    </aside>
  );
}
