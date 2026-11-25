"use client";
import type { ReactNode } from "react";
import { ChatPopover } from "./ChatPopover";

export function ChatDropdown({ anchor, title, compact = false, children, onClose }: {
  anchor: HTMLElement; title: string; compact?: boolean; children: ReactNode; onClose: () => void;
}) {
  return <ChatPopover anchor={anchor} title={title} compact={compact} onClose={onClose}>{children}</ChatPopover>;
}
