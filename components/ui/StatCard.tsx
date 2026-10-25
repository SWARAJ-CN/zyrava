"use client";

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card, Chip } from "@heroui/react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { Sparkline } from "@/components/charts/Sparkline";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: string;
  change?: number | null;
  changeLabel?: string;
  /** true when a rise is good (revenue), false when a rise is bad (expenses). */
  positiveIsGood?: boolean;
  spark?: number[];
  hint?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "var(--brand)",
  change = null,
  changeLabel,
  positiveIsGood = true,
  spark,
  hint,
}: StatCardProps) {
  const rising = (change ?? 0) > 0.05;
  const falling = (change ?? 0) < -0.05;
  const good = rising ? positiveIsGood : falling ? !positiveIsGood : true;
  const TrendIcon = rising ? ArrowUpRight : falling ? ArrowDownRight : Minus;

  return (
    <Card className="relative gap-3 overflow-clip p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
        <span
          className="grid size-9 flex-none place-items-center rounded-xl"
          style={{
            backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          <Icon className="size-5" />
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {change !== null ? (
            <Chip
              color={good ? "success" : "danger"}
              variant="soft"
              size="sm"
              className={cn("font-semibold")}
            >
              <Chip.Label className="inline-flex items-center gap-1">
                <TrendIcon className="size-3.5" />
                {formatPercent(change)}
              </Chip.Label>
            </Chip>
          ) : null}
          {changeLabel ? (
            <p className="mt-1 text-[11px] text-muted">{changeLabel}</p>
          ) : hint ? (
            <p className="mt-1 text-[11px] text-muted">{hint}</p>
          ) : null}
        </div>
        {spark && spark.length > 1 ? (
          <Sparkline
            values={spark}
            color={accent}
            width={110}
            height={34}
            className="h-8 w-24 flex-none opacity-80"
          />
        ) : null}
      </div>
    </Card>
  );
}
