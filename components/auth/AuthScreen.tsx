"use client";

import Link from "next/link";
import { PersonalDedication } from "@/components/PersonalDedication";
import { matchesPersonalWelcome, forgetPersonalWelcome } from "@/lib/personal-welcome";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Headphones, Lock, Mail, Phone, User } from "lucide-react";
import { ClickButton } from "@/components/ui/ClickButton";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/icons";
import { TrendingCarousel } from "@/components/auth/TrendingCarousel";
import { useAuth } from "@/components/providers/AuthProvider";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { TrendingSlide } from "@/lib/trending";

type Mode = "login" | "register";
type Method = "email" | "phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?\d{8,15}$/;

function cleanPhone(value: string) {
  return value.replace(/[\s()\-.]/g, "");
}

/** Only same-origin paths may be used as a post-login destination. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

function readNextPath() {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

function subscribeNextPath(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function AuthScreen({
  mode,
  initialSlides = [],
}: {
  mode: Mode;
  initialSlides?: TrendingSlide[];
}) {
  const router = useRouter();
  const { status, login, register, returningPersonalEmail } = useAuth();
  const isRegister = mode === "register";
  // Preserve the destination on auth links without a server/client mismatch.
  const nextPath = useSyncExternalStore(subscribeNextPath, readNextPath, () => "/");

  const [method, setMethod] = useState<Method>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [identifier, setIdentifier] = useState("");
  const personalWelcome = !isRegister && matchesPersonalWelcome(returningPersonalEmail, identifier);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const clearError = (key: string) => {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  };

  // A signed-in visitor has no business on the auth screens.
  useEffect(() => {
    if (status === "authenticated") router.replace(nextPath);
  }, [status, router, nextPath]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (isRegister && name.trim() && name.trim().length < 2) {
      next.name = "Use at least 2 characters.";
    }

    if (isRegister) {
      if (method === "email" && !EMAIL.test(email.trim())) {
        next.email = "Enter a valid email address.";
      }
      if (method === "phone" && !PHONE.test(cleanPhone(phone))) {
        next.phone = "Use 8–15 digits, optionally starting with +.";
      }
    } else if (!identifier.trim()) {
      next.identifier = "Enter your email or phone number.";
    }

    if (isRegister) {
      if (password.length < 8) next.password = "Use at least 8 characters.";
      else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        next.password = "Mix letters and numbers.";
      }
    } else if (!password) {
      next.password = "Enter your password.";
    }

    setErrors(next);
    const invalid = formRef.current?.elements.namedItem(Object.keys(next)[0]);
    if (invalid instanceof HTMLInputElement) invalid.focus();
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || status === "loading") return;
    setFormError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      if (isRegister) {
        await register({
          name: name.trim() || undefined,
          email: method === "email" ? email.trim() : undefined,
          phone: method === "phone" ? cleanPhone(phone) : undefined,
          password,
          remember,
        });
      } else {
        const value = identifier.trim();
        await login({ identifier: value.includes("@") ? value : cleanPhone(value), password, remember });
      }
      router.replace(nextPath);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.details?.length) {
          const mapped: Record<string, string> = {};
          for (const detail of error.details) {
            mapped[detail.path.replace(/^body\./, "")] ??= detail.message;
          }
          setErrors(mapped);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span id={`auth-${key}-error`} className="text-xs font-medium text-danger-soft-foreground">{errors[key]}</span>
    ) : null;


  return (
    <main data-personal-welcome={personalWelcome || undefined} className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto grid min-h-dvh w-full max-w-[96rem] lg:grid-cols-[1fr_1fr]">
        <section className="flex min-h-dvh min-w-0 flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-12 lg:px-16">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="ZYRAVA home" className="flex min-h-11 items-center gap-2.5 text-sm font-bold tracking-[0.2em] text-foreground">
              <span className="grid size-7 place-items-center rounded-[0.55rem] bg-accent text-accent-foreground">
                <Icon name="music" className="size-3.5" strokeWidth={2.2} />
              </span>
              ZYRAVA
            </Link>
            <Link href="/" className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground">
              <ArrowLeft aria-hidden className="size-3.5" /> Back to music
            </Link>
          </div>

          <div className="my-auto w-full max-w-[25rem] self-center py-8 sm:py-12">
            <div aria-hidden className="mb-6 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
              <Headphones className="size-6" strokeWidth={1.6} />
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
              {isRegister ? "Create your account" : personalWelcome ? "Welcome back, Vimitha" : "Welcome back"}
            </p>
            <h1 className="mt-2 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-[2.4rem]">
              {isRegister ? "Join the studio." : personalWelcome ? "Your music is waiting, Baava." : "Good to have you back."}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {isRegister
                ? "Save your favourites and make yourself at home."
                : personalWelcome ? "A little love, your favourite songs, and a space made just for you." : "Sign in to pick up where you left off. Your music, liked songs and people are waiting."}
            </p>

            {personalWelcome ? (
              <button type="button" onClick={() => { forgetPersonalWelcome(); setIdentifier(""); }} className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-foreground">
                Use another account
              </button>
            ) : null}

            <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy} className="mt-8">
              <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5 border-0 p-0 disabled:opacity-70">
                <legend className="sr-only">{isRegister ? "Create account" : "Sign in"} details</legend>
                {isRegister ? (
                  <>
                    <div className="grid grid-cols-2 gap-1 rounded-xl border border-separator bg-surface p-1">
                      {(["email", "phone"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={method === option}
                          onClick={() => {
                            setMethod(option);
                            setErrors({});
                          }}
                          className={cn(
                            "flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-colors",
                            method === option
                              ? "bg-accent text-accent-foreground"
                              : "text-muted hover:text-foreground"
                          )}
                        >
                          {option === "email" ? <Mail className="size-3.5" /> : <Phone className="size-3.5" />}
                          {option === "email" ? "Email" : "Phone"}
                        </button>
                      ))}
                    </div>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        Name <span className="normal-case tracking-normal text-faint-foreground">(optional)</span>
                      </span>
                      <div className="relative">
                        <User className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                        <Input
                          type="text"
                          value={name}
                          onChange={(event) => { setName(event.target.value); clearError("name"); }}
                          autoComplete="name"
                          placeholder="Your name"
                          className="h-13 w-full rounded-xl ps-10 text-base!"
                          name="name"
                          aria-describedby={errors.name ? "auth-name-error" : undefined}
                          aria-invalid={Boolean(errors.name)}
                        />
                      </div>
                      {fieldError("name")}
                    </label>

                    {method === "email" ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          Email
                        </span>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                          <Input
                            type="email"
                            value={email}
                            onChange={(event) => { setEmail(event.target.value); clearError("email"); }}
                            autoComplete="email"
                            inputMode="email"
                            placeholder="you@example.com"
                            className="h-13 w-full rounded-xl ps-10 text-base!"
                            name="email"
                          aria-describedby={errors.email ? "auth-email-error" : undefined}
                          aria-invalid={Boolean(errors.email)}
                          />
                        </div>
                        {fieldError("email")}
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          Phone number
                        </span>
                        <div className="relative">
                          <Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                          <Input
                            type="tel"
                            value={phone}
                            onChange={(event) => { setPhone(event.target.value); clearError("phone"); }}
                            autoComplete="tel"
                            inputMode="tel"
                            placeholder="+91 98765 43210"
                            className="h-13 w-full rounded-xl ps-10 text-base!"
                            name="phone"
                          aria-describedby={errors.phone ? "auth-phone-error" : undefined}
                          aria-invalid={Boolean(errors.phone)}
                          />
                        </div>
                        {fieldError("phone")}
                      </label>
                    )}
                  </>
                ) : (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Email or phone
                    </span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                      <Input
                        type="text"
                        value={identifier}
                        onChange={(event) => { setIdentifier(event.target.value); clearError("identifier"); }}
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        placeholder="Email address or phone number"
                        className="h-13 w-full rounded-xl ps-10 text-base!"
                        name="identifier"
                          aria-describedby={errors.identifier ? "auth-identifier-error" : undefined}
                          aria-invalid={Boolean(errors.identifier)}
                      />
                    </div>
                    {fieldError("identifier")}
                  </label>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Password
                  </span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); clearError("password"); }}
                      autoComplete={isRegister ? "new-password" : "current-password"}
                      enterKeyHint="go"
                      onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                      onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                      onBlur={() => setCapsLock(false)}
                      placeholder={isRegister ? "At least 8 characters" : "Your password"}
                      className="h-13 w-full rounded-xl ps-10 pe-13 text-base!"
                      name="password"
                          aria-describedby={errors.password ? "auth-password-error" : undefined}
                          aria-invalid={Boolean(errors.password)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute end-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {fieldError("password")}
                  {capsLock ? <span role="status" className="text-xs text-warning">Caps Lock is on.</span> : null}
                </label>

                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl py-1 text-sm text-foreground">
                  <span className="relative flex size-5 shrink-0">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      className="peer size-5 cursor-pointer appearance-none rounded-md border-2 border-emerald-500 bg-transparent checked:border-emerald-500 checked:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
                    />
                    <Check aria-hidden className="pointer-events-none absolute inset-0 size-5 p-0.5 text-emerald-950 opacity-0 peer-checked:opacity-100" strokeWidth={3} />
                  </span>
                  <span>
                    <span className="block font-medium">Remember me for 30 days</span>
                    <span className="mt-0.5 block text-xs text-muted">Best on your personal device.</span>
                  </span>
                </label>
              </fieldset>

              {formError ? (
                <p
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger-soft-foreground"
                >
                  {formError}
                </p>
              ) : null}

              <ClickButton
                type="submit"
                loading={busy}
                disabled={status === "loading"}
                className="mt-5 h-13 w-full rounded-xl text-sm font-semibold"
              >
                {busy ? (personalWelcome ? "One moment, Baava…" : isRegister ? "Creating your account…" : "Signing you in…") : status === "loading" ? "Checking your session…" : isRegister ? "Create account" : "Sign in"}
                {!busy && status !== "loading" ? <ArrowRight aria-hidden className="size-4" /> : null}
              </ClickButton>
            </form>

            <p className="mt-7 flex flex-wrap items-center justify-center gap-x-1.5 border-t border-separator pt-5 text-sm text-muted">
              {isRegister ? "Already have an account?" : "New to ZYRAVA?"}{" "}
              <Link
                href={`${isRegister ? "/login" : "/register"}${nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : ""}`}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline"
              >
                {isRegister ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
          {personalWelcome ? <PersonalDedication className="px-2 pb-2 text-xs" /> : null}
        </section>

        {/* Trending panel — what the catalogue is playing right now. */}
        <aside className="relative hidden p-5 lg:block">
          <TrendingCarousel initialSlides={initialSlides} />
        </aside>
      </div>
    </main>
  );
}
