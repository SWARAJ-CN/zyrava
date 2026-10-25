"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";

/**
 * Signing out ends the listening session too: audio stops, the queue and the
 * now-playing/mixer panels clear before the redirect to /login.
 */
export function PlaybackSessionGuard() {
  const { status } = useAuth();
  const { endSession } = useMusicPlayer();
  const previous = useRef(status);

  useEffect(() => {
    if (previous.current === "authenticated" && status === "anonymous") {
      endSession();
    }
    previous.current = status;
  }, [status, endSession]);

  return null;
}
