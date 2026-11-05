"use client";

import { usePathname } from "next/navigation";
import { SideBar } from "@/components/features/music/SideBar";
import { MixerConsole } from "@/components/features/music/MixerConsole";
import { InstallSheet } from "@/components/features/music/InstallSheet";
import { ChatPanel } from "@/components/features/community/ChatPanel";
import { StickyPlayerBar } from "@/components/features/music/StickyPlayerBar";
import { useAuth } from "@/components/providers/AuthProvider";
import { useGuestLock } from "@/components/providers/GuestLockProvider";

const AUTH_ROUTES = new Set(["/login", "/register"]);

/**
 * The player shell belongs to the music app. It stays unmounted on the account
 * screens and while the session is still being restored, so the first paint is
 * never a half-drawn page. A guest gets the dock and the bar — the console is
 * the part they have not unlocked yet.
 */
export function AppChrome() {
  const pathname = usePathname();
  const { status } = useAuth();
  const { isGuest } = useGuestLock();
  if (AUTH_ROUTES.has(pathname) || (status !== "authenticated" && !isGuest)) return null;
  return (
    <>
      <SideBar />
      {isGuest ? null : <MixerConsole />}
      {/* The dock's download button leads here on iOS, where there is no prompt
          for a page to raise — and a guest can still add the app. */}
      <InstallSheet />
      <ChatPanel />
      <StickyPlayerBar />
    </>
  );
}
