"use client";
import dynamic from "next/dynamic";
import type { AnimationId } from "@/lib/customization";
const Player = dynamic(
  () => import("./AnimationPlayer").then((module) => module.AnimationPlayer),
  { ssr: false, loading: () => null },
);
export function CustomizationAnimation({
  id,
  className = "",
}: {
  id: AnimationId;
  className?: string;
}) {
  if (id === "none") return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none motion-reduce:hidden ${className}`}
    >
      <Player id={id} />
    </div>
  );
}
