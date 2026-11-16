"use client";
import { useCustomization } from "@/components/providers/CustomizationProvider";
export function CustomizationCredit() {
  const { active } = useCustomization();
  if (!active) return null;
  return (
    <p className="break-words text-center text-xs leading-relaxed text-muted">
      Created for you by{" "}
      <strong className="font-semibold text-foreground">
        {active.creator.name || "ZYRAVA listener"}
      </strong>
      {active.creator.email ? (
        <>
          {" "}
          · <span>{active.creator.email}</span>
        </>
      ) : null}
    </p>
  );
}
