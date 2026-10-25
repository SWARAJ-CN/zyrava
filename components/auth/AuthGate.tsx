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
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icon name="music" className="size-5" strokeWidth={2.2} />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
            Restoring your session
          </p>
          <p className="pt-2 text-xs text-faint-foreground">ZYRAVA · Listening studio</p>
        </div>
        <span className="h-0.5 w-24 overflow-hidden rounded-full bg-surface">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent" />
        </span>
      </div>
    </div>
  );
}
