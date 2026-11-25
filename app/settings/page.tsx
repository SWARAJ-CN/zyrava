"use client";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { ProfileSettings } from "@/components/features/settings/ProfileSettings";
import { cn } from "@/lib/cn";
export default function SettingsPage() {
  const { user } = useAuth();
  const { sidebarWide, setMobileNavOpen, current } = useMusicPlayer();
  return <main data-playing={current ? "true" : undefined} className={cn("customize-page dock-offset", !sidebarWide && "dock-offset--rail")}>
    <button type="button" className="customize-mobile-menu mb-6" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">Menu</button>
    <div className="px-4 sm:px-8">{user ? <ProfileSettings key={user.id} /> : <section className="mx-auto max-w-xl py-12"><h1 className="text-3xl font-bold">Settings</h1><p className="my-4 text-muted">Sign in to update your profile photo.</p><Link href="/login?next=/settings" className="text-brand">Sign in</Link></section>}</div>
  </main>;
}
