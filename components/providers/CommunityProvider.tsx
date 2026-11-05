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
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
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
  sendText: (text: string) => Promise<boolean>;
  retryMessage: (clientId: string) => void;
  askToChat: (userId: string) => Promise<void>;
  respondTo: (requestId: string, accept: boolean) => Promise<void>;
  reportTyping: () => void;
  reportTypingStop: () => void;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

/** Insert or replace by server id, then by the sender's optimistic id. */
function mergeMessage(list: MessageItem[], incoming: MessageItem): MessageItem[] {
  const index = list.findIndex(
    (item) => item.id === incoming.id || (!!incoming.clientId && item.clientId === incoming.clientId)
  );
  if (index === -1) return [...list, incoming];
  const next = [...list];
  next[index] = { ...incoming, pending: false };
  return next;
}

function applyPresence(conversation: ConversationItem, online: boolean, lastSeenAt: string | null): ConversationItem {
  return { ...conversation, user: { ...conversation.user, online, lastSeenAt } };
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const toast = useToast();
  const authenticated = status === "authenticated" && !!user;

  const [chatOpen, setChatOpen] = useState(false);
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
  const currentId = status === "authenticated" ? user?.id ?? null : null;
  const ready = currentId !== null && ownerId === currentId;

  /*
   * Socket handlers are bound once, so they read the moving parts from refs
   * instead of closing over a snapshot — otherwise a re-render would either
   * stale the handler or force a resubscribe mid-thread.
   */
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const conversationsRef = useRef<ConversationItem[]>([]);
  const chatOpenRef = useRef(chatOpen);
  const activeIdRef = useRef<string | null>(activeId);
  const typingTimers = useRef<Map<string, number>>(new Map());
  const lastTypingSent = useRef(0);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
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
        setMessagesByConversation((current) => {
          const list = current[message.conversationId] ?? [];
          return { ...current, [message.conversationId]: mergeMessage(list, message) };
        });

        // A thread that is not on screen keeps its counter honest.
        const open = chatOpenRef.current;
        const viewing = activeIdRef.current === message.conversationId;
        if (!message.mine) {
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
          if (!open) {
            setRemoteUnread((count) => count + 1);
            toast.toast({
              title: thread?.user.name ?? "A listener",
              description: message.text.slice(0, 120),
              variant: "info",
            });
          }
        }
      })
    );

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
        const { conversationId, readerId } = payload as { conversationId: string; readerId: string };
        if (readerId === userIdRef.current) return;
        setConversations((current) =>
          current.map((thread) => (thread.id === conversationId ? { ...thread, unread: 0 } : thread))
        );
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
  }, [authenticated, setMessagesFor, toast]);

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

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setActiveId(null);
  }, []);

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
      setActiveId(conversationId);
      if (!conversationId) return;

      setConversations((current) =>
        current.map((thread) => (thread.id === conversationId ? { ...thread, unread: 0 } : thread))
      );

      if (!messagesByConversation[conversationId]) {
        setLoading(true);
        fetchMessages(conversationId)
          .then((rows) => setMessagesFor(conversationId, () => rows))
          .catch((cause: Error) => setError(cause?.message ?? "That thread will not open."))
          .finally(() => setLoading(false));
      }
      void markConversationRead(conversationId);
    },
    [messagesByConversation, setMessagesFor]
  );

  const loadOlder = useCallback(() => {
    if (!activeId || olderLoading) return;
    const list = messagesByConversation[activeId] ?? [];
    const firstReal = list.find((item) => !item.pending);
    if (!firstReal) return;

    setOlderLoading(true);
    fetchMessages(activeId, firstReal.createdAt)
      .then((older) => {
        if (!older.length) return;
        setMessagesFor(activeId, (current) => {
          const known = new Set(current.map((item) => item.id));
          return [...older.filter((item) => !known.has(item.id)), ...current];
        });
      })
      .catch(() => undefined)
      .finally(() => setOlderLoading(false));
  }, [activeId, olderLoading, messagesByConversation, setMessagesFor]);

  const deliver = useCallback(
    async (conversationId: string, text: string, clientId: string) => {
      try {
        const saved = await postMessage(conversationId, text, clientId);
        setMessagesFor(conversationId, (current) => mergeMessage(current, { ...saved, pending: false }));
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
    async (raw: string) => {
      const text = raw.trim().slice(0, MAX_CHAT_MESSAGE);
      if (!text || !activeId || !currentId) return false;

      const clientId = newClientId();
      setMessagesFor(activeId, (current) => [
        ...current,
        {
          id: `local:${clientId}`,
          conversationId: activeId,
          from: currentId,
          text,
          clientId,
          createdAt: new Date().toISOString(),
          mine: true,
          pending: true,
        },
      ]);

      emitTyping(activeId, false);
      lastTypingSent.current = 0;
      return deliver(activeId, text, clientId);
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
      void deliver(activeId, failed.text, clientId);
    },
    [activeId, deliver, messagesByConversation, setMessagesFor]
  );

  const askToChat = useCallback(async (targetId: string) => {
    const result = await sendChatRequest(targetId);
    if (result.status === "accepted" && result.conversation) {
      const conversation = result.conversation;
      setConversations((current) =>
        current.some((thread) => thread.id === conversation.id) ? current : [conversation, ...current]
      );
      setPeopleQuery("");
      void fetchPeople("").then(setPeople).catch(() => undefined);
      setActiveId(conversation.id);
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
  }, []);

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
        setActiveId(conversation.id);
      }
      void fetchPeople("").then(setPeople).catch(() => undefined);
    },
    []
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
      sendText,
      retryMessage,
      askToChat,
      respondTo,
      reportTyping,
      reportTypingStop,
    }),
    [
      activeConversation,
      badge,
      chatOpen,
      connected,
      error,
      loading,
      olderLoading,
      openChat,
      closeChat,
      peopleQuery,
      ready,
      retryMessage,
      searchPeople,
      selectConversation,
      sendText,
      loadOlder,
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
