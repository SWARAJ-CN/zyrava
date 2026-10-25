"use client";

import { useMemo, useRef, useContext } from "react";
import {
  CalendarDate,
  getLocalTimeZone,
  parseDate,
} from "@internationalized/date";
import { Calendar, DatePicker as HeroDatePicker } from "@heroui/react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { FieldLabelContext } from "@/components/ui/Input";
import { useI18n } from "@/components/providers/I18nProvider";

interface DateChangeEvent {
  target: { value: string };
}

interface DateInputProps {
  id?: string;
  /** ISO date string, `YYYY-MM-DD`. */
  value?: string;
  onChange?: (event: DateChangeEvent) => void;
  /** ISO date string, `YYYY-MM-DD`. */
  min?: string;
  /** ISO date string, `YYYY-MM-DD`. */
  max?: string;
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
  "aria-label"?: string;
}

function toCalendarDate(value?: string): CalendarDate | undefined {
  if (!value) return undefined;
  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}

export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  className,
  size = "md",
  placeholder,
  "aria-label": ariaLabel,
}: DateInputProps) {
  const { t } = useI18n();
  const date = useMemo(() => toCalendarDate(value), [value]);
  const minValue = useMemo(() => toCalendarDate(min), [min]);
  const maxValue = useMemo(() => toCalendarDate(max), [max]);
  // The calendar popover anchors to the trigger button; HeroUI's DatePicker only
  // wires this up internally, so we hand the same ref to both parts.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldLabel = useContext(FieldLabelContext);

  return (
    <HeroDatePicker
      aria-label={ariaLabel ?? fieldLabel ?? t("Date")}
      className={cn("w-full", className)}
      maxValue={maxValue}
      minValue={minValue}
      value={date ?? null}
      onChange={(next) => {
        onChange?.({ target: { value: next ? next.toString() : "" } });
      }}
    >
      <HeroDatePicker.Trigger
        ref={triggerRef}
        id={id}
        className={cn(
          // HeroUI's trigger defaults to a 28px field; match the height the
          // Select/Input controls use so filter rows line up.
          "min-h-9 gap-2 px-3",
          size === "sm" && "gap-1.5 px-2.5 text-xs"
        )}
      >
        <HeroDatePicker.TriggerIndicator />
        <span className={cn("truncate text-sm", !date && "text-field-placeholder")}>
          {date ? formatDate(date.toDate(getLocalTimeZone())) : (placeholder ?? t("Select date"))}
        </span>
      </HeroDatePicker.Trigger>

      <HeroDatePicker.Popover triggerRef={triggerRef}>
        <Calendar>
          <Calendar.Header>
            <Calendar.NavButton slot="previous" />
            <Calendar.Heading />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(day) => <Calendar.Cell date={day} />}
            </Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </HeroDatePicker.Popover>
    </HeroDatePicker>
  );
}
