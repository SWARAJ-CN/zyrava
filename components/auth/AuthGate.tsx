"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

const SPLASH_GLYPHS: ReactNode[] = [
  <>
    <path d="M4 13.5v-1a8 8 0 0 1 16 0v1" />
    <rect x="2.5" y="13.5" width="4.5" height="7" rx="2.25" />
    <rect x="17" y="13.5" width="4.5" height="7" rx="2.25" />
  </>,
  <>
    <rect x="5" y="2.5" width="14" height="19" rx="3" />
    <circle cx="12" cy="15.5" r="3.5" />
    <circle cx="12" cy="7.5" r="1.25" />
  </>,
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
  <>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3.5" />
  </>,
  <>
    <path d="M9 17.5V6l10-2.2v11" />
    <circle cx="6.75" cy="17.5" r="2.25" />
    <circle cx="16.75" cy="14.8" r="2.25" />
  </>,
];

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuth();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (isPublic || status !== "anonymous") return;
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isPublic, status, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (status === "authenticated") return <>{children}</>;

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 text-foreground">
      {/* Keyframes for Zepto jump & rotating green/black background aura */}
      <style jsx>{`
        @keyframes zepto-jump {
          0%, 100% {
            transform: translateY(5px) scale(0.8);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-6px) scale(1.15);
            opacity: 1;
          }
        }
        @keyframes bg-rotate {
          0% {
            transform: translate(-50%, -50%) rotate(0deg) scale(1);
          }
          50% {
            transform: translate(-50%, -50%) rotate(180deg) scale(1.15);
          }
          100% {
            transform: translate(-50%, -50%) rotate(360deg) scale(1);
          }
        }
      `}</style>

      {/* Animated rotating green and deep dark blur background aura */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.18] blur-3xl"
        style={{
          background: "conic-gradient(from 0deg at 50% 50%, #10b981 0deg, #022c22 120deg, #000000 240deg, #10b981 360deg)",
          animation: "bg-rotate 10s linear infinite",
        }}
      />

      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="relative flex w-full max-w-[17rem] flex-col items-center gap-8 text-center"
      >
        {/* Brand mark with orbiting progress arc */}
        <div className="relative grid size-20 place-items-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-separator border-t-accent motion-safe:animate-spin [animation-duration:1.6s]"
          />

          {/* Tinted disc so the glyphs have something to sit on */}
          <span aria-hidden className="absolute inset-[3px] rounded-full bg-accent/[0.06]" />

          {/* Center items aligned in a row, jumping sequentially */}
          <div aria-hidden className="absolute inset-0 flex items-center justify-center gap-1">
            {SPLASH_GLYPHS.map((glyph, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center text-accent motion-safe:will-change-transform"
                style={{
                  animation: "zepto-jump 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
                  animationDelay: `${i * 0.14}s`,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[16px]"
                >
                  {glyph}
                </svg>
              </span>
            ))}
          </div>
        </div>

        {/* Wordmark */}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-foreground">
            ZYRAVA
          </p>
          <p className="text-[10px] uppercase tracking-[0.24em] text-muted">
            Listening studio
          </p>
        </div>

        {/* Progress line + status */}
        <div className="w-full space-y-2.5">
          <span aria-hidden className="relative block h-px w-full overflow-hidden bg-surface">
            <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent motion-safe:animate-[splash-sweep_1.4s_ease-in-out_infinite]" />
          </span>
          <p className="text-[11px] tracking-wide text-faint-foreground">
            Hey it's you Hmmm....?
          </p>
        </div>
      </div>
    </div>
  );
}