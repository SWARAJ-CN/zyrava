import type { HTMLAttributes } from "react";
import { Chip } from "@heroui/react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, "default" | "accent" | "success" | "warning" | "danger"> = {
  neutral: "default",
  brand: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "accent",
};

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <Chip
      color={TONES[tone]}
      variant="soft"
      size="sm"
      className={cn("font-semibold", className)}
      {...props}
    >
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
}
