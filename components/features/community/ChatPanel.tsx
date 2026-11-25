"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Input, Tabs } from "@heroui/react";
import { MessageBubble } from "./MessageBubble";
import { MessageActions, ConversationActions } from "./ChatActions";
import { MessageComposer } from "./MessageComposer";
import { MoreVertical, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { ImagePreview } from "@/components/ui/ImagePreview";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCommunity } from "@/components/providers/CommunityProvider";
import { type ChatPerson, type MessageItem } from "@/lib/community";

type Rail = "threads" | "people" | "requests";

const ROW =
  "flex w-full items-start gap-3 rounded-2xl px-3 py-3.5 text-start text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent";

/** The presence dot every list shares, so green means the same thing anywhere. */
function Presence({ online, size = "md" }: { online: boolean; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex-none rounded-full",
        size === "md" ? "size-2.5" : "size-2",
        online ? "bg-[oklch(0.78_0.16_150)]" : "bg-faint-foreground/45"
      )}
    />
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-2.5 pb-2 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted">
      {children}
    </h2>
  );
}

function Avatar({ person, preview = true }: { person: ChatPerson; preview?: boolean }) {
  return (
    <span className="relative flex-none">
      {person.avatarUrl && preview ? <ImagePreview src={person.avatarUrl} alt={`${person.name}’s profile photo`} title={`${person.name}’s photo`} label={`View ${person.name}’s photo`} width={600} height={600} className="size-11 overflow-hidden rounded-2xl bg-accent-soft">
        <Image loading="eager" src={person.avatarUrl} alt="" width={88} height={88} className="size-full object-cover" />
      </ImagePreview> : <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-sm font-semibold text-foreground">
        {person.avatarUrl ? <Image loading="eager" src={person.avatarUrl} alt="" width={88} height={88} className="size-11 rounded-2xl object-cover" /> : initials(person.name)}
      </span>}
      <span className="pointer-events-none absolute -bottom-0.5 -end-0.5 rounded-full bg-background p-[2px]">
        <Presence online={person.online} size="sm" />
      </span>
    </span>
  );
}

/**
 * The community room: who asked to talk, the threads you have, and everyone
 * else on the dock, with signed media attachments scoped to accepted threads.
 */
export function ChatPanel() {
  const { user } = useAuth();
  const {
    chatOpen,
    messageSoundEnabled,
    toggleMessageSound,
    closeChat,
    connected,
    loading,
    error,
    conversations,
    requests,
    people,
    peopleQuery,
    activeConversation,
    activeId,
    messages,
    olderLoading,
    typingUsers,
    onlineIds,
    searchPeople,
    selectConversation,
    loadOlder,
    revealMessage,
    sendText,
    retryMessage, changeMessage, clearChat, blockChat,
    askToChat,
    respondTo,
    reportTyping,
    reportTypingStop,
  } = useCommunity();

  const [optionsFor, setOptionsFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [threadOptions, setThreadOptions] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const threadMenuButton = useRef<HTMLButtonElement>(null);
  const [reply, setReply] = useState<MessageItem | null>(null);
  const selectedMessage = messages.find(message => message.id === optionsFor?.id);
  const replyTarget = reply?.conversationId === activeId ? messages.find(message => message.id === reply.id && !message.deleted) ?? null : null;
  const [rail, setRail] = useState<Rail>("threads");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = user && activeId ? `${user.id}:${activeId}` : null;
  const draft = draftKey ? drafts[draftKey] ?? "" : "";
  const setDraft = useCallback((text: string) => {
    if (draftKey) setDrafts((previous) => ({ ...previous, [draftKey]: text }));
  }, [draftKey]);
  const [threadQuery, setThreadQuery] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pinnedRef = useRef(true);
  const previousThreadRef = useRef<string | null>(null);
  const olderAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const [askBusy, setAskBusy] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollingToReply = useRef(false);
  const jumpController = useRef<AbortController | null>(null);
  const pendingJump = useRef<{ id: string; conversationId: string } | null>(null);
  const highlight = useRef<{ node: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [jumpStatus, setJumpStatus] = useState<{ conversationId: string; loading: boolean; error?: string } | null>(null);
  useEffect(() => () => {
    jumpController.current?.abort(); pendingJump.current = null; scrollingToReply.current = false;
    if (highlight.current) { clearTimeout(highlight.current.timer); highlight.current.node.removeAttribute("data-reply-highlight"); }
  }, [activeId, chatOpen]);

  const jumpToReply = async (messageId: string) => {
    if (!activeId) return;
    jumpController.current?.abort();
    const controller = new AbortController(); jumpController.current = controller;
    pendingJump.current = { id: messageId, conversationId: activeId };
    scrollingToReply.current = true; pinnedRef.current = false; olderAnchorRef.current = null;
    setJumpStatus({ conversationId: activeId, loading: true });
    try {
      const found = await revealMessage(messageId, controller.signal);
      if (controller.signal.aborted) return;
      if (!found) { scrollingToReply.current = false; pendingJump.current = null; setJumpStatus(null); return; }
      setJumpStatus({ conversationId: activeId, loading: false });
    } catch (cause) {
      if (controller.signal.aborted) return;
      scrollingToReply.current = false; pendingJump.current = null;
      setJumpStatus({ conversationId: activeId, loading: false, error: cause instanceof Error ? cause.message : "Couldn't find the original message." });
    }
  };
  useEffect(() => {
    const jump = pendingJump.current;
    const scroll = scrollRef.current;
    if (!jump || jump.conversationId !== activeId || !scroll) return;
    const target = Array.from(scroll.querySelectorAll<HTMLElement>("[data-message-id]")).find(node => node.dataset.messageId === jump.id);
    if (!target) return;
    pendingJump.current = null;
    if (highlight.current) { clearTimeout(highlight.current.timer); highlight.current.node.removeAttribute("data-reply-highlight"); }
    const box = target.getBoundingClientRect(); const viewport = scroll.getBoundingClientRect();
    scroll.scrollTo({ top: Math.max(0, scroll.scrollTop + box.top - viewport.top - Math.max(16, (scroll.clientHeight - box.height) / 2)), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    target.focus({ preventScroll: true }); target.setAttribute("data-reply-highlight", "true");
    highlight.current = { node: target, timer: setTimeout(() => { target.removeAttribute("data-reply-highlight"); scrollingToReply.current = false; }, 2200) };
  }, [activeId, messages, jumpStatus]);

  // Native dialog contains focus and leaves the audio player mounted behind it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!chatOpen || !dialog) return;
    dialog.showModal();
    const viewport = window.visualViewport;
    const resize = () => {
      dialog.style.height = `${viewport?.height ?? window.innerHeight}px`;
      dialog.style.top = `${viewport?.offsetTop ?? 0}px`;
      dialog.style.bottom = "auto";
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      document.body.style.overflow = overflow;
    };
  }, [chatOpen]);

  const unreadThreads = useMemo(
    () => conversations.reduce((total, thread) => total + thread.unread, 0),
    [conversations]
  );

  /* Stay pinned to the newest message unless the reader has scrolled up to
     look at history — yanking them down mid-read is worse than a quiet update. */
  useEffect(() => {
    if (!chatOpen || !activeId) return;
    const node = scrollRef.current;
    if (!node) return;
    const anchor = olderAnchorRef.current;
    if (scrollingToReply.current) return;
    if (previousThreadRef.current !== activeId) {
      node.scrollTop = node.scrollHeight;
      pinnedRef.current = true;
      olderAnchorRef.current = null;
    } else if (anchor && !olderLoading) {
      node.scrollTop = anchor.top + node.scrollHeight - anchor.height;
      olderAnchorRef.current = null;
    } else if (pinnedRef.current && !anchor) node.scrollTop = node.scrollHeight;
    previousThreadRef.current = activeId;
  }, [messages, chatOpen, activeId, typingUsers.length, olderLoading]);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (node && !scrollingToReply.current) pinnedRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
  }, []);

  const typingLabel = useMemo(() => {
    if (!typingUsers.length) return null;
    const names = typingUsers
      .map((id) => activeConversation?.user.id === id ? activeConversation.user.name : null)
      .filter(Boolean);
    if (!names.length) return "typing…";
    return `${names[0]} ${names.length > 1 ? "and others are" : "is"} typing…`;
  }, [typingUsers, activeConversation]);

  const grouped = useMemo(() => {
    const out: Array<{ day: string; rows: MessageItem[] }> = [];
    for (const message of messages) {
      const label = dayLabel(message.createdAt);
      const bucket = out[out.length - 1];
      if (bucket && bucket.day === label) bucket.rows.push(message);
      else out.push({ day: label, rows: [message] });
    }
    return out;
  }, [messages]);

  if (!chatOpen) return null;

  const railCounts: Record<Rail, number> = {
    threads: unreadThreads,
    people: 0,
    requests: requests.incoming.length,
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="ZYRAVA community chat"
      onCancel={(event) => {
        event.preventDefault();
        if (activeId) selectConversation(null);
        else closeChat();
      }}
      className="community-dialog fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-background p-0 text-foreground"
    >
    <div className="community-shell flex h-full min-h-0 flex-col">
      {/* Head */}
      <header className="community-header flex min-h-20 flex-none items-center gap-3 border-b border-dock-line px-4 py-3 sm:px-6">
        <Button variant="secondary" size="icon" onClick={closeChat} aria-label="Back to music" className="size-11 shrink-0 rounded-2xl text-foreground hover:bg-accent-soft">
          <Icon name="chevron-right" className="size-5 rotate-180" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight tracking-tight text-foreground">
            Community
          </p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium leading-normal text-muted">
            <Presence online={connected} size="sm" />
            {connected ? "Connected · Keep the conversation going" : "Connecting to your community…"}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleMessageSound}
          title={messageSoundEnabled ? "Mute message sounds" : "Enable message sounds"}
          aria-label={messageSoundEnabled ? "Mute message sounds" : "Enable message sounds"}
          aria-pressed={messageSoundEnabled}>
          <Icon name={messageSoundEnabled ? "volume-2" : "volume-x"} className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={closeChat} title="Close community" aria-label="Close community">
          <Icon name="x" className="size-4" />
        </Button>
      </header>

      {error ? (
        <p className="flex-none border-b border-dock-line bg-danger-soft/40 px-4 py-2 text-[12px] text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Rail */}
        <section
          className={cn(
            "community-list min-h-0 w-full flex-col border-e border-dock-line md:flex md:w-[22rem]",
            activeId ? "hidden" : "flex"
          )}
        >
          <Tabs selectedKey={rail} onSelectionChange={key => setRail(key as Rail)} className="min-h-0 flex-1 gap-0">
          <Tabs.List aria-label="Community sections" className="community-tabs mx-4 mb-2 mt-4 flex w-auto flex-none self-stretch gap-1 rounded-2xl bg-surface-secondary p-1.5">
            {(["threads", "people", "requests"] as Rail[]).map((entry) => (
              <Tabs.Tab
                key={entry}
                id={entry}
                className={cn(
                  "min-h-11 flex-1 rounded-xl px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                  rail === entry
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:bg-background hover:text-foreground"
                )}
              >
                {entry === "threads" ? "Chats" : entry === "people" ? "People" : "Requests"}
                {railCounts[entry] ? (
                  <span className="ms-1.5 tabular-nums">{railCounts[entry]}</span>
                ) : null}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel id={rail} className="dock-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
            {rail === "people" ? (
              <div className="flex flex-col gap-2">
                <label className="relative block">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                    strokeWidth={1.9}
                  />
                  <Input
                    type="search"
                    value={peopleQuery}
                    onChange={(event) => searchPeople(event.target.value)}
                    placeholder="Find another listener"
                    aria-label="Find another listener"
                    className="h-12 w-full rounded-xl border border-dock-line bg-surface-secondary/40 ps-9 pe-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-faint-foreground focus:border-brand"
                  />
                </label>
                <SectionTitle>Find your people</SectionTitle>
                {people.map((person) => (
                  <div key={person.id} className={cn(ROW, "text-foreground")}>
                    <Avatar person={person} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{person.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {person.online
                          ? "Online now"
                          : person.lastSeenAt
                            ? `Last seen ${formatStamp(person.lastSeenAt)}`
                            : "No thread yet"}
                      </p>
                    </div>
                    <div className="flex-none">
                      {person.relation === "conversation" ? (
                        <Button variant="ghost" size="sm" onClick={() => {
                          const thread = conversations.find((item) => item.user.id === person.id);
                          if (thread) selectConversation(thread.id);
                        }}>
                          Open
                        </Button>
                      ) : person.relation === "outgoing" ? (
                        <span className="text-[11px] font-medium text-muted">Request sent</span>
                      ) : person.relation === "incoming" ? (
                        <span className="text-[11px] font-semibold text-brand">Wants to chat</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={askBusy === person.id}
                          onClick={() => {
                            setAskBusy(person.id);
                            void askToChat(person.id).finally(() => setAskBusy(null));
                          }}
                        >
                          Ask to chat
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!people.length && !loading ? (
                  <p className="px-2.5 py-6 text-center text-[12px] text-muted">
                    No other listeners here yet. Ask a friend to sign up — the community is only as
                    good as its company.
                  </p>
                ) : null}
              </div>
            ) : null}

            {rail === "requests" ? (
              <div className="flex flex-col gap-4">
                <section>
                  <SectionTitle>Waiting for you</SectionTitle>
                  {requests.incoming.length ? (
                    requests.incoming.map((request) => (
                      <div key={request.id} className={cn(ROW, "text-foreground")}>
                        <Avatar person={request.user} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{request.user.name}</p>
                          <p className="truncate text-[11px] text-muted">
                            Asked {formatStamp(request.createdAt)}
                          </p>
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => void respondTo(request.id, true)}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void respondTo(request.id, false)}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-2.5 py-4 text-[12px] text-muted">Nobody is waiting.</p>
                  )}
                </section>

                <section>
                  <SectionTitle>Asked by you</SectionTitle>
                  {requests.outgoing.length ? (
                    requests.outgoing.map((request) => (
                      <div key={request.id} className={cn(ROW, "text-muted")}>
                        <Presence online={request.user.online} />
                        <span className="min-w-0 flex-1 truncate">{request.user.name}</span>
                        <span className="flex-none text-[11px]">Pending</span>
                      </div>
                    ))
                  ) : (
                    <p className="px-2.5 py-4 text-[12px]">You have not asked anyone yet.</p>
                  )}
                </section>
              </div>
            ) : null}

            {rail === "threads" ? (
              <div className="flex flex-col gap-1">
                <label className="relative mb-4 block">
                  <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input type="search" value={threadQuery} onChange={(event) => setThreadQuery(event.target.value)} placeholder="Search your chats" aria-label="Search your chats" className="h-12 w-full rounded-xl border border-dock-line bg-surface-secondary/40 ps-10 pe-3 text-sm outline-none focus:border-brand" />
                </label>
                <SectionTitle>Your conversations</SectionTitle>
                {conversations.length > 0 && !conversations.some((thread) => thread.user.name.toLowerCase().includes(threadQuery.trim().toLowerCase())) ? <p className="px-3 py-6 text-sm text-muted">No chats match “{threadQuery}”.</p> : null}
                {conversations.length ? (
                  conversations.filter((thread) => thread.user.name.toLowerCase().includes(threadQuery.trim().toLowerCase())).map((thread) => (
                    <Button
                      key={thread.id}
                      variant="ghost"
                      onClick={() => selectConversation(thread.id)}
                      aria-current={activeId === thread.id || undefined}
                      className={cn(
                        ROW, "h-auto justify-start whitespace-normal",
                        activeId === thread.id
                          ? "bg-accent-soft text-foreground ring-1 ring-inset ring-accent/20"
                          : "text-muted hover:bg-dock-hover hover:text-foreground"
                      )}
                    >
                      <Avatar person={thread.user} preview={false} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                            {thread.user.name}
                          </span>
                          <span className="flex-none text-[10px] tabular-nums text-faint-foreground">
                            {formatStamp(thread.updatedAt)}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[11.5px]">
                            {thread.lastMessage
                              ? `${thread.lastMessage.from === user?.id ? "You: " : ""}${thread.lastMessage.text}`
                              : "Say hello"}
                          </span>
                          {thread.unread ? (
                            <span className="grid size-5 flex-none place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground tabular-nums">
                              {thread.unread > 9 ? "9+" : thread.unread}
                            </span>
                          ) : (
                            <Presence online={thread.user.online} size="sm" />
                          )}
                        </span>
                      </span>
                    </Button>
                  ))
                ) : (
                  <p className="px-2.5 py-6 text-[12px] text-muted">
                    Your next conversation starts here.
                    <Button onClick={() => setRail("people")} className="mx-auto mt-4 rounded-xl px-5">Find people</Button>
                  </p>
                )}
              </div>
            ) : null}
          </Tabs.Panel>
          </Tabs>
        </section>

        {/* Thread */}
        <section
          className={cn(
            "community-thread min-h-0 flex-1 flex-col md:flex",
            activeId ? "flex" : "hidden"
          )}
        >
          {activeConversation ? (
            <>
              <header className="flex flex-none items-center gap-3 border-b border-dock-line bg-background/90 px-4 py-4 sm:px-6">
                <Button
                  variant="ghost" size="icon"
                  onClick={() => selectConversation(null)}
                  aria-label="Back to the list"
                  className="grid size-9 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-dock-hover hover:text-foreground md:hidden"
                >
                  <Icon name="chevron-right" className="size-4 rotate-180" strokeWidth={2} />
                </Button>
                <Avatar person={activeConversation.user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {activeConversation.user.name}
                  </p>
                  <p
                    className={cn(
                      "truncate text-[11px]",
                      typingLabel ? "text-brand" : "text-muted"
                    )}
                  >
                    {typingLabel ??
                      (activeConversation.user.online
                        ? "Online now"
                        : activeConversation.user.lastSeenAt
                          ? `Last seen ${formatStamp(activeConversation.user.lastSeenAt)}`
                          : "Offline")}
                  </p>
                </div>
                <Button ref={threadMenuButton} variant="ghost" size="icon" aria-label="Chat options" aria-haspopup="menu" aria-expanded={threadOptions?.id === activeConversation.id} onClick={() => { setOptionsFor(null); setThreadOptions(current => current?.id === activeConversation.id || !threadMenuButton.current ? null : { id: activeConversation.id, anchor: threadMenuButton.current }); }} className="shrink-0 rounded-full"><MoreVertical className="size-5" /></Button>
              </header>

              {jumpStatus?.conversationId === activeId && (jumpStatus.loading || jumpStatus.error) ? <div className="flex flex-none items-center gap-2 border-b border-dock-line bg-surface-secondary px-4 py-2 text-xs text-muted">
                {jumpStatus.loading ? <Loader2 className="size-3.5 animate-spin" /> : null}<p role={jumpStatus.error ? "alert" : "status"} className="flex-1">{jumpStatus.error || "Finding the original message…"}</p><Button variant="ghost" size="icon" aria-label={jumpStatus.loading ? "Cancel finding original message" : "Dismiss reply message notice"} onClick={() => { jumpController.current?.abort(); pendingJump.current = null; scrollingToReply.current = false; setJumpStatus(null); }} className="size-7 rounded-full hover:bg-background"><X className="size-3.5" /></Button>
              </div> : null}
              <div
                ref={scrollRef}
                onScroll={onScroll}
                style={{ overflowAnchor: "none" }}
                className="community-messages min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8"
              >
                {messages.length ? <div className="mb-4 flex justify-center"><Button variant="secondary" size="sm" disabled={olderLoading || jumpStatus?.conversationId === activeId && jumpStatus.loading} onClick={() => {
                  const node = scrollRef.current;
                  if (node) olderAnchorRef.current = { height: node.scrollHeight, top: node.scrollTop };
                  loadOlder();
                }} className="rounded-full px-4 text-xs font-medium text-muted hover:text-foreground">{olderLoading ? "Loading…" : "Earlier messages"}</Button></div> : null}
                {grouped.map((group) => (
                  <div key={group.day} className="flex flex-col gap-2.5">
                    <p className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                      {group.day}
                    </p>
                    {group.rows.map(message => <MessageBubble key={message.id} message={message} currentUserId={user?.id ?? ""} name={activeConversation.user.name}
                      optionsOpen={optionsFor?.id === message.id} onReplyJump={id => void jumpToReply(id)} onOptions={anchor => { setThreadOptions(null); setOptionsFor(current => current?.id === message.id ? null : { id: message.id, anchor }); }} onRetry={() => retryMessage(message.clientId)} onMediaLoad={() => { const node = scrollRef.current; if (node && pinnedRef.current) node.scrollTop = node.scrollHeight; }} />)}
                  </div>
                ))}
                {!messages.length && !loading ? (
                  <p className="pt-8 text-center text-[12px] text-muted">
                    Nothing said yet. Break it — what are you listening to?
                  </p>
                ) : null}
              </div>

              {activeConversation.messagingDisabled ? <div className="flex-none border-t border-dock-line p-4 text-center text-sm text-muted">{activeConversation.blockedByMe ? <>You blocked this user. <Button variant="ghost" size="sm" onClick={() => { if (threadMenuButton.current) setThreadOptions({ id: activeConversation.id, anchor: threadMenuButton.current }); }} className="font-semibold text-accent underline">Manage block</Button></> : "Messaging is unavailable in this conversation."}</div> : <MessageComposer key={draftKey} conversationId={activeConversation.id} name={activeConversation.user.name}
                draft={draft} setDraft={setDraft} reply={replyTarget} onCancelReply={() => setReply(null)} onSend={async (text, attachment) => { const target = replyTarget; setReply(null); return sendText(text, attachment, target ?? undefined); }} onTyping={reportTyping} onStopTyping={reportTypingStop} />}
              {selectedMessage && optionsFor ? <MessageActions key={selectedMessage.id} anchor={optionsFor.anchor} message={selectedMessage} currentUserId={user?.id ?? ""} disabled={!!activeConversation.messagingDisabled}
                onReply={() => { setReply(selectedMessage); setOptionsFor(null); }} onChange={action => changeMessage(selectedMessage, action)} onClose={() => setOptionsFor(null)} /> : null}
              {threadOptions?.id === activeConversation.id ? <ConversationActions key={activeConversation.id} anchor={threadOptions.anchor} conversation={activeConversation} onBlock={blocked => blockChat(activeConversation.id, blocked)} onClear={async () => { await clearChat(activeConversation.id); setReply(null); }} onClose={() => setThreadOptions(null)} /> : null}
            </>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-3 px-6 text-center md:flex">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-secondary text-muted">
                <Icon name="message" className="size-5" strokeWidth={1.9} />
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">Good music. Better company.</h2>
              <p className="max-w-[22rem] text-sm leading-relaxed text-muted">
                {conversations.length
                  ? "Pick a thread to keep the conversation going."
                  : "Find a listener on the People tab and ask to chat. Threads open only once both of you say yes."}
              </p>
              <p className="text-[11px] text-faint-foreground">
                {onlineIds.size} other {onlineIds.size === 1 ? "listener is" : "listeners are"}
                online in your threads
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
    </dialog>
  );
}
