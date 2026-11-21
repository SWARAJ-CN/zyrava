"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { EmailChallenge } from "@/lib/api";
import { useEmailAccess } from "./useEmailAccess";

export function EmailAccessFlow({ challenge, onBack }: { challenge?: EmailChallenge; onBack?: () => void }) {
  const { verifyEmailOtp } = useAuth();
  const flow = useEmailAccess(challenge, verifyEmailOtp);
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const title = flow.step === "email" ? "Forgot your password?" : flow.step === "code" ? "Check your inbox" : flow.step === "password" ? "A fresh start" : "You're all set";
  const field = "w-full rounded-xl border border-separator bg-surface-secondary px-4 py-3 text-sm text-foreground outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20";
  return <main className="grid min-h-dvh place-items-center bg-background px-5 py-12 text-foreground">
    <section className="w-full max-w-md rounded-3xl border border-separator bg-surface p-6 shadow-pop sm:p-9">
      <div className="mb-9 flex items-center gap-3"><Image src="/icons/pwa-192x192.png" alt="" width={40} height={40} className="rounded-xl" /><span className="text-xs font-bold tracking-[0.25em]">ZYRAVA</span></div>
      <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-400">{flow.step === "done" ? <CheckCircle2 /> : flow.step === "email" ? <Mail /> : <ShieldCheck />}</div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-muted">{flow.step === "email" ? "Enter your account email. We'll send a code to help you reset your password. Phone-number accounts don't support password reset." : flow.step === "code" ? `${flow.challenge?.purpose === "reset" ? "If an email account matches, we've sent" : "We've sent"} a six-digit code to ${flow.challenge?.destination ?? "your inbox"}. It expires in 10 minutes.` : flow.step === "password" ? "Your email is verified. Choose a new password with at least 8 characters, a letter and a number." : "Your password has been updated. Sign in again to return to your music."}</p>
      {flow.step === "done" ? <Link href="/login" className="block rounded-xl bg-emerald-400 py-3 text-center text-sm font-bold text-emerald-950">Back to sign in</Link> : <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void flow.submit(); }}>
        {flow.step === "email" ? <label className="block space-y-2 text-sm"><span>Email address</span><input autoFocus required type="email" autoComplete="email" value={flow.email} onChange={(event) => flow.setEmail(event.target.value)} placeholder="you@example.com" className={field} disabled={flow.busy} /></label> : null}
        {flow.step === "code" ? <div>
          <label htmlFor="email-otp" className="mb-3 block text-xs font-semibold uppercase tracking-widest text-muted">Verification code</label>
          <div className="relative cursor-text" onClick={() => input.current?.focus()}>
            <div aria-hidden="true" className="grid grid-cols-6 gap-2">{Array.from({length: 6}, (_, index) => <span key={index} className={`grid h-14 place-items-center rounded-xl border text-2xl font-semibold tabular-nums transition-colors motion-reduce:transition-none ${focused && index === Math.min(flow.code.length, 5) ? "border-emerald-400 bg-emerald-400/10 ring-2 ring-emerald-400/20" : "border-separator bg-surface-secondary"}`}>{flow.code[index] || "·"}</span>)}</div>
            <input ref={input} id="email-otp" aria-label="Six-digit email verification code" aria-describedby="otp-help" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={flow.code} onChange={(event) => flow.setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} disabled={flow.busy} className="absolute inset-0 h-full w-full cursor-text opacity-0" />
          </div>
          <p id="otp-help" className="mt-3 text-xs text-muted">You can paste the full code. Check spam if it hasn’t arrived.</p>
        </div> : null}
        {flow.step === "password" ? <><label className="block space-y-2 text-sm"><span>New password</span><input autoFocus type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={flow.password} onChange={event => flow.setPassword(event.target.value)} className={field} /></label><label className="block space-y-2 text-sm"><span>Confirm new password</span><input type="password" autoComplete="new-password" required value={flow.confirm} onChange={event => flow.setConfirm(event.target.value)} className={field} /></label></> : null}
        {flow.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{flow.error}</p> : null}
        <button type="submit" disabled={flow.busy || (flow.step === "code" && flow.code.length !== 6)} className="w-full rounded-xl bg-emerald-400 px-4 py-3.5 text-sm font-bold text-emerald-950 transition active:scale-[0.98] disabled:opacity-40 motion-reduce:transform-none">{flow.busy ? "One moment…" : flow.step === "email" ? "Send verification code" : flow.step === "code" ? "Verify & continue" : "Save new password"}</button>
        {flow.step === "code" ? <button type="button" disabled={flow.busy || flow.remaining > 0} onClick={() => void flow.resend()} className="w-full py-2 text-sm text-emerald-400 disabled:text-muted">{flow.remaining > 0 ? `Resend code in ${flow.remaining}s` : "Send a new code"}</button> : null}
      </form>}
      <div className="mt-7 border-t border-separator pt-5">{onBack ? <button type="button" onClick={onBack} className="flex items-center gap-2 text-xs text-muted"><ArrowLeft size={14} />Back to sign in</button> : <Link href="/login" className="flex items-center gap-2 text-xs text-muted"><ArrowLeft size={14} />Back to sign in</Link>}</div>
    </section>
  </main>;
}
