"use client";

import type { ReactNode } from "react";
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
