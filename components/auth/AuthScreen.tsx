"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock, Mail, Phone, User } from "lucide-react";
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
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function AuthScreen({
  mode,
  initialSlides = [],
}: {
  mode: Mode;
  initialSlides?: TrendingSlide[];
}) {
  const router = useRouter();
  const { status, login, register } = useAuth();
  const isRegister = mode === "register";
  // Read once on the client; not rendered, so it cannot cause a mismatch.
  const [nextPath] = useState(() =>
    typeof window === "undefined" ? "/" : safeNext(new URLSearchParams(window.location.search).get("next"))
  );

  const [method, setMethod] = useState<Method>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        await login({ identifier: identifier.trim(), password, remember });
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
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="text-[11px] font-medium text-danger-soft-foreground">{errors[key]}</span>
    ) : null;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="mx-auto grid min-h-dvh w-full max-w-[96rem] lg:grid-cols-[1fr_1.08fr]">
        <section className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-14">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[12px] font-bold tracking-[0.2em] text-foreground">
              <span className="grid size-7 place-items-center rounded-[0.55rem] bg-accent text-accent-foreground">
                <Icon name="music" className="size-3.5" strokeWidth={2.2} />
              </span>
              ZYRAVA
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-faint-foreground">
              Private listening studio
            </p>
          </div>

          <div className="my-auto w-full max-w-sm self-center py-10">
            <div className="mb-7 lg:hidden">
              <TrendingCarousel compact initialSlides={initialSlides} />
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
              {isRegister ? "Create your account" : "Welcome back"}
            </p>
            <h1 className="mt-2 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-[2.4rem]">
              {isRegister ? "Join the studio." : "Sign in to ZYRAVA."}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {isRegister
                ? "One account for your queue, saved mixes and the console."
                : "Your queue and saved mixes are waiting."}
            </p>

            <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
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
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Name <span className="normal-case tracking-normal text-faint-foreground">(optional)</span>
                    </span>
                    <div className="relative">
                      <User className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                      <Input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        placeholder="Your name"
                        className="h-11 w-full rounded-xl ps-10"
                        aria-invalid={Boolean(errors.name)}
                      />
                    </div>
                    {fieldError("name")}
                  </label>

                  {method === "email" ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Email
                      </span>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                        <Input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          inputMode="email"
                          placeholder="you@example.com"
                          className="h-11 w-full rounded-xl ps-10"
                          aria-invalid={Boolean(errors.email)}
                        />
                      </div>
                      {fieldError("email")}
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Phone number
                      </span>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                        <Input
                          type="tel"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          autoComplete="tel"
                          inputMode="tel"
                          placeholder="+91 98765 43210"
                          className="h-11 w-full rounded-xl ps-10"
                          aria-invalid={Boolean(errors.phone)}
                        />
                      </div>
                      {fieldError("phone")}
                    </label>
                  )}
                </>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Email or phone
                  </span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                    <Input
                      type="text"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      autoComplete="username"
                      placeholder="you@example.com or +91…"
                      className="h-11 w-full rounded-xl ps-10"
                      aria-invalid={Boolean(errors.identifier)}
                    />
                  </div>
                  {fieldError("identifier")}
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Password
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    placeholder={isRegister ? "At least 8 characters" : "Your password"}
                    className="h-11 w-full rounded-xl ps-10 pe-11"
                    aria-invalid={Boolean(errors.password)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {fieldError("password")}
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="size-4 cursor-pointer rounded-none border border-separator bg-surface accent-[var(--accent)]"
                />
                Remember me
                <span className="text-faint-foreground">for 30 days</span>
              </label>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger-soft-foreground"
                >
                  {formError}
                </p>
              ) : null}

              <ClickButton
                type="submit"
                loading={busy}
                className="h-11 w-full rounded-none text-[13px] font-semibold"
              >
                {busy ? "One moment…" : isRegister ? "Create account" : "Sign in"}
              </ClickButton>
            </form>

            <p className="mt-6 text-center text-xs text-muted">
              {isRegister ? "Already have an account?" : "New to ZYRAVA?"}{" "}
              <Link
                href={isRegister ? "/login" : "/register"}
                className="font-semibold text-brand underline-offset-4 hover:underline"
              >
                {isRegister ? "Sign in" : "Create one"}
              </Link>
            </p>
          </div>

          <p className="text-[10px] leading-relaxed text-faint-foreground">
            Protected by CSRF tokens, short-lived JWTs and httpOnly refresh cookies.
          </p>
        </section>

        {/* Trending panel — what the catalogue is playing right now. */}
        <aside className="relative hidden p-3 lg:block">
          <TrendingCarousel initialSlides={initialSlides} />
        </aside>
      </div>
    </main>
  );
}
