"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCommunity } from "@/components/providers/CommunityProvider";
import { MAX_CHAT_MESSAGE, type ChatPerson, type MessageItem } from "@/lib/community";

type Rail = "threads" | "people" | "requests";

const ROW =
  "flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-start text-[13px] transition-colors";

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

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function Avatar({ person }: { person: ChatPerson }) {
  return (
    <span className="relative flex-none">
      <span className="grid size-9 place-items-center rounded-full bg-surface-secondary text-[13px] font-semibold text-foreground">
        {initials(person.name)}
      </span>
      <span className="absolute -bottom-0.5 -end-0.5 rounded-full bg-background p-[2px]">
        <Presence online={person.online} size="sm" />
      </span>
    </span>
  );
}

/**
 * The community room: who asked to talk, the threads you have, and everyone
 * else on the dock. Text only by design — the app is for listening, and a plain
 * thread is the one thing nobody has to moderate.
 */
export function ChatPanel() {
  const { user } = useAuth();
  const {
    chatOpen,
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
    sendText,
    retryMessage,
    askToChat,
    respondTo,
    reportTyping,
    reportTypingStop,
  } = useCommunity();

  const [rail, setRail] = useState<Rail>("threads");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [askBusy, setAskBusy] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Escape closes; the page behind must not scroll while the room is open.
  useEffect(() => {
    if (!chatOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [chatOpen, closeChat]);

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
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 160;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [messages, chatOpen, activeId, typingUsers.length]);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node || node.scrollTop > 48) return;
    loadOlder();
  }, [loadOlder]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const delivered = await sendText(text);
    setSending(false);
    if (delivered) {
      setDraft("");
      reportTypingStop();
    }
    composerRef.current?.focus();
  }, [draft, sending, sendText, reportTypingStop]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ZYRAVA community chat"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Head */}
      <header className="flex h-16 flex-none items-center gap-3 border-b border-dock-line px-3 sm:px-5">
        <span className="grid size-8 flex-none place-items-center rounded-[0.6rem] bg-accent text-accent-foreground">
          <Icon name="message" className="size-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold uppercase leading-none tracking-[0.22em] text-foreground">
            Community
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-muted">
            <Presence online={connected} size="sm" />
            {connected ? "Live" : "Reconnecting"}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={closeChat} title="Close community">
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
            "min-h-0 w-full flex-col border-e border-dock-line md:flex md:w-[21rem]",
            activeId ? "hidden" : "flex"
          )}
        >
          <div className="flex flex-none gap-1 border-b border-dock-line px-2.5 py-2.5">
            {(["threads", "requests", "people"] as Rail[]).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setRail(entry)}
                aria-pressed={rail === entry}
                className={cn(
                  "min-h-8 flex-1 rounded-full px-2.5 text-[11.5px] font-semibold capitalize transition-colors",
                  rail === entry
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-secondary/50 text-muted hover:bg-surface-secondary hover:text-foreground"
                )}
              >
                {entry}
                {railCounts[entry] ? (
                  <span className="ms-1.5 tabular-nums">{railCounts[entry]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="dock-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
            {rail === "people" ? (
              <div className="flex flex-col gap-2">
                <label className="relative block">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                    strokeWidth={1.9}
                  />
                  <input
                    type="search"
                    value={peopleQuery}
                    onChange={(event) => searchPeople(event.target.value)}
                    placeholder="Find another listener"
                    aria-label="Find another listener"
                    className="h-10 w-full rounded-xl border border-dock-line bg-surface-secondary/40 ps-9 pe-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-faint-foreground focus:border-brand"
                  />
                </label>
                <SectionTitle>On the dock</SectionTitle>
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
                <SectionTitle>Threads</SectionTitle>
                {conversations.length ? (
                  conversations.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => selectConversation(thread.id)}
                      aria-current={activeId === thread.id || undefined}
                      className={cn(
                        ROW,
                        activeId === thread.id
                          ? "bg-dock-active text-foreground"
                          : "text-muted hover:bg-dock-hover hover:text-foreground"
                      )}
                    >
                      <Avatar person={thread.user} />
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
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-6 text-[12px] text-muted">
                    No threads yet. Find someone on the <strong>People</strong> tab and ask to chat —
                    a thread opens the moment they accept.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {/* Thread */}
        <section
          className={cn(
            "min-h-0 flex-1 flex-col bg-surface-secondary/20 md:flex",
            activeId ? "flex" : "hidden"
          )}
        >
          {activeConversation ? (
            <>
              <header className="flex flex-none items-center gap-3 border-b border-dock-line px-3 py-3 sm:px-4">
                <button
                  type="button"
                  onClick={() => selectConversation(null)}
                  aria-label="Back to the list"
                  className="grid size-9 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-dock-hover hover:text-foreground md:hidden"
                >
                  <Icon name="chevron-right" className="size-4 rotate-180" strokeWidth={2} />
                </button>
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
              </header>

              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
              >
                {olderLoading ? (
                  <p className="pb-3 text-center text-[11px] text-muted">Loading older messages…</p>
                ) : null}
                {grouped.map((group) => (
                  <div key={group.day} className="flex flex-col gap-2.5">
                    <p className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                      {group.day}
                    </p>
                    {group.rows.map((message) => (
                      <div
                        key={message.id}
                        className={cn("flex", message.mine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[min(34rem,86%)] rounded-2xl px-3.5 py-2.5",
                            message.mine
                              ? "bg-accent text-accent-foreground"
                              : "border border-dock-line bg-background text-foreground"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
                            {message.text}
                          </p>
                          <p
                            className={cn(
                              "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
                              message.mine ? "text-accent-foreground/75" : "text-faint-foreground"
                            )}
                          >
                            {formatTime(message.createdAt)}
                            {message.pending ? (
                              <span>sending…</span>
                            ) : message.failed ? (
                              <button
                                type="button"
                                onClick={() => retryMessage(message.clientId)}
                                className="font-semibold text-danger underline underline-offset-2"
                              >
                                failed — retry
                              </button>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {!messages.length && !loading ? (
                  <p className="pt-8 text-center text-[12px] text-muted">
                    Nothing said yet. Break it — what are you listening to?
                  </p>
                ) : null}
              </div>

              <footer className="flex-none border-t border-dock-line px-3 py-3 sm:px-4">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={composerRef}
                    value={draft}
                    rows={1}
                    maxLength={MAX_CHAT_MESSAGE}
                    aria-label={`Message to ${activeConversation.user.name}`}
                    placeholder="Write a message…"
                    onChange={(event) => {
                      setDraft(event.target.value.slice(0, MAX_CHAT_MESSAGE));
                      reportTyping();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                    className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-dock-line bg-background px-3 py-2.5 text-[13.5px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-faint-foreground focus:border-brand"
                  />
                  <Button
                    size="icon"
                    onClick={() => void submit()}
                    disabled={!draft.trim()}
                    loading={sending}
                    title="Send"
                  >
                    <Icon name="send" className="size-4" strokeWidth={2.1} />
                  </Button>
                </div>
                <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-faint-foreground">
                  <span>Enter sends · Shift+Enter starts a line · text only</span>
                  {draft.length > MAX_CHAT_MESSAGE - 200 ? (
                    <span className="tabular-nums">
                      {draft.length}/{MAX_CHAT_MESSAGE}
                    </span>
                  ) : null}
                </div>
              </footer>
            </>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-3 px-6 text-center md:flex">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-secondary text-muted">
                <Icon name="message" className="size-5" strokeWidth={1.9} />
              </span>
              <p className="max-w-[22rem] text-[13px] leading-relaxed text-muted">
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
  );
}
