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

export function WakeAnimation() {
  return (
    <DotLottieReact
      src="/animations/server-wake.lottie"
      loop
      autoplay
      style={{ width: "8.5rem", height: "8.5rem" }}
    />
  );
}
