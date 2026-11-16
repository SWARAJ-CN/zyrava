"use client";

import { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

/*
 * The player otherwise pulls its WASM from jsdelivr on first use. This screen is
 * what a user sees when the origin is unreachable, so the runtime is served from
 * the same place as the animation and cached with it. The version sits in the
 * filename: an upgrade writes a new file instead of leaving a stale one cached.
 */
DotLottie.setWasmUrl("/animations/dotlottie-player-0.82.1.wasm");

export function WakeAnimation({ personal = false, phase = "waking" }: {
  personal?: boolean;
  phase?: "initial" | "waking";
}) {
  const src = personal
    ? phase === "initial"
      ? "/animations/personal-welcome-0bf92b1d.lottie"
      : "/animations/server-wake-8264bd03.lottie"
    : "/animations/server-wake.lottie";
  return (
    <DotLottieReact
      src={src}
      loop
      autoplay
      style={{ width: phase === "initial" ? "11rem" : "8.5rem", height: phase === "initial" ? "11rem" : "8.5rem" }}
    />
  );
}
