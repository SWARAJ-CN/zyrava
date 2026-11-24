"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Toast, toast as heroToast } from "@heroui/react";
import { announce } from "@/lib/announcer";
import { useI18n } from "./I18nProvider";
import { localeInfo } from "@/lib/i18n/locales";

type Variant = "success" | "error" | "info" | "warning";

interface ToastInput {
  title: string;
  description?: string;
  variant?: Variant;
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT: Record<Variant, "accent" | "success" | "warning" | "danger"> = {
  success: "success",
  error: "danger",
  info: "accent",
  warning: "warning",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  /* A toast carries the shop's own words, written in the language of the
     interface — so it is spoken in that language, whatever the assistant
     itself is speaking. */
  const speech = localeInfo(locale).speech;

  const value = useMemo<ToastContextValue>(() => {
    const show = ({ title, description, variant = "info", action }: ToastInput) => {
      const activate = () => { heroToast.close(id); action?.onPress(); };
      const content = action ? (
        <button type="button" onClick={activate} className="block w-full rounded-lg text-start focus-visible:outline-2 focus-visible:outline-accent">
          <span className="block font-semibold">{title}</span>
          {description ? <span className="mt-1 block text-sm font-normal text-muted">{description}</span> : null}
          <span className="mt-2 block text-xs font-semibold text-brand">{action.label} →</span>
        </button>
      ) : title;
      const id = heroToast(content, {
        description: action ? undefined : description,
        variant: VARIANT[variant],
        timeout: action ? 8000 : variant === "error" ? 6000 : 3500,
      });
      /* The voice says what the toast says, so the reader does not have to
         look at the screen to know something went through. */
      announce(description ? `${title}. ${description}` : title, { lang: speech });
    };
    return {
      toast: show,
      success: (title, description) => show({ title, description, variant: "success" }),
      error: (title, description) => show({ title, description, variant: "error" }),
    };
  }, [speech]);

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider
        placement="top end"
        className="zyrava-toasts"
        width="min(22rem, calc(100vw - 2rem))"
        maxVisibleToasts={2}
        gap={10}
      />
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
