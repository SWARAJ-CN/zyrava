"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/icons";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

/**
 * The music app is private. Anonymous visitors never see the home screen:
 * they get the branded splash while the refresh cookie is checked, then are
 * sent to /login with a `next` back to where they were headed.
 */
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
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
            <Icon name="music" className="size-6" strokeWidth={2.2} />
          </span>
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