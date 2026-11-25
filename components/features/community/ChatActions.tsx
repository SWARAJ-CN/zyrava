"use client";
import { useEffect, useState } from "react";
import { Ban, Eraser, Pencil, Reply, Trash2, ArrowLeft } from "lucide-react";
import { Menu, TextArea } from "@heroui/react";
import { ChatDropdown } from "./ChatDropdown";
import { Button } from "@/components/ui/Button";
import { CHAT_EDIT_WINDOW, CHAT_REACTIONS, MAX_CHAT_MESSAGE, type ConversationItem, type MessageAction, type MessageItem } from "@/lib/community";

const actionClass = "h-12 w-full justify-start gap-3 rounded-xl px-3 text-sm";

export function MessageActions({ anchor, message, currentUserId, disabled, onReply, onChange, onClose }: {
  anchor: HTMLElement; message: MessageItem; currentUserId: string; disabled: boolean; onReply: () => void;
  onChange: (action: MessageAction) => Promise<void>; onClose: () => void;
}) {
  const [view, setView] = useState<"actions" | "edit" | "delete">("actions");
  const [text, setText] = useState(message.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const canEdit = message.mine && !message.deleted && !disabled && now - new Date(message.createdAt).getTime() < CHAT_EDIT_WINDOW;
  const ownReaction = message.reactions?.find(reaction => reaction.userId === currentUserId)?.emoji;
  const act = async (action: MessageAction) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await onChange(action); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't update this message. Try again."); }
    finally { setBusy(false); }
  };
  return <ChatDropdown anchor={anchor} title={view === "edit" ? "Edit message" : view === "delete" ? "Delete message" : "Message options"} onClose={() => { if (!busy) onClose(); }}>
    {view === "actions" ? <>
      {!message.deleted && !disabled ? <div role="group" aria-label="React to message" className="mb-3 grid grid-cols-4 gap-2 rounded-2xl bg-surface-secondary p-2">{CHAT_REACTIONS.map((emoji, index) => <Button key={emoji} variant={ownReaction === emoji ? "primary" : "ghost"} aria-label={["React with love", "React with laughter", "React with surprise", "React with thumbs up"][index]} aria-pressed={ownReaction === emoji} disabled={busy} onClick={() => void act({ action: "react", emoji: ownReaction === emoji ? null : emoji })} className="h-12 min-w-0 rounded-xl text-2xl">{emoji}</Button>)}</div> : null}
      <Menu aria-label="Message options" autoFocus="first" shouldCloseOnSelect={false} className="p-0">
        {!message.deleted && !disabled ? <Menu.Item id="reply" textValue="Reply" isDisabled={busy} onAction={onReply} className={actionClass}><Reply className="size-4" /><span>Reply</span></Menu.Item> : null}
        {canEdit ? <Menu.Item id="edit" textValue="Edit message" isDisabled={busy} onAction={() => setView("edit")} className={actionClass}><Pencil className="size-4" /><span>Edit message</span><span className="ml-auto text-[10px] text-muted">20 min</span></Menu.Item> : null}
        <Menu.Item id="delete" textValue="Delete message" isDisabled={busy} onAction={() => setView("delete")} className={`${actionClass} text-danger`}><Trash2 className="size-4" /><span>Delete message</span></Menu.Item>
      </Menu>
    </> : view === "edit" ? <>
      <label htmlFor="edit-chat-message" className="mb-2 block text-xs text-muted">Changes are available for 20 minutes after sending.</label>
      <TextArea id="edit-chat-message" value={text} onChange={event => setText(event.target.value)} maxLength={MAX_CHAT_MESSAGE} rows={4} autoFocus disabled={busy || !canEdit} className="w-full resize-none rounded-xl border border-separator bg-surface-secondary p-3 text-base outline-none focus:border-accent" />
      {!canEdit ? <p className="mt-2 text-xs text-muted">The edit window has ended.</p> : null}
      <Button loading={busy} disabled={!text.trim() || !canEdit || text.trim() === message.text} onClick={() => void act({ action: "edit", text })} className="mt-4 h-11 w-full rounded-xl">Save changes</Button>
    </> : <>
      <p className="mb-4 text-sm leading-relaxed text-muted">Delete just this message from your chat, or remove your own message for everyone.</p>
      <Button variant="secondary" disabled={busy} onClick={() => void act({ action: "delete", scope: "me" })} className={actionClass}><Trash2 className="size-4" />Delete for me</Button>
      {message.mine && !message.deleted ? <Button variant="ghost" disabled={busy} onClick={() => void act({ action: "delete", scope: "everyone" })} className={`${actionClass} mt-2 text-danger`}><Trash2 className="size-4" />Delete for everyone</Button> : null}
    </>}
    {error ? <p role="alert" className="mt-3 text-xs text-danger">{error}</p> : null}
    {view !== "actions" ? <Button variant="ghost" disabled={busy} onClick={() => { setView("actions"); setError(""); }} className="mt-3 w-full gap-2 text-xs"><ArrowLeft className="size-3.5" />Back</Button> : null}
  </ChatDropdown>;
}

export function ConversationActions({ anchor, conversation, onBlock, onClear, onClose }: { anchor: HTMLElement; conversation: ConversationItem; onBlock: (blocked: boolean) => Promise<void>; onClear: () => Promise<void>; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState<"block" | "clear" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { if (confirmation === "clear") await onClear(); else await onBlock(!conversation.blockedByMe); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); } finally { setBusy(false); }
  };
  const blockLabel = conversation.blockedByMe ? "Unblock user" : "Block user";
  return <ChatDropdown anchor={anchor} compact={!confirmation} title={confirmation === "clear" ? "Clear this chat?" : confirmation === "block" ? `${blockLabel}?` : "Chat options"} onClose={() => { if (!busy) onClose(); }}>
    {confirmation ? <><p className="mb-4 px-2 pt-2 text-xs leading-relaxed text-muted">{confirmation === "clear" ? "This removes the messages from your chat history. The other person's history stays unchanged. This cannot be undone." : conversation.blockedByMe ? "You'll be able to exchange messages again once neither person has the other blocked." : "You won't exchange messages or voice notes with this person until you unblock them. Your existing messages stay in the chat."}</p><Button loading={busy} onClick={() => void act()} className="h-11 w-full rounded-xl">{confirmation === "clear" ? "Clear for me" : blockLabel}</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirmation(null)} className="mt-2 w-full">Cancel</Button></> : <>
      <Menu aria-label="Chat options" autoFocus="first" shouldCloseOnSelect={false} className="p-0">
        <Menu.Item id="block" textValue={blockLabel} onAction={() => setConfirmation("block")} className={actionClass}><Ban className="size-4" /><span>{blockLabel}</span></Menu.Item>
        <Menu.Item id="clear" textValue="Clear chat" onAction={() => setConfirmation("clear")} className={`${actionClass} text-danger`}><Eraser className="size-4" /><span>Clear chat</span></Menu.Item>
      </Menu>
    </>}
    {error ? <p role="alert" className="mt-3 text-xs text-danger">{error}</p> : null}
  </ChatDropdown>;
}
