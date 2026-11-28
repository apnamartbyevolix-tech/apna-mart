import { loginReturnPath } from "@/lib/login-return";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import "./mobile-sign-in.css";
import ReviewDemoSignIn from "@/components/ReviewDemoSignIn";

export default function MobileSignIn({ embedded = false, onVerified }: { embedded?: boolean; onVerified?: () => void } = {}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<{ enabled: boolean; deliveryMode: string }>();
  const [loading, setLoading] = useState(true), [phone, setPhone] = useState(""), [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; phoneHint: string }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [wait, setWait] = useState(0);
  const active = useRef(false), cooldown = useRef(0);
  const utils = trpc.useUtils(), [, navigate] = useLocation();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/mobile/status", { credentials: "include", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStatus)
      .catch(() => { if (!controller.signal.aborted) setError("Sign-in could not be loaded. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!wait) return;
    const timer = setInterval(() => setWait(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [wait]);
  async function post(route: string, body: unknown) {
    const response = await fetch("/api/auth/mobile/" + route, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.message || "Sign-in could not be completed.");
    return result;
  }
  async function requestCode() {
    if (active.current || Date.now() < cooldown.current) return;
    active.current = true; setBusy(true); setError("");
    try {
      const result = await post("challenge", { phone });
      setChallenge(result); setCode("");
      const seconds = Math.max(1, Number(result.resendAfterSeconds) || 30);
      cooldown.current = Date.now() + seconds * 1000; setWait(seconds);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { active.current = false; setBusy(false); }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (active.current || !challenge) return;
    active.current = true; setBusy(true); setError("");
    try {
      await post("verify", { challengeId: challenge.challengeId, code });
      setCode("");
      await utils.invalidate();
      if (onVerified) onVerified(); else navigate(loginReturnPath(window.location.search));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { active.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">{t("Opening secure mobile sign-in…")}</p>;
  if (!status?.enabled) return <><p role="status" className="mobile-auth-disabled">{error || "Mobile sign-in is temporarily unavailable. Your cart is saved."}</p><ReviewDemoSignIn /></>;
  return <>
    <section className="mobile-auth-card" aria-label="Mobile verification" aria-busy={busy}>
      <span className="mobile-auth-icon"><Smartphone size={25}/></span>
      <h2>{t(embedded ? "Verify your mobile to continue" : "Your local shops, one account.")}</h2>
      <p>{challenge ? "Enter the six-digit OTP sent to " + challenge.phoneHint : t("Browse freely. Verify your mobile when you are ready to order.")}</p>
      {status.deliveryMode === "local-preview" && <p className="mobile-auth-preview">Local preview · SMS goes to the private test inbox.</p>}
      {challenge ? <form onSubmit={verify}>
        <label>{t("Verification code")}<input autoFocus required aria-label={t("Verification code")} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}/></label>
        <button className="mobile-auth-primary" disabled={busy || code.length !== 6}>{t(busy ? "Verifying…" : "Verify & continue")}<ArrowRight size={17}/></button>
        <div className="mobile-auth-actions">
          <button type="button" disabled={busy} onClick={() => { setChallenge(undefined); setCode(""); setError(""); }}><ArrowLeft size={15}/>{t("Change number")}</button>
          <button type="button" disabled={busy || wait > 0} onClick={() => void requestCode()}>{wait ? "Resend in " + wait + "s" : t("Resend OTP")}</button>
        </div>
      </form> : <form onSubmit={event => { event.preventDefault(); void requestCode(); }}>
        <label>{t("Mobile number")}<div className="mobile-auth-phone"><span>+91</span><input required type="tel" aria-label={t("Mobile number")} inputMode="tel" autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} value={phone} disabled={busy} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}/></div></label>
        <button className="mobile-auth-primary" disabled={busy || phone.length !== 10 || wait > 0}>{busy ? t("Requesting OTP…") : wait ? "Try again in " + wait + "s" : t("Send verification OTP")}<ArrowRight size={17}/></button>
      </form>}
      {error && <p className="mobile-auth-error" role="alert">{error}</p>}
      <p className="mobile-auth-trust"><ShieldCheck size={16}/>{t("Your account stays signed in on this device. Never share your OTP.")}</p>
      {embedded && <p className="mobile-auth-trust">Verification does not place an order. Review the total before confirming.</p>}
    </section>
    <ReviewDemoSignIn />
  </>;
}
