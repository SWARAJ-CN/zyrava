import { useEffect, useRef, useState } from "react";
import { resendEmailOtp, requestPasswordReset, verifyPasswordReset, finishPasswordReset, type EmailChallenge } from "@/lib/api";

export function useEmailAccess(initialChallenge: EmailChallenge | undefined, verifyLogin: (id: string, code: string) => Promise<void>) {
  const [step, setStep] = useState<"email" | "code" | "password" | "done">(initialChallenge ? "code" : "email");
  const [challenge, setChallenge] = useState(initialChallenge);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(initialChallenge?.resendAfter ?? 0);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { locked.current = false; setBusy(false); }
  };
  const submit = () => run(async () => {
    if (step === "email") {
      const next = await requestPasswordReset(email.trim());
      setChallenge(next); setRemaining(next.resendAfter); setStep("code");
    } else if (step === "code" && challenge) {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter all six digits.");
      if (challenge.purpose === "login") await verifyLogin(challenge.challengeId, code);
      else { const result = await verifyPasswordReset(challenge.challengeId, code); setResetToken(result.resetToken); setCode(""); setStep("password"); }
    } else if (step === "password") {
      if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("Use 8–72 characters, including a letter and a number.");
      if (password !== confirm) throw new Error("Your passwords don't match.");
      await finishPasswordReset(resetToken, password);
      setPassword(""); setConfirm(""); setResetToken(""); setStep("done");
    }
  });
  const resend = () => run(async () => {
    if (!challenge || remaining > 0) return;
    const next = await resendEmailOtp(challenge.challengeId, challenge.purpose);
    setChallenge({ ...challenge, ...next }); setCode(""); setRemaining(next.resendAfter);
  });
  return { step, challenge, email, setEmail, code, setCode, password, setPassword, confirm, setConfirm, busy, error, remaining, submit, resend };
}
