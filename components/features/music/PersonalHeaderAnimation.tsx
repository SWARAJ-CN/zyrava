"use client";

import { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useReducedMotion } from "framer-motion";

DotLottie.setWasmUrl("/animations/dotlottie-player-0.82.1.wasm");

export function PersonalHeaderAnimation() {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  return (
    <DotLottieReact
      src="/animations/personal-header-80d44961.lottie"
      autoplay
      loop
      useFrameInterpolation={false}
      renderConfig={{ devicePixelRatio: 1, freezeOnOffscreen: true }}
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}
