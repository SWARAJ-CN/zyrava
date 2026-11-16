"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { cn } from "@/lib/cn";

const CustomizeConsole = dynamic(
  () =>
    import("@/components/features/customization/CustomizeConsole").then(
      (module) => module.CustomizeConsole,
    ),
  {
    loading: () => (
      <p className="p-8 text-muted" role="status">
        Opening Customize…
      </p>
    ),
  },
);

export default function CustomizePage() {
  const { personalExperience } = useAuth();
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
      <CustomizeConsole />
    </main>
  );
}
