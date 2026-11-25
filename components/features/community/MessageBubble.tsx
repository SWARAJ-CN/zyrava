"use client";
import { useEffect, useRef } from "react";
import { Button } from "@heroui/react";
import { Check, CheckCheck, MoreHorizontal, Reply } from "lucide-react";
import { cn } from "@/lib/cn";
import { CHAT_REACTIONS, type MessageItem } from "@/lib/community";
import { ChatText } from "./ChatText";
import { ChatMedia } from "./ChatMedia";

export function MessageBubble({ message, currentUserId, name, onOptions, optionsOpen, onReplyJump, onRetry, onMediaLoad }: {
  message: MessageItem; currentUserId: string; name: string; onOptions: (anchor: HTMLElement) => void; optionsOpen: boolean; onReplyJump: (messageId: string) => void; onRetry: () => void; onMediaLoad: () => void;
}) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const canAct = !message.pending && !message.failed;
  const cancel = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return <div className={cn("flex", message.mine ? "justify-end" : "justify-start")}>
    <div data-message-id={message.id} tabIndex={-1} className={cn("relative max-w-[min(34rem,90%)] rounded-2xl px-3.5 py-2.5 outline-none data-[reply-highlight=true]:outline-2 data-[reply-highlight=true]:outline-offset-4 data-[reply-highlight=true]:outline-accent", message.mine ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md border border-dock-line bg-background text-foreground")}
      style={{ WebkitTouchCallout: "none" }}
      onContextMenu={event => { if (canAct && !(event.target as HTMLElement).closest("a")) { event.preventDefault(); cancel(); onOptions(event.currentTarget); } }}
      onPointerDown={event => { suppressClick.current = false; if (!canAct || event.button !== 0 || (event.target as HTMLElement).closest("button,a,input,video")) return; origin.current = { x: event.clientX, y: event.clientY }; cancel(); const anchor = event.currentTarget; hold.current = setTimeout(() => { hold.current = null; suppressClick.current = true; onOptions(anchor); }, 500); }}
      onPointerMove={event => { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancel(); }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      {message.reply ? <Button variant="ghost" isDisabled={message.reply.deleted} aria-label={message.reply.deleted ? "Original message unavailable" : "Go to original message"} onPress={() => { if (message.reply) onReplyJump(message.reply.id); }} className="mb-2 flex h-auto w-full justify-start items-start whitespace-normal gap-2 text-inherit rounded-lg border-l-2 border-current bg-black/10 p-2.5 text-left text-xs transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-65"><Reply className="mt-0.5 size-3.5 shrink-0 opacity-70" /><div className="min-w-0"><p className="font-semibold">{message.reply.from === currentUserId ? "You" : name}</p><p className="line-clamp-2 break-words opacity-80">{message.reply.deleted ? "Message unavailable" : message.reply.text || (message.reply.kind === "image" ? "Photo" : message.reply.kind === "video" ? "Video" : "Voice message")}</p></div></Button> : null}
      {message.deleted ? <p className="py-1 text-xs italic opacity-65">Message deleted</p> : <>
        {message.attachment ? <ChatMedia attachment={message.attachment} onLoad={onMediaLoad} /> : null}
        {message.text ? <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"><ChatText text={message.text} /></p> : null}
      </>}
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px]">
        {message.editedAt && !message.deleted ? <span className="opacity-65">edited</span> : null}<time className="opacity-70" dateTime={message.createdAt}>{time}</time>
        {message.pending ? <span>sending…</span> : message.failed ? <Button variant="ghost" size="sm" onPress={onRetry} className="h-auto min-w-0 p-0 text-[10px] font-semibold text-danger underline underline-offset-2">failed — retry</Button> : message.mine ? <span className="inline-flex items-center gap-1 font-medium opacity-80" aria-label={message.seen ? "Seen" : "Sent"}>{message.seen ? <CheckCheck className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}{message.seen ? "Seen" : "Sent"}</span> : null}
        {canAct ? <Button variant="ghost" isIconOnly size="sm" onPress={event => { if (event.target instanceof HTMLElement) onOptions(event.target); }} aria-label="Message options" aria-haspopup="menu" aria-expanded={optionsOpen} className="-mr-1 grid size-7 min-w-0 p-0 text-inherit shrink-0 place-items-center rounded-full opacity-65 hover:bg-black/10 hover:opacity-100 focus-visible:outline-2"><MoreHorizontal className="size-4" /></Button> : null}
      </div>
      {message.reactions?.length && !message.deleted ? <div className="mt-1 flex flex-wrap gap-1" aria-label="Message reactions">{CHAT_REACTIONS.map(emoji => { const reactions = message.reactions?.filter(reaction => reaction.emoji === emoji) ?? []; return reactions.length ? <Button variant="secondary" size="sm" key={emoji} onPress={event => { if (event.target instanceof HTMLElement) onOptions(event.target); }} aria-label={`${emoji}, ${reactions.length} reaction${reactions.length > 1 ? "s" : ""}`} aria-pressed={reactions.some(reaction => reaction.userId === currentUserId)} className="flex h-auto min-h-7 min-w-0 items-center gap-1 rounded-full bg-background/90 px-2 text-xs text-foreground aria-pressed:ring-1 aria-pressed:ring-current">{emoji}<span className="text-[10px]">{reactions.length}</span></Button> : null; })}</div> : null}
    </div>
  </div>;
}
