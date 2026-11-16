"use client";

import { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useReducedMotion } from "framer-motion";

DotLottie.setWasmUrl("/animations/dotlottie-player-0.82.1.wasm");

/** Decorative only; mounted while the personal fullscreen reader is open. */
export function PersonalLyricsAnimation() {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  return (
    <DotLottieReact
      src="/animations/lyrics-heart-72f46866.lottie"
      loop
      autoplay
      speed={0.65}
      useFrameInterpolation={false}
      renderConfig={{ devicePixelRatio: 1, freezeOnOffscreen: true }}
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}
