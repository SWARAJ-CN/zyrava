"use client";

import { useEffect, useRef } from "react";

/** Inactivity before the first wake-up nudge. */
const FIRST_AFTER = 60 * 60_000;
/** The first two nudges come in 20 minutes apart. */
const EARLY_EVERY = 20 * 60_000;
/** From two hours of quiet on, one ping an hour is plenty. */
const LATE_EVERY = 60 * 60_000;
/** How often the idle clock is read. */
const TICK_EVERY = 30_000;

/** The wake-ups rotate, so a day of silence never reads as one drone. */
const MESSAGES = [
  { body: "The queue is ready when you are — pick up where you left off." },
  { body: "Your taste has moved on since this morning. Come hear what's next." },
  { body: "Still there? Your last played track is waiting on deck." },
  { body: "A new radio run is built from what you've been playing. Open ZYRAVA." },
];

function messageSeed(): number {
  try {
    const stored = window.sessionStorage.getItem("zyrava:idle-seed");
    const next = stored ? (Number(stored) + 1) % MESSAGES.length : 0;
    window.sessionStorage.setItem("zyrava:idle-seed", String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * MESSAGES.length);
  }
}

/** Pushes the notification through the service worker when it can — that
 *  works in both the installed app and a plain browser tab — and falls back
 *  to the page-level Notification for the sessions without one. */
async function push(title: string, body: string): Promise<void> {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: "/icons/pwa-192x192.png",
        badge: "/icons/pwa-192x192.png",
        tag: "zyrava-idle",
        // One tap on the wake-up opens the player.
        data: { url: window.location.origin },
      });
      return;
    }
  } catch {
    /* a missing worker is the fallback's cue, not an error */
  }
  try {
    new Notification(title, { body, icon: "/icons/pwa-192x192.png", tag: "zyrava-idle" });
  } catch {
    /* notifications refused — the app above still speaks for itself */
  }
}

/**
 * The inactivity wake-up. Any gesture stands the clock back to zero; once the
 * app has gone quiet for an hour the microphone of the OS (the notification
 * shade or assistant) gets a nudge — the first two twenty minutes apart, then
 * once an hour from the two-hour mark on. Tapping one reopens the player.
 *
 * The schedule runs in the page rather than the worker on purpose: only an
 * open app owes the reminder, and a page that is open can count just as well.
 */
export function IdleNotifier() {
  const lastActivityRef = useRef(0);
  const lastNotifiedAtRef = useRef(0);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    /* Asking cold is a shot in the dark; the reader grants it once they have
       touched the app, which is also when a notification makes sense. */
    const ask = () => {
      if (("Notification" in window) && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    };
    window.addEventListener("pointerdown", ask, { once: true });

    const awake = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "click", "touchstart", "wheel"] as const;
    for (const event of events) window.addEventListener(event, awake, { passive: true });
    const onVisible = () => {
      if (document.visibilityState === "visible") awake();
    };
    document.addEventListener("visibilitychange", onVisible);

    const tick = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        /* A visible app is a used app — the shade keeps its silence. */
        lastNotifiedAtRef.current = 0;
        return;
      }
      const quiet = Date.now() - lastActivityRef.current;
      if (quiet < FIRST_AFTER) return;
      const sinceNotified = Date.now() - lastNotifiedAtRef.current;
      const gap = quiet < 2 * FIRST_AFTER ? EARLY_EVERY : LATE_EVERY;
      // First nudge of a quiet stretch ignores the gap; the rest pace off it.
      if (lastNotifiedAtRef.current && sinceNotified < gap) return;
      lastNotifiedAtRef.current = Date.now();
      const { body } = MESSAGES[messageSeed()];
      void push("ZYRAVA", body);
    }, TICK_EVERY);

    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pointerdown", ask);
      for (const event of events) window.removeEventListener(event, awake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
