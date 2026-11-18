"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Music2 } from "lucide-react";
import {
  dancingCharacterSource,
  type DancingCharacter,
} from "@/lib/dancing-characters";

DotLottie.setWasmUrl("/animations/dotlottie-player-0.82.1.wasm");

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const readMotion = () => window.matchMedia(motionQuery).matches;

export function DancingCharacterPlayer({
  character,
  playing = true,
}: {
  character: DancingCharacter;
  playing?: boolean;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    readMotion,
    () => true,
  );
  const [player, setPlayer] = useState<DotLottie | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bindPlayer = useCallback(
    (instance: DotLottie | null) => setPlayer(instance),
    [],
  );

  useEffect(() => {
    if (!player) return;
    const sync = () => {
      if (!player.isLoaded) return;
      setLoaded(true);
      if (reducedMotion) {
        player.pause();
        player.setFrame(Math.round(player.totalFrames / 3));
      } else if (playing) player.play();
      else player.pause();
    };
    const fail = () => setFailed(true);
    player.addEventListener("load", sync);
    player.addEventListener("loadError", fail);
    sync();
    return () => {
      player.removeEventListener("load", sync);
      player.removeEventListener("loadError", fail);
    };
  }, [player, playing, reducedMotion]);

  if (failed)
    return (
      <div role="status" className="dance-player-message">
        <Music2 aria-hidden="true" />
        <span>Character unavailable. Choose another dancer.</span>
      </div>
    );
  return (
    <div
      className="dance-character-player"
      data-dance-playing={playing && !reducedMotion ? "true" : "false"}
      data-dance-loaded={loaded || undefined}
    >
      {!loaded ? (
        <span className="dance-player-message" role="status">
          Loading character…
        </span>
      ) : null}
      <DotLottieReact
        src={dancingCharacterSource(character)}
        dotLottieRefCallback={bindPlayer}
        autoplay={playing && !reducedMotion}
        loop
        volume={0}
        useFrameInterpolation={false}
        renderConfig={{
          autoResize: true,
          devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
          freezeOnOffscreen: true,
        }}
        layout={{ fit: "contain", align: [0.5, 0.5] }}
        style={{ width: "100%", height: "100%" }}
        aria-hidden="true"
      />
    </div>
  );
}
