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
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="relative grid size-14 place-items-center">
          <span
            className="absolute inset-0 rounded-2xl border-2 border-separator border-t-accent motion-safe:animate-spin"
            aria-hidden
          />
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Icon name="music" className="size-5" strokeWidth={2.2} />
          </span>
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
            Restoring your session
          </p>
          <p className="pt-2 text-xs text-faint-foreground">ZYRAVA · Listening studio</p>
        </div>
        <span aria-hidden className="relative h-0.5 w-32 overflow-hidden rounded-full bg-surface">
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent motion-safe:animate-[splash-sweep_1.15s_ease-in-out_infinite]" />
        </span>
      </div>
    </div>
  );
}
