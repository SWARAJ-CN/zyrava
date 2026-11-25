"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadReplyHistory } from "@/lib/community-reply-navigation";
import type { MediaAttachment } from "@/lib/media";
import { useAuth } from "@/components/providers/AuthProvider";
import { createOnlineNoticeGate, ONLINE_NOTICE, OPEN_COMMUNITY_MESSAGE, showOnlineSystemNotice } from "@/lib/community-online-notice";
import { createMessageChime } from "@/lib/message-chime";
import { mergeMessage, applyReadReceipt, applyMessageChange, removeMessage } from "@/lib/community-messages";
import { useToast } from "@/components/providers/ToastProvider";
import {
  mutateMessage, clearConversation, blockConversation, type MessageAction,
  MAX_CHAT_MESSAGE,
  fetchConversations,
  fetchMessages,
  fetchPeople,
  fetchRequests,
  fetchSummary,
  markConversationRead,
  newClientId,
  postMessage,
  respondToRequest,
  sendChatRequest,
  type ChatPerson,
  type ConversationItem,
  type MessageItem,
  type RequestItem,
  type ReadReceipt,
} from "@/lib/community";
import {
  connectCommunity,
  disconnectCommunity,
  emitTyping,
  onCommunityEvent,
  onCommunityStatus,
} from "@/lib/socket";

/** How long a partner's "typing…" survives after their last keystroke. */
const TYPING_TTL = 4_000;

/** Only this many keystroke reports leave the tab per second. */
const TYPING_MIN_MS = 1_500;

type MessageMap = Record<string, MessageItem[]>;

type Inbox = { incoming: RequestItem[]; outgoing: RequestItem[] };

/*
 * Empty shapes live at module scope so a signed-out tab hands consumers the
 * same reference every render, and an account switch cannot paint the
 * previous member's threads while the new reads are in flight.
 */
const NO_INBOX: Inbox = { incoming: [], outgoing: [] };
const NO_TYPING: string[] = [];
const NO_BUBBLES: MessageItem[] = [];
const NO_THREADS: ConversationItem[] = [];
const NO_PEOPLE: ChatPerson[] = [];
const NO_IDS: Set<string> = new Set();
const NO_MAP: MessageMap = {};

interface CommunityContextValue {
  chatOpen: boolean;
  messageSoundEnabled: boolean;
  toggleMessageSound: () => void;
  /** Unread messages plus requests waiting on an answer. */
  badge: number;
  connected: boolean;
  loading: boolean;
  error: string | null;
  conversations: ConversationItem[];
  requests: { incoming: RequestItem[]; outgoing: RequestItem[] };
  people: ChatPerson[];
  peopleQuery: string;
  activeId: string | null;
  activeConversation: ConversationItem | null;
  messages: MessageItem[];
  olderLoading: boolean;
  typingUsers: string[];
  onlineIds: Set<string>;
  openChat: () => void;
  closeChat: () => void;
  searchPeople: (query: string) => void;
  selectConversation: (conversationId: string | null) => void;
  loadOlder: () => void;
  revealMessage: (messageId: string, signal: AbortSignal) => Promise<boolean>;
  sendText: (text: string, attachment?: MediaAttachment, reply?: MessageItem) => Promise<boolean>;
  changeMessage: (message: MessageItem, action: MessageAction) => Promise<void>;
  clearChat: (conversationId: string) => Promise<void>;
  blockChat: (conversationId: string, blocked: boolean) => Promise<void>;
  retryMessage: (clientId: string) => void;
  askToChat: (userId: string) => Promise<void>;
  respondTo: (requestId: string, accept: boolean) => Promise<void>;
  reportTyping: () => void;
  reportTypingStop: () => void;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

function applyPresence(conversation: ConversationItem, online: boolean, lastSeenAt: string | null): ConversationItem {
  return { ...conversation, user: { ...conversation.user, online, lastSeenAt } };
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { user, status, personalExperience } = useAuth();
  const toast = useToast();
  const authenticated = status === "authenticated" && !!user && !personalExperience;

  const [chatOpen, setChatOpen] = useState(false);
  const [messageSoundEnabled, setMessageSoundEnabled] = useState(true);
  const messageSoundEnabledRef = useRef(true);
  const messageChimeRef = useRef<ReturnType<typeof createMessageChime> | null>(null);
  const receivedIdsRef = useRef(new Set<string>());
  const onlineNoticeRef = useRef<ReturnType<typeof createOnlineNoticeGate> | null>(null);
  const openChatActionRef = useRef<() => void>(() => {});
  const pendingCommunityOpenRef = useRef(false);

  useEffect(() => {
    if (!authenticated) return;
    const chime = createMessageChime();
    messageChimeRef.current = chime;
    try { messageSoundEnabledRef.current = localStorage.getItem("zyrava:message-sound") !== "off"; } catch { /* Device storage is optional. */ }
    const timer = window.setTimeout(() => setMessageSoundEnabled(messageSoundEnabledRef.current), 0);
    const unlock = () => { if (messageSoundEnabledRef.current) chime.unlock(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      chime.dispose();
      if (messageChimeRef.current === chime) messageChimeRef.current = null;
    };
  }, [authenticated]);

  const toggleMessageSound = useCallback(() => {
    const enabled = !messageSoundEnabledRef.current;
    messageSoundEnabledRef.current = enabled;
    setMessageSoundEnabled(enabled);
    if (enabled) messageChimeRef.current?.unlock();
    else messageChimeRef.current?.stop();
    try { localStorage.setItem("zyrava:message-sound", enabled ? "on" : "off"); } catch { /* Device storage is optional. */ }
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [requests, setRequests] = useState<{ incoming: RequestItem[]; outgoing: RequestItem[] }>({
    incoming: [],
    outgoing: [],
  });
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const visibilityVersion = useRef<Record<string, number>>({});
  const [messagesByConversation, setMessagesByConversation] = useState<MessageMap>({});
  const [olderLoading, setOlderLoading] = useState(false);
  const [typingPairs, setTypingPairs] = useState<Record<string, string[]>>({});
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [remoteUnread, setRemoteUnread] = useState(0);
  const [remoteRequests, setRemoteRequests] = useState(0);
  const [connected, setConnected] = useState(false);

  /*
   * The account these reads belong to, recorded only once they have landed.
   * Everything the panel renders is gated on it, so logging out or switching
   * account hides the old member's data immediately without a reset pass.
   */
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const currentId = authenticated ? user?.id ?? null : null;
  const ready = currentId !== null && ownerId === currentId;

  /*
   * Socket handlers are bound once, so they read the moving parts from refs
   * instead of closing over a snapshot — otherwise a re-render would either
   * stale the handler or force a resubscribe mid-thread.
   */
  const userIdRef = useRef<string | null>(currentId);
  const conversationsRef = useRef<ConversationItem[]>([]);
  const chatOpenRef = useRef(chatOpen);
  const activeIdRef = useRef<string | null>(activeId);
  const typingTimers = useRef<Map<string, number>>(new Map());
  const lastTypingSent = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const readInFlightRef = useRef(new Set<string>());
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    userIdRef.current = currentId;
    seenIdsRef.current.clear();
    receivedIdsRef.current.clear();
    onlineNoticeRef.current = currentId ? createOnlineNoticeGate(currentId) : null;
    readInFlightRef.current.clear();
  }, [currentId]);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const typingFor = useMemo(
    () => (ready && activeId ? typingPairs[activeId] ?? NO_TYPING : NO_TYPING),
    [activeId, ready, typingPairs]
  );

  /* Nothing an earlier account read is allowed to render for this one. */
  const viewConversations = ready ? conversations : NO_THREADS;
  const viewRequests = ready ? requests : NO_INBOX;
  const viewPeople = ready ? people : NO_PEOPLE;
  const viewOnlineIds = ready ? onlineIds : NO_IDS;
  const viewMessageMap = ready ? messagesByConversation : NO_MAP;
  const viewActiveId = ready ? activeId : null;

  const setMessagesFor = useCallback((conversationId: string, updater: (list: MessageItem[]) => MessageItem[]) => {
    setMessagesByConversation((current) => ({
      ...current,
      [conversationId]: updater(current[conversationId] ?? []),
    }));
  }, []);

  const receiveReadReceipt = useCallback((receipt: ReadReceipt, readerId: string) => {
    if (!Array.isArray(receipt.messageIds)) return;
    const ownRead = readerId === userIdRef.current;
    receipt.messageIds.forEach((id) => seenIdsRef.current.add(id));
    setMessagesFor(receipt.conversationId, (list) => applyReadReceipt(list, receipt.messageIds, ownRead));
    // A peer reading our messages must never clear our unread incoming messages.
    if (ownRead) {
      setConversations((list) => list.map((thread) => thread.id === receipt.conversationId ? { ...thread, unread: receipt.unread } : thread));
      const owner = userIdRef.current;
      void fetchSummary().then((summary) => {
        if (userIdRef.current === owner) setRemoteUnread(summary.unread);
      }).catch(() => undefined);
    }
  }, [setMessagesFor]);

  // Read only messages loaded into an open, foreground conversation. Resume
  // on focus; being connected or playing music in the background is not Seen.
  useEffect(() => {
    if (!ready || !chatOpen || !viewActiveId) return;
    const owner = currentId;
    const acknowledge = () => {
      if (document.hidden || !document.hasFocus()) return;
      const ids = (viewMessageMap[viewActiveId] ?? [])
        .filter((message) => !message.mine && !message.seen && !message.pending && !message.failed && !readInFlightRef.current.has(message.id))
        .slice(0, 100).map((message) => message.id);
      if (!ids.length) return;
      ids.forEach((id) => readInFlightRef.current.add(id));
      void markConversationRead(viewActiveId, ids).then((receipt) => {
        if (receipt && userIdRef.current === owner) receiveReadReceipt(receipt, owner!);
      }).catch(() => undefined).finally(() => {
        ids.forEach((id) => readInFlightRef.current.delete(id));
      });
    };
    acknowledge();
    window.addEventListener("focus", acknowledge);
    document.addEventListener("visibilitychange", acknowledge);
    return () => {
      window.removeEventListener("focus", acknowledge);
      document.removeEventListener("visibilitychange", acknowledge);
    };
  }, [ready, chatOpen, currentId, viewActiveId, viewMessageMap, connected, receiveReadReceipt]);

  // Reload the visible page after reconnecting so cleared/hidden messages do
  // not reappear from a stale tab cache. Preserve local sends awaiting retry.
  useEffect(() => {
    if (!ready || !chatOpen || !viewActiveId) return;
    const owner = currentId;
    let disposed = false;
    const refresh = () => {
      if (document.hidden) return;
      const version = visibilityVersion.current[viewActiveId] ?? 0;
      const requestedAt = Date.now();
      void fetchMessages(viewActiveId).then((rows) => {
        if (disposed || userIdRef.current !== owner || version !== (visibilityVersion.current[viewActiveId] ?? 0)) return;
        setMessagesFor(viewActiveId, (list) => rows.reduce((merged, row) => mergeMessage(merged, { ...row, seen: row.seen || seenIdsRef.current.has(row.id) }), list.filter(item => item.pending || item.failed || new Date(item.createdAt).getTime() > requestedAt || rows.some(row => row.id === item.id && (item.revision ?? 0) > (row.revision ?? 0))))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      }).catch((cause: Error) => {
        if (!disposed) setError(cause?.message ?? "That thread will not open.");
      });
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, chatOpen, viewActiveId, currentId, connected, setMessagesFor]);

  const refreshThreads = useCallback(async (owner: string) => {
    const [threads, inbox] = await Promise.all([fetchConversations(), fetchRequests()]);
    // A read that lands after an account switch belongs to nobody here.
    if (userIdRef.current !== owner) return threads;
    setConversations(threads);
    setRequests(inbox);
    setRemoteUnread(0);
    setRemoteRequests(inbox.incoming.length);
    setOnlineIds((current) => {
      const next = new Set(current);
      for (const thread of threads) if (thread.user.online) next.add(thread.user.id);
      return next;
    });
    setOwnerId(owner);
    return threads;
  }, []);

  /* ---------- socket wiring ---------- */

  useEffect(() => {
    if (!authenticated) return;

    const off: Array<() => void> = [];
    // This subscription owns these timers, so its cleanup cancels exactly them.
    const timers = typingTimers.current;

    off.push(
      onCommunityEvent("presence:init", (payload) => {
        const { online } = payload as { online: string[] };
        // Reconnect is a baseline, never a burst of new arrivals.
        onlineNoticeRef.current?.snapshot(online);
        // Your own tab is not information about anybody else.
        setOnlineIds(new Set(online.filter((id) => id !== userIdRef.current)));
      })
    );

    off.push(
      onCommunityEvent("presence:update", (payload) => {
        const { userId, online, lastSeenAt } = payload as {
          userId: string;
          online: boolean;
          lastSeenAt: string | null;
        };
        if (userId === userIdRef.current) return;
        if (onlineNoticeRef.current?.update(userId, online, chatOpenRef.current && !document.hidden)) {
          toast.toast({
            ...ONLINE_NOTICE,
            variant: "info",
            action: { label: "Open Community", onPress: () => openChatActionRef.current() },
          });
          if (document.hidden) void showOnlineSystemNotice();
        }
        setOnlineIds((current) => {
          const next = new Set(current);
          if (online) next.add(userId);
          else next.delete(userId);
          return next;
        });
        setConversations((current) =>
          current.map((thread) =>
            thread.user.id === userId ? applyPresence(thread, online, lastSeenAt) : thread
          )
        );
        setPeople((current) =>
          current.map((person) => (person.id === userId ? { ...person, online, lastSeenAt } : person))
        );
      })
    );

    off.push(
      onCommunityEvent("message:new", (payload) => {
        const { message } = payload as { message: MessageItem };
        const duplicate = receivedIdsRef.current.has(message.id);
        receivedIdsRef.current.add(message.id);
        if (receivedIdsRef.current.size > 256) receivedIdsRef.current.delete(receivedIdsRef.current.values().next().value!);
        setMessagesByConversation((current) => {
          const list = current[message.conversationId] ?? [];
          return { ...current, [message.conversationId]: mergeMessage(list, { ...message, seen: message.seen || seenIdsRef.current.has(message.id) }) };
        });

        // A thread that is not on screen keeps its counter honest.
        const open = chatOpenRef.current && !document.hidden && document.hasFocus();
        const viewing = activeIdRef.current === message.conversationId;
        if (!message.mine && !duplicate) {
          const thread = conversationsRef.current.find((item) => item.id === message.conversationId);
          setConversations((current) =>
            current.map((thread) =>
              thread.id === message.conversationId && (!open || !viewing)
                ? { ...thread, unread: thread.unread + 1, updatedAt: message.createdAt }
                : thread.id === message.conversationId
                  ? { ...thread, updatedAt: message.createdAt }
                  : thread
            )
          );
          if (!open || !viewing) {
            if (!open) setRemoteUnread((count) => count + 1);
            if (messageSoundEnabledRef.current) messageChimeRef.current?.play();
            toast.toast({
              title: thread?.user.name ?? "A listener",
              description: message.text.slice(0, 120) || (message.attachment ? `Sent ${message.attachment.kind === "image" ? "a photo" : message.attachment.kind === "video" ? "a video" : "audio"}` : "New message"),
              variant: "info",
            });
          }
        }
      })
    );

    off.push(onCommunityEvent("message:changed", payload => {
      const { message } = payload as { message: MessageItem };
      setMessagesFor(message.conversationId, list => applyMessageChange(list, message));
    }));
    off.push(onCommunityEvent("message:removed", payload => {
      const { conversationId, messageId } = payload as { conversationId: string; messageId: string };
      visibilityVersion.current[conversationId] = (visibilityVersion.current[conversationId] ?? 0) + 1;
      setMessagesFor(conversationId, list => removeMessage(list, messageId));
    }));
    off.push(onCommunityEvent("conversation:cleared", payload => {
      const { conversationId, clearedAt } = payload as { conversationId: string; clearedAt: string };
      visibilityVersion.current[conversationId] = (visibilityVersion.current[conversationId] ?? 0) + 1;
      setMessagesFor(conversationId, list => list.filter(message => message.pending || message.failed || new Date(message.createdAt) > new Date(clearedAt)));
    }));

    off.push(
      onCommunityEvent("conversation:new", (payload) => {
        const { conversation } = payload as { conversation: ConversationItem };
        setConversations((current) =>
          current.some((thread) => thread.id === conversation.id) ? current : [conversation, ...current]
        );
      })
    );

    off.push(
      onCommunityEvent("conversation:update", (payload) => {
        const { conversation } = payload as { conversation: ConversationItem };
        setConversations((current) =>
          current.some((thread) => thread.id === conversation.id)
            ? current.map((thread) => (thread.id === conversation.id ? conversation : thread))
            : [conversation, ...current]
        );
      })
    );

    off.push(
      onCommunityEvent("conversation:read", (payload) => {
        const receipt = payload as ReadReceipt & { readerId: string };
        receiveReadReceipt(receipt, receipt.readerId);
      })
    );

    off.push(
      onCommunityEvent("request:received", (payload) => {
        const { request } = payload as { request: RequestItem };
        setRequests((current) =>
          current.incoming.some((item) => item.id === request.id)
            ? current
            : { ...current, incoming: [request, ...current.incoming] }
        );
        setRemoteRequests((count) => count + 1);
        if (!chatOpenRef.current) toast.success(`${request.user.name} wants to chat`, "Open Community to answer.");
      })
    );

    off.push(
      onCommunityEvent("request:resolved", (payload) => {
        const { requestId, status: next } = payload as { requestId: string; status: string };
        setRequests((current) => ({
          ...current,
          outgoing: current.outgoing.filter((item) => item.id !== requestId),
        }));
        if (next === "accepted") toast.success("Request accepted", "You can message each other now.");
      })
    );

    off.push(
      onCommunityEvent("typing", (payload) => {
        const { conversationId, userId: peerId, isTyping } = payload as {
          conversationId: string;
          userId: string;
          isTyping: boolean;
        };
        const key = `${conversationId}:${peerId}`;
        const timer = timers.get(key);
        if (timer) window.clearTimeout(timer);

        if (!isTyping) {
          timers.delete(key);
          setTypingPairs((current) => ({ ...current, [conversationId]: (current[conversationId] ?? []).filter((id) => id !== peerId) }));
          return;
        }

        setTypingPairs((current) => ({
          ...current,
          [conversationId]: [...new Set([...(current[conversationId] ?? []), peerId])],
        }));
        timers.set(
          key,
          window.setTimeout(() => {
            timers.delete(key);
            setTypingPairs((current) => ({
              ...current,
              [conversationId]: (current[conversationId] ?? []).filter((id) => id !== peerId),
            }));
          }, TYPING_TTL)
        );
      })
    );

    return () => {
      off.forEach((stop) => stop());
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [authenticated, setMessagesFor, toast, receiveReadReceipt]);

  /* ---------- connect / resync ---------- */

  useEffect(() => {
    if (!authenticated || !currentId) {
      disconnectCommunity();
      // Same rhythm as the library: hand the frame back first, then wipe, so
      // logging out never cascades a second render from inside this one.
      const reset = requestAnimationFrame(() => {
        setConnected(false);
        setConversations([]);
        setRequests(NO_INBOX);
        setPeople([]);
        setPeopleQuery("");
        setMessagesByConversation(NO_MAP);
        setActiveId(null);
        setTypingPairs({});
        setOlderLoading(false);
        setRemoteUnread(0);
        setRemoteRequests(0);
        setChatOpen(false);
        setLoading(false);
        setError(null);
        setOwnerId(null);
      });
      return () => cancelAnimationFrame(reset);
    }

    connectCommunity();
    void fetchSummary()
      .then((summary) => {
        if (userIdRef.current !== currentId) return;
        setRemoteUnread(summary.unread);
        setRemoteRequests(summary.requests);
      })
      .catch(() => undefined);

    const stopStatus = onCommunityStatus((live) => {
      setConnected(live);
      // A dropped tab can have missed pushes, so the threads are re-read whole.
      if (live) void refreshThreads(currentId).catch(() => undefined);
    });

    return () => stopStatus();
  }, [authenticated, currentId, refreshThreads]);

  /* ---------- actions ---------- */

  const openChat = useCallback(() => {
    if (!currentId) return;
    if (!chatOpenRef.current) {
      window.history.pushState({ ...window.history.state, zyravaCommunity: { threadId: null, owner: currentId } }, "");
    }
    chatOpenRef.current = true;
    setChatOpen(true);
    setLoading(true);
    setError(null);
    Promise.all([
      refreshThreads(currentId),
      fetchPeople("")
        .then((rows) => {
          if (userIdRef.current === currentId) setPeople(rows);
        })
        .catch(() => undefined),
    ])
      .catch((cause: Error) => setError(cause?.message ?? "The community is unreachable."))
      .finally(() => setLoading(false));
  }, [currentId, refreshThreads]);

  useEffect(() => {
    openChatActionRef.current = openChat;
  }, [openChat]);

  const closeChat = useCallback(() => {
    const entry = window.history.state?.zyravaCommunity;
    if (entry) window.history.go(entry.threadId ? -2 : -1);
    chatOpenRef.current = false;
    setChatOpen(false);
    setActiveId(null);
  }, []);

  // The room and its conversation are real Back steps, including Android's
  // system gesture. Preserve Next's history state and the underlying URL.
  useEffect(() => {
    // A reload starts on the music page; do not inherit an orphan overlay entry.
    if (window.history.state?.zyravaCommunity) {
      const state = { ...window.history.state };
      delete state.zyravaCommunity;
      window.history.replaceState(state, "");
    }
    const onBack = () => {
      const entry = window.history.state?.zyravaCommunity;
      const open = Boolean(entry && entry.owner === userIdRef.current && userIdRef.current);
      chatOpenRef.current = open;
      setChatOpen(open);
      setActiveId(open ? entry.threadId : null);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  // A tray notification focuses the existing player, keeping its audio alive.
  // A fresh window consumes the same intent from a non-identifying URL flag.
  useEffect(() => {
    const openRequested = () => {
      if (!currentId) { pendingCommunityOpenRef.current = true; return; }
      pendingCommunityOpenRef.current = false;
      openChat();
    };
    const onNotification = (event: MessageEvent) => {
      if (event.data?.type === OPEN_COMMUNITY_MESSAGE) openRequested();
    };
    navigator.serviceWorker?.addEventListener("message", onNotification);
    const url = new URL(window.location.href);
    if (currentId && (pendingCommunityOpenRef.current || url.searchParams.get("community") === "1")) {
      url.searchParams.delete("community");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      openRequested();
    }
    return () => navigator.serviceWorker?.removeEventListener("message", onNotification);
  }, [currentId, openChat]);

  const searchPeople = useCallback((query: string) => {
    const owner = userIdRef.current;
    setPeopleQuery(query);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      fetchPeople(query)
        .then((rows) => {
          if (userIdRef.current === owner) setPeople(rows);
        })
        .catch(() => {
          if (userIdRef.current === owner) setPeople([]);
        });
    }, 280);
  }, []);

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      const entry = window.history.state?.zyravaCommunity;
      if (entry) {
        if (!conversationId && entry.threadId) window.history.back();
        else if (conversationId && entry.threadId !== conversationId) {
          const state = { ...window.history.state, zyravaCommunity: { threadId: conversationId, owner: userIdRef.current } };
          if (entry.threadId) window.history.replaceState(state, "");
          else window.history.pushState(state, "");
        }
      }
      setActiveId(conversationId);
      if (!conversationId) return;

    },
    []
  );

  const loadOlder = useCallback(() => {
    if (!activeId || olderLoading) return;
    const list = messagesByConversation[activeId] ?? [];
    const firstReal = list.find((item) => !item.pending);
    if (!firstReal) return;

    setOlderLoading(true);
    const owner = userIdRef.current;
    const version = visibilityVersion.current[activeId] ?? 0;
    fetchMessages(activeId, firstReal.createdAt)
      .then((older) => {
        if (!older.length || owner !== userIdRef.current || version !== (visibilityVersion.current[activeId] ?? 0)) return;
        setMessagesFor(activeId, (current) => {
          const known = new Set(current.map((item) => item.id));
          return [...older.filter((item) => !known.has(item.id)).map((item) => ({ ...item, seen: item.seen || seenIdsRef.current.has(item.id) })), ...current];
        });
      })
      .catch(() => undefined)
      .finally(() => setOlderLoading(false));
  }, [activeId, olderLoading, messagesByConversation, setMessagesFor]);

  const revealMessage = useCallback(async (messageId: string, signal: AbortSignal) => {
    if (!activeId || !currentId || signal.aborted) return false;
    const conversationId = activeId;
    const owner = currentId;
    const version = visibilityVersion.current[conversationId] ?? 0;
    const isCurrent = () => !signal.aborted && userIdRef.current === owner && activeIdRef.current === conversationId && version === (visibilityVersion.current[conversationId] ?? 0);
    const rows = await loadReplyHistory(messageId, messagesByConversation[conversationId] ?? [], before => fetchMessages(conversationId, before), isCurrent);
    if (!rows || !isCurrent()) return false;
    if (rows.length) setMessagesFor(conversationId, list => rows.reduce((merged, row) => mergeMessage(merged, { ...row, seen: row.seen || seenIdsRef.current.has(row.id) }), list)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    return true;
  }, [activeId, currentId, messagesByConversation, setMessagesFor]);

  const deliver = useCallback(
    async (conversationId: string, text: string, clientId: string, attachment?: MediaAttachment, replyTo?: string) => {
      try {
        const saved = await postMessage(conversationId, text, clientId, attachment?.id, replyTo);
        setError(null);
        setMessagesFor(conversationId, (current) => mergeMessage(current, { ...saved, pending: false, seen: saved.seen || seenIdsRef.current.has(saved.id) }));
        return true;
      } catch (cause) {
        setMessagesFor(conversationId, (current) =>
          current.map((item) => (item.clientId === clientId ? { ...item, pending: false, failed: true } : item))
        );
        setError(cause instanceof Error ? cause.message : "That message did not send.");
        return false;
      }
    },
    [setMessagesFor]
  );

  const sendText = useCallback(
    async (raw: string, attachment?: MediaAttachment, reply?: MessageItem) => {
      const text = raw.trim().slice(0, MAX_CHAT_MESSAGE);
      if ((!text && !attachment) || !activeId || !currentId) return false;

      const clientId = newClientId();
      setMessagesFor(activeId, (current) => [
        ...current,
        {
          id: `local:${clientId}`,
          conversationId: activeId,
          from: currentId,
          text,
          attachment,
          reply: reply ? { id: reply.id, from: reply.from, text: reply.text, kind: reply.attachment?.kind ?? null, deleted: false } : null,
          clientId,
          createdAt: new Date().toISOString(),
          mine: true,
          pending: true,
        },
      ]);

      emitTyping(activeId, false);
      lastTypingSent.current = 0;
      return deliver(activeId, text, clientId, attachment, reply?.id);
    },
    [activeId, currentId, deliver, setMessagesFor]
  );

  const retryMessage = useCallback(
    (clientId: string) => {
      if (!activeId) return;
      const failed = (messagesByConversation[activeId] ?? []).find((item) => item.clientId === clientId);
      if (!failed) return;
      setMessagesFor(activeId, (current) =>
        current.map((item) =>
          item.clientId === clientId ? { ...item, pending: true, failed: false } : item
        )
      );
      void deliver(activeId, failed.text, clientId, failed.attachment ?? undefined, failed.reply?.id);
    },
    [activeId, deliver, messagesByConversation, setMessagesFor]
  );

  const changeMessage = useCallback(async (message: MessageItem, action: MessageAction) => {
    const owner = userIdRef.current;
    const result = await mutateMessage(message.conversationId, message.id, action);
    if (owner !== userIdRef.current) return;
    if (result.removed) visibilityVersion.current[message.conversationId] = (visibilityVersion.current[message.conversationId] ?? 0) + 1;
    setMessagesFor(message.conversationId, list => result.removed ? removeMessage(list, message.id) : result.message ? applyMessageChange(list, result.message) : list);
    if (owner) void refreshThreads(owner).catch(() => undefined);
  }, [setMessagesFor, refreshThreads]);
  const clearChat = useCallback(async (conversationId: string) => {
    const owner = userIdRef.current;
    const result = await clearConversation(conversationId);
    if (owner !== userIdRef.current) return;
    visibilityVersion.current[conversationId] = (visibilityVersion.current[conversationId] ?? 0) + 1;
    setMessagesFor(conversationId, list => list.filter(message => message.pending || message.failed || new Date(message.createdAt) > new Date(result.clearedAt)));
    if (owner) void refreshThreads(owner).catch(() => undefined);
  }, [setMessagesFor, refreshThreads]);
  const blockChat = useCallback(async (conversationId: string, blocked: boolean) => {
    const owner = userIdRef.current;
    const { conversation } = await blockConversation(conversationId, blocked);
    if (owner !== userIdRef.current) return;
    setConversations(list => list.map(item => item.id === conversationId ? conversation : item));
  }, []);

  const askToChat = useCallback(async (targetId: string) => {
    const result = await sendChatRequest(targetId);
    if (result.status === "accepted" && result.conversation) {
      const conversation = result.conversation;
      setConversations((current) =>
        current.some((thread) => thread.id === conversation.id) ? current : [conversation, ...current]
      );
      setPeopleQuery("");
      void fetchPeople("").then(setPeople).catch(() => undefined);
      selectConversation(conversation.id);
      return;
    }
    setPeople((current) =>
      current.map((person) => (person.id === targetId ? { ...person, relation: "outgoing" } : person))
    );
    setRequests((current) =>
      current.outgoing.some((item) => item.id === result.request?.id)
        ? current
        : { ...current, outgoing: [...current.outgoing, ...(result.request ? [result.request] : [])] }
    );
    setRemoteRequests((count) => count + 1);
  }, [selectConversation]);

  const respondTo = useCallback(
    async (requestId: string, accept: boolean) => {
      const result = await respondToRequest(requestId, accept);
      setRequests((current) => ({
        ...current,
        incoming: current.incoming.filter((item) => item.id !== requestId),
      }));
      setRemoteRequests((count) => Math.max(0, count - 1));

      if (accept && result.conversation) {
        const conversation = result.conversation;
        setConversations((current) =>
          current.some((thread) => thread.id === conversation.id) ? current : [conversation, ...current]
        );
        selectConversation(conversation.id);
      }
      void fetchPeople("").then(setPeople).catch(() => undefined);
    },
    [selectConversation]
  );

  const reportTyping = useCallback(() => {
    if (!activeId) return;
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_MIN_MS) return;
    lastTypingSent.current = now;
    emitTyping(activeId, true);
  }, [activeId]);

  const reportTypingStop = useCallback(() => {
    if (!activeId) return;
    lastTypingSent.current = 0;
    emitTyping(activeId, false);
  }, [activeId]);

  const activeConversation = useMemo(
    () => viewConversations.find((thread) => thread.id === viewActiveId) ?? null,
    [viewConversations, viewActiveId]
  );

  const badge = useMemo(() => {
    if (!ready) return 0;
    if (!chatOpen) return remoteUnread + remoteRequests;
    const unread = viewConversations.reduce((total, thread) => total + thread.unread, 0);
    return unread + viewRequests.incoming.length;
  }, [chatOpen, ready, remoteRequests, remoteUnread, viewConversations, viewRequests.incoming.length]);

  const value = useMemo<CommunityContextValue>(
    () => ({
      chatOpen,
      messageSoundEnabled,
      toggleMessageSound,
      badge,
      connected: ready && connected,
      loading,
      error,
      conversations: viewConversations,
      requests: viewRequests,
      people: viewPeople,
      peopleQuery,
      activeId: viewActiveId,
      activeConversation,
      messages: viewActiveId ? viewMessageMap[viewActiveId] ?? NO_BUBBLES : NO_BUBBLES,
      olderLoading,
      typingUsers: typingFor,
      onlineIds: viewOnlineIds,
      openChat,
      closeChat,
      searchPeople,
      selectConversation,
      loadOlder,
      revealMessage,
      sendText,
      retryMessage,
      changeMessage, clearChat, blockChat,
      askToChat,
      respondTo,
      reportTyping,
      reportTypingStop,
    }),
    [
      activeConversation,
      badge,
      chatOpen,
      messageSoundEnabled,
      toggleMessageSound,
      connected,
      error,
      loading,
      olderLoading,
      openChat,
      closeChat,
      peopleQuery,
      ready,
      retryMessage,
      changeMessage, clearChat, blockChat,
      searchPeople,
      selectConversation,
      sendText,
      loadOlder,
      revealMessage,
      askToChat,
      respondTo,
      reportTyping,
      reportTypingStop,
      typingFor,
      viewActiveId,
      viewConversations,
      viewMessageMap,
      viewOnlineIds,
      viewPeople,
      viewRequests,
    ]
  );

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity(): CommunityContextValue {
  const context = useContext(CommunityContext);
  if (!context) throw new Error("useCommunity must be used inside CommunityProvider");
  return context;
}
