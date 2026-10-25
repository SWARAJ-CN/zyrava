"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * A plain on/off switch. Built on a native button so it inherits the app's
 * tokens and needs no provider, and it reports itself as `role="switch"` to
 * screen readers.
 */
export function Switch({ checked, onChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-none cursor-pointer items-center rounded-full border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        checked ? "border-transparent bg-brand" : "border-border bg-surface-muted",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-1"
        )}
      />
    </button>
  );
}
