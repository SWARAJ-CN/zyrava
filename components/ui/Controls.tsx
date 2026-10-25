"use client";

import { useId, type ReactNode } from "react";
import { CloseButton } from "@heroui/react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/providers/I18nProvider";
import { useRegisterVoiceOps } from "@/components/providers/VoiceOps";
import { searchTerm } from "@/lib/voice";
import { Icon } from "./icons";
import { ClickButton } from "./ClickButton";
import { Input } from "./Input";

interface Option {
  value: string;
  /** Spoken/read label — also the tooltip when an icon is shown. */
  label: string;
  /** When set, the control shows this glyph instead of the label text. */
  icon?: ReactNode;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: SegmentedControlProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        // `min-w-0` + horizontal scrolling keep the strip usable on narrow
        // phones instead of forcing the whole page wider than the screen.
        "inline-flex min-w-0 max-w-full flex-initial shrink items-center gap-0.5 overflow-x-auto rounded-field bg-segment p-0.5 shadow-field scrollbar-none",
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-none rounded-[calc(var(--radius-field)-3px)] px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200",
              selected
                ? "bg-surface text-foreground shadow-field"
                : "text-segment-foreground hover:text-foreground"
            )}
          >
            {option.icon ? (
              <span
                title={option.label}
                className="grid h-5 w-6 place-items-center [&>svg]:size-4"
              >
                {option.icon}
                <span className="sr-only">{option.label}</span>
              </span>
            ) : (
              option.label
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: SearchInputProps) {
  const { t, locale } = useI18n();
  const instance = useId();
  const language = locale.split("-")[0];

  /* The box can be filled by voice: "search for Asha" types Asha into it. */
  useRegisterVoiceOps(
    "search",
    [
      {
        id: `search-${instance}`,
        label: t("Search"),
        phrases: ["search", "find", "look for", "search for"],
        feedback: "",
        run: (spoken: string) => {
          const term = searchTerm(spoken, language);
          if (term) onChange(term);
        },
      },
    ]
  );

  return (
    <div className={cn("relative", className)}>
      <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-faint-foreground" />
      {/* `w-full` matters: a native input falls back to its intrinsic ~274px
          width, which bursts out of a fixed-width wrapper (`w-40`, `w-48`) and
          drags the whole page past the viewport on a phone. */}
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("Search…")}
        className="w-full ps-9 pe-9"
      />
      {value ? (
        <CloseButton
          aria-label={t("Clear search")}
          className="absolute end-1.5 top-1/2 -translate-y-1/2"
          onPress={() => onChange("")}
        />
      ) : null}
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  className,
}: PaginationProps) {
  const { t } = useI18n();

  /* Turning the page is something the reader can ask for by voice wherever a
     list is shown, so it is put up for the microphone here rather than on
     every page that happens to have one. The id carries the instance, so two
     lists on one page never claim the same command. */
  const instance = useId();
  useRegisterVoiceOps(
    "pagination",
    pageCount > 1
      ? [
          {
            id: `next-page-${instance}`,
            label: t("Next page"),
            phrases: ["next page", "more results", "page forward"],
            feedback: t("Next page"),
            run: () => onChange(Math.min(pageCount, page + 1)),
          },
          {
            id: `previous-page-${instance}`,
            label: t("Previous page"),
            phrases: ["previous page", "back a page", "page back"],
            feedback: t("Previous page"),
            run: () => onChange(Math.max(1, page - 1)),
          },
        ]
      : []
  );

  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 1, pageCount - 2));
  for (let index = start; index <= Math.min(pageCount, start + 2); index += 1) {
    pages.push(index);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-1 py-3",
        className
      )}
    >
      <p className="text-xs tabular-nums text-muted">
        {t("Showing {from}–{to} of {total}", { from, to, total })}
      </p>
      <div className="flex items-center gap-1">
        <ClickButton
          variant="outline"
          size="icon"
          square
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label={t("Previous page")}
          className="size-9"
        >
          <Icon name="chevron-left" className="size-4" />
        </ClickButton>
        {pages.map((value) => (
          <ClickButton
            key={value}
            type="button"
            size="sm"
            square
            variant={value === page ? "primary" : "ghost"}
            onClick={() => onChange(value)}
            aria-current={value === page ? "page" : undefined}
            className={cn(
              "h-9 min-w-9 px-2 text-xs font-semibold tabular-nums",
              value !== page && "text-muted hover:bg-surface-secondary hover:text-foreground"
            )}
          >
            {value}
          </ClickButton>
        ))}
        <ClickButton
          variant="outline"
          size="icon"
          square
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label={t("Next page")}
          className="size-9"
        >
          <Icon name="chevron-right" className="size-4" />
        </ClickButton>
      </div>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Shown before the title — e.g. the phone-only dock trigger. */
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, leading, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 pb-2",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
