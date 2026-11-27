import { loginReturnPath } from "@/lib/login-return";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import "./mobile-sign-in.css";
import ReviewDemoSignIn from "@/components/ReviewDemoSignIn";

export default function MobileSignIn() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<{
    enabled: boolean;
    deliveryMode: string;
  }>();
  const [loading, setLoading] = useState(true),
    [phone, setPhone] = useState(""),
    [pin, setPin] = useState(""),
    [confirm, setConfirm] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState("");
  const [mode, setMode] = useState<"pin" | "create" | "reset">("pin");
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    phoneHint: string;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [wait, setWait] = useState(0);
  const utils = trpc.useUtils(),
    [, navigate] = useLocation();
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/mobile/status", {
      credentials: "include",
      signal: AbortSignal.timeout(10000),
    })
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
      signal: AbortSignal.timeout(12000),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.message || "Sign-in could not be completed.");
    return result;
  };
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setChallenge(undefined);
    setCode("");
    setPin("");
    setConfirm("");
    setError("");
  };
  const requestCode = async () => {
    if (busy) return;
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
  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode !== "pin" && pin !== confirm) {
      setError("The two PINs do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post(
        mode === "pin" ? "pin" : "verify",
        mode === "pin"
          ? { phone, pin }
          : { challengeId: challenge!.challengeId, code, pin, name }
      );
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      await utils.invalidate();
      navigate(loginReturnPath(window.location.search));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const pinField = (
    value: string,
    set: (s: string) => void,
    label: string,
    existing = false
  ) => (
    <label>
      {t(label)}
      <input
        required
        type="password"
        inputMode="numeric"
        autoComplete={existing ? "current-password" : "new-password"}
        pattern="[0-9]{4}"
        maxLength={4}
        value={value}
        onChange={e => set(e.target.value.replace(/\D/g, ""))}
      />
    </label>
  );
  const phoneField = (
    <label>
      {t("Mobile number")}{" "}
      <div className="mobile-auth-phone">
        <span>+91</span>
        <input
          required
          type="tel"
          aria-label={t("Mobile number")}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={t("Enter mobile number")}
          pattern="[6-9][0-9]{9}"
          maxLength={10}
          value={phone}
          disabled={busy}
          onChange={e => {
            setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
            setPin("");
          }}
        />
      </div>
    </label>
  );
  if (loading) return <p role="status">Opening secure mobile sign-in…</p>;
  if (!status?.enabled)
    return (
      <>
        <p role="status" className="mobile-auth-disabled">
          {error ||
            "Mobile sign-in is temporarily unavailable. Please try again shortly."}
        </p>
        <ReviewDemoSignIn />
      </>
    );
  return (
    <>
      <section className="mobile-auth-card">
        <span className="mobile-auth-icon">
          <Smartphone size={25} />
        </span>
        <div className="mobile-auth-tabs" aria-label={t("Account access")}>
          <button
            type="button"
            aria-pressed={mode !== "create"}
            disabled={busy}
            onClick={() => changeMode("pin")}
          >
            {t("Sign in")}{" "}
          </button>
          <button
            type="button"
            aria-pressed={mode === "create"}
            disabled={busy}
            onClick={() => changeMode("create")}
          >
            {t("Create account")}{" "}
          </button>
        </div>
        <h2>
          {mode === "pin"
            ? t("Welcome back.")
            : mode === "reset"
              ? t("Reset your PIN.")
              : t("Your local shops, one account.")}
        </h2>
        <p>
          {mode === "pin"
            ? t("Enter your mobile number and the four-digit PIN you chose.")
            : challenge
              ? "Enter the OTP sent to " +
                challenge.phoneHint +
                " and choose your four-digit login PIN."
              : t("Verify your mobile number once by OTP, then use your PIN for future sign-ins.")}
        </p>
        {status.deliveryMode === "local-preview" && (
          <div className="mobile-auth-preview">
            Local preview · SMS goes to the private test inbox.
          </div>
        )}
        {mode === "pin" ? (
          <form onSubmit={signIn}>
            {phoneField}
            {pinField(pin, setPin, "4-digit PIN", true)}
            <button
              className="mobile-auth-primary"
              disabled={busy || phone.length !== 10 || pin.length !== 4}
            >
              {busy ? t("Signing in…") : t("Sign in")}
              <ArrowRight size={17} />
            </button>
            <div className="mobile-auth-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => changeMode("reset")}
              >
                {t("Forgot PIN / set up PIN")}{" "}
              </button>
            </div>
          </form>
        ) : challenge ? (
          <form onSubmit={signIn}>
            <label>
              {t("Verification code")}{" "}
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
            {mode === "create" && (
              <label>
                {t("Your name (optional)")}{" "}
                <input
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </label>
            )}
            {pinField(pin, setPin, "Choose a 4-digit PIN")}
            {pinField(confirm, setConfirm, "Confirm 4-digit PIN")}
            <p className="mobile-auth-pin-help">
              {t(
                "Keep this PIN private. Resetting it signs out your other devices."
              )}{" "}
            </p>
            <button
              className="mobile-auth-primary"
              disabled={
                busy ||
                code.length !== 6 ||
                pin.length !== 4 ||
                confirm.length !== 4
              }
            >
              {busy
                ? t("Verifying…")
                : mode === "reset"
                  ? t("Verify & reset PIN")
                  : t("Verify & continue")}
              <ArrowRight size={17} />
            </button>
            <div className="mobile-auth-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChallenge(undefined);
                  setCode("");
                  setError("");
                }}
              >
                <ArrowLeft size={13} />
                {t("Change number")}{" "}
              </button>
              <button
                type="button"
                disabled={busy || wait > 0}
                onClick={requestCode}
              >
                {wait ? "Resend in " + wait + "s" : t("Resend OTP")}
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
            {phoneField}
            <button
              className="mobile-auth-primary"
              disabled={busy || phone.length !== 10 || wait > 0}
            >
              {busy
                ? t("Requesting OTP…")
                : wait
                  ? "Try again in " + wait + "s"
                  : t("Send verification OTP")}
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
          {t(
            "Your account stays signed in on this device. Sign out on shared devices."
          )}{" "}
        </p>
      </section>
      <ReviewDemoSignIn />
    </>
  );
}
