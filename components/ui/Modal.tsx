"use client";

import { useEffect, type ReactNode } from "react";
import { Modal as HeroModal } from "@heroui/react";

type Size = "sm" | "md" | "lg" | "xl";

const WIDTHS: Record<Size, string> = {
  sm: "max-w-[26rem]",
  md: "max-w-[34rem]",
  lg: "max-w-[46rem]",
  xl: "max-w-[64rem]",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: Size;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  children,
}: ModalProps) {
  // React Aria locks <html>'s scroll for every open overlay and undoes the lock
  // when the last one closes. Having two overlays land on the same tick — or an
  // exit animation racing an unmount — can leave the "hidden" behind, and with
  // it the whole page stops responding to wheel and touch: every control behind
  // the seam feels dead. So after each of our close paths, if no other modal is
  // standing on screen, sweep any leftover lock away.
  useEffect(() => {
    if (open) return;
    const sweep = () => {
      if (document.querySelector(".modal__backdrop")) return;
      const html = document.documentElement;
      if (html.style.overflow === "hidden") {
        html.style.removeProperty("overflow");
        html.style.removeProperty("scrollbar-gutter");
        html.style.removeProperty("padding-right");
      }
    };
    const first = window.setTimeout(sweep, 550);
    const second = window.setTimeout(sweep, 1300);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [open]);

  return (
    <HeroModal.Root
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      {/*
        React Aria's DialogTrigger expects a pressable trigger. This modal is
        driven entirely from outside, so an inert one keeps the overlay's press
        wiring (and its enter/exit animation) intact without rendering any UI.
      */}
      <HeroModal.Trigger aria-hidden className="hidden" tabIndex={-1} />
      <HeroModal.Backdrop isDismissable variant="blur">
        <HeroModal.Container placement="center" size="md" scroll="inside">
          <HeroModal.Dialog className={WIDTHS[size]}>
            <HeroModal.Header>
              <div className="min-w-0">
                <HeroModal.Heading className="text-base font-semibold text-foreground">
                  {title}
                </HeroModal.Heading>
                {description ? (
                  <p className="mt-0.5 text-xs text-muted">{description}</p>
                ) : null}
              </div>
              <HeroModal.CloseTrigger />
            </HeroModal.Header>

            <HeroModal.Body>{children}</HeroModal.Body>

            {footer ? <HeroModal.Footer>{footer}</HeroModal.Footer> : null}
          </HeroModal.Dialog>
        </HeroModal.Container>
      </HeroModal.Backdrop>
    </HeroModal.Root>
  );
}
