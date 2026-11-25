"use client";
import { useMemo } from "react";
import { Link } from "@heroui/react";
import { chatTextParts } from "@/lib/chat-links";

export function ChatText({ text }: { text: string }) {
  const parts = useMemo(() => chatTextParts(text), [text]);
  return <>{parts.map((part, index) => part.href ? <Link key={index} href={part.href}
    target={part.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer"
    className="inline whitespace-normal break-words font-semibold text-inherit underline decoration-current/50 underline-offset-3 [overflow-wrap:anywhere] hover:decoration-current focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">{part.text}</Link> : part.text)}</>;
}
