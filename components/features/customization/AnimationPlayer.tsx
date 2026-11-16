"use client";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useReducedMotion } from "framer-motion";
import { CUSTOM_ANIMATIONS, type AnimationId } from "@/lib/customization";
DotLottie.setWasmUrl("/animations/dotlottie-player-0.82.1.wasm");
export function AnimationPlayer({ id }: { id: AnimationId }) {
  const reduced = useReducedMotion();
  const asset = CUSTOM_ANIMATIONS.find((item) => item.id === id);
  if (!asset || reduced) return null;
  return (
    <DotLottieReact
      src={asset.src}
      autoplay
      loop
      useFrameInterpolation={false}
      renderConfig={{
        autoResize: true,
        devicePixelRatio: Math.min(
          3,
          Math.max(2, window.devicePixelRatio || 1),
        ),
        quality: 100,
        freezeOnOffscreen: true,
      }}
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}
