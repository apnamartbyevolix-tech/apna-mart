import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import "./mobile-sign-in.css";
export default function MobileSignIn() {
  const [status, setStatus] = useState<{
      enabled: boolean;
      deliveryMode: string;
    }>(),
    [loading, setLoading] = useState(true),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [challenge, setChallenge] = useState<{
      challengeId: string;
      phoneHint: string;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [wait, setWait] = useState(0);
  const utils = trpc.useUtils(),
    [, navigate] = useLocation();
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/mobile/status", { credentials: "include" })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(s => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        if (alive)
          setError(
            "Sign-in could not be loaded. Please refresh and try again."
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const post = async (route: string, body: unknown) => {
    const r = await fetch("/api/auth/mobile/" + route, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.message || "Sign-in could not be completed.");
    return result;
  };
  const requestCode = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await post("challenge", { phone });
      setChallenge(r);
      setCode("");
      setWait(r.resendAfterSeconds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("verify", { challengeId: challenge!.challengeId, code, name });
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      await utils.invalidate();
      navigate("/account");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <p role="status">Opening secure mobile sign-in…</p>;
  if (!status?.enabled)
    return (
      <p role="status" className="mobile-auth-disabled">
        {error ||
          "Mobile sign-in will be available here once SMS delivery is configured."}
      </p>
    );
  return (
    <section className="mobile-auth-card">
      <span className="mobile-auth-icon">
        <Smartphone size={25} />
      </span>
      <h2>
        {challenge ? "Check your messages" : "Your town is one OTP away."}
      </h2>
      <p>
        {challenge
          ? "Enter the 6-digit code sent to " + challenge.phoneHint
          : "Sign in or create your customer account with your mobile number."}
      </p>
      {status.deliveryMode === "local-preview" && (
        <div className="mobile-auth-preview">
          Local preview · SMS goes to the private test inbox.
        </div>
      )}
      {challenge ? (
        <form onSubmit={verifyCode}>
          <label>
            Verification code
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label>
            Your name (optional)
            <input
              autoComplete="name"
              maxLength={80}
              value={name}
              placeholder="What should we call you?"
              onChange={e => setName(e.target.value)}
            />
          </label>
          <button
            className="mobile-auth-primary"
            disabled={busy || code.length !== 6}
          >
            {busy ? "Verifying…" : "Verify & continue"}
            <ArrowRight size={17} />
          </button>
          <div className="mobile-auth-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChallenge(undefined);
                setError("");
              }}
            >
              <ArrowLeft size={13} />
              Change number
            </button>
            <button
              type="button"
              disabled={busy || wait > 0}
              onClick={requestCode}
            >
              {wait ? "Resend in " + wait + "s" : "Resend code"}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            void requestCode();
          }}
        >
          <label>
            Mobile number
            <div className="mobile-auth-phone">
              <span>+91</span>
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="Enter mobile number"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                value={phone}
                onChange={e =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
              />
            </div>
          </label>
          <button
            className="mobile-auth-primary"
            disabled={busy || phone.length !== 10}
          >
            {busy ? "Requesting code…" : "Send verification code"}
            <ArrowRight size={17} />
          </button>
        </form>
      )}
      {error && (
        <p className="mobile-auth-error" role="alert">
          {error}
        </p>
      )}
      <p className="mobile-auth-trust">
        <ShieldCheck size={15} />
        Your account stays signed in on this device. Sign out on shared devices.
      </p>
    </section>
  );
}
