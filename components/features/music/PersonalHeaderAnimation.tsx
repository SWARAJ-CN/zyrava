"use client";

import { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useReducedMotion } from "framer-motion";

DotLottie.setWasmUrl("/animations/dotlottie-player-0.82.1.wasm");

export function PersonalHeaderAnimation() {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  const pixelRatio = typeof window === "undefined" ? 2 : Math.max(2, window.devicePixelRatio || 1);
  return (
    <DotLottieReact
      src="/animations/personal-header-80d44961.lottie"
      autoplay
      loop
      useFrameInterpolation={false}
      // Keep fine character details sharp, including on standard-density screens.
      renderConfig={{ devicePixelRatio: pixelRatio, autoResize: true, quality: 100, freezeOnOffscreen: true }}
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}
