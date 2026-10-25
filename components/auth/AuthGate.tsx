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

const GLYPH_RADIUS = 24;

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
      {/* Soft ambient glow behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.05] blur-3xl"
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

          {/* Every glyph, arranged on a small circle, each hopping on its own beat */}
          <div aria-hidden className="absolute inset-0">
            {SPLASH_GLYPHS.map((glyph, i) => {
              const angle =
                (-90 + (360 / SPLASH_GLYPHS.length) * i) * (Math.PI / 180);
              const x = Math.cos(angle) * GLYPH_RADIUS;
              const y = Math.sin(angle) * GLYPH_RADIUS;

              return (
                <span
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  }}
                >
                  <span
                    className="block text-accent motion-safe:animate-[splash-hop_1.15s_ease-in-out_infinite] motion-safe:will-change-transform"
                    style={{
                      animationDelay: `${-i * 190}ms`,
                      animationDuration: `${1.05 + (i % 3) * 0.12}s`,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-[18px]"
                    >
                      {glyph}
                    </svg>
                  </span>
                </span>
              );
            })}
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
            Restoring your session
          </p>
        </div>
      </div>
    </div>
  );
}