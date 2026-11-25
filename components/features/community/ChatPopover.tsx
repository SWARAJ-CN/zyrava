"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Popover } from "@heroui/react";
import { UNSAFE_PortalProvider } from "react-aria";

/** Portal into the native chat dialog, keeping HeroUI overlays in its top layer. */
export function ChatPopover({ anchor, title, children, onClose, placement = "bottom end", compact = false, media = false }: {
  anchor: HTMLElement; title: string; children: ReactNode; onClose: () => void;
  placement?: "bottom end" | "top start"; compact?: boolean; media?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const triggerRef = useMemo(() => ({ current: anchor }), [anchor]);
  const getContainer = useCallback(() => anchor.closest<HTMLDialogElement>("dialog") ?? document.body, [anchor]);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  useLayoutEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.contains(event.target)) close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); anchor.focus({ preventScroll: true }); }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [anchor]);
  return <UNSAFE_PortalProvider getContainer={getContainer}>
    <Popover.Content ref={panel} isOpen isNonModal triggerRef={triggerRef} onOpenChange={open => { if (!open) close.current(); }}
      placement={placement} offset={8} containerPadding={8} shouldFlip shouldSkipAnimation
      shouldCloseOnInteractOutside={element => !anchor.contains(element)}
      className={`${media ? "w-[min(22rem,calc(100vw-2rem))]" : compact ? "w-[min(13rem,calc(100vw-2rem))]" : "w-[min(19rem,calc(100vw-2rem))]"} max-h-[min(80dvh,42rem)] overflow-y-auto overscroll-contain rounded-2xl border border-separator bg-background p-2 text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.3)]`}>
      <Popover.Dialog aria-label={title} className="outline-none">{children}</Popover.Dialog>
    </Popover.Content>
  </UNSAFE_PortalProvider>;
}
