"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { SupportConsole } from "@/components/features/customization/SupportConsole";
import { cn } from "@/lib/cn";

export default function SupportPage() {
  const { user, personalExperience } = useAuth();
  const { sidebarWide, setMobileNavOpen, current } = useMusicPlayer();
  const router = useRouter();
  useEffect(() => {
    if (personalExperience) router.replace("/");
  }, [personalExperience, router]);
  if (personalExperience) return null;
  return (
    <main
      data-playing={current ? "true" : undefined}
      className={cn(
        "customize-page dock-offset",
        !sidebarWide && "dock-offset--rail",
      )}
    >
      <button
        className="customize-mobile-menu"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
      >
        Menu
      </button>
      {user ? (
        <SupportConsole key={user.id} />
      ) : (
        <section className="payment-history-empty">
          <h1>Buy A Mug</h1>
          <p>A little support helps keep Zyrava growing.</p>
          <Link href="/login?next=/support">Sign in to support Zyrava</Link>
        </section>
      )}
    </main>
  );
}
