"use client";

import { usePathname } from "next/navigation";
import { SideBar } from "@/components/features/music/SideBar";
import { MixerConsole } from "@/components/features/music/MixerConsole";
import { StickyPlayerBar } from "@/components/features/music/StickyPlayerBar";
import { useAuth } from "@/components/providers/AuthProvider";

const AUTH_ROUTES = new Set(["/login", "/register"]);

/**
 * The player shell belongs to the signed-in music app. It stays unmounted on
 * the account screens and while the session is still being restored, so the
 * first paint is never a half-drawn private page.
 */
export function AppChrome() {
  const pathname = usePathname();
  const { status } = useAuth();
  if (AUTH_ROUTES.has(pathname) || status !== "authenticated") return null;
  return (
    <>
      <SideBar />
      <MixerConsole />
      <StickyPlayerBar />
    </>
  );
}
