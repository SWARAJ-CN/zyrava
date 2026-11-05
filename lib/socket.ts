"use client";

/*
 * One websocket for the whole tab, shared by every community component.
 *
 * It is deliberately separate from `lib/api.ts`: the REST calls carry the
 * cookies and the CSRF header, and this carries the access token in the
 * handshake so the socket dies with the session. A Next rewrite cannot proxy a
 * websocket reliably, so this connects straight to the API host — which is why
 * the server's `CLIENT_ORIGINS` also has to allow the browser's origin.
 */

import { io, type Socket } from "socket.io-client";
import { getAccessToken, refreshSession } from "@/lib/api";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/+$/, "");

/** Handshake refusals before deciding the account is really signed out. */
const MAX_AUTH_RETRIES = 3;

export type CommunityEvent =
  | "message:new"
  | "conversation:new"
  | "conversation:update"
  | "conversation:read"
  | "request:received"
  | "request:resolved"
  | "presence:init"
  | "presence:update"
  | "typing";

type Handler = (payload: never) => void;

let socket: Socket | null = null;
let authFailures = 0;
const handlers = new Map<CommunityEvent, Set<Handler>>();
const statusListeners = new Set<(connected: boolean) => void>();

function bind(socket: Socket) {
  socket.on("connect", () => {
    authFailures = 0;
    statusListeners.forEach((notify) => notify(true));
  });
  socket.on("disconnect", () => statusListeners.forEach((notify) => notify(false)));

  socket.on("connect_error", (error: Error & { message?: string }) => {
    if (error?.message !== "Unauthorized") return;
    authFailures += 1;
    /*
     * An expired access token is the usual reason, and the socket reconnects on
     * its own with a fresh one because `auth` below is read per attempt. Three
     * refusals in a row mean there is no session to recover, so the retry loop
     * stops rather than hammering the API.
     */
    if (authFailures >= MAX_AUTH_RETRIES) {
      socket.close();
      statusListeners.forEach((notify) => notify(false));
      return;
    }
    void refreshSession();
  });

  for (const [event, set] of handlers) {
    socket.on(event, (payload: unknown) => {
      set.forEach((handler) => handler(payload as never));
    });
  }
}

export function connectCommunity(): void {
  if (!getAccessToken()) return;
  if (socket) {
    if (!socket.connected) {
      authFailures = 0;
      socket.connect();
    }
    return;
  }

  socket = io(API_ORIGIN, {
    /*
     * socket.io expects the callback form: the function is handed a `proceed`
     * and must call it. Returning the object instead makes the client open the
     * transport and then wait forever for a handshake packet that never leaves.
     * Reading the token here rather than at module scope means every attempt —
     * including an automatic reconnect — carries whatever the app holds now.
     */
    auth: (proceed: (credentials: { token: string }) => void) =>
      proceed({ token: getAccessToken() ?? "" }),
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5_000,
  });
  bind(socket);
}

export function disconnectCommunity(): void {
  handlers.clear();
  socket?.close();
  socket = null;
  authFailures = 0;
}

export function communityConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * Subscribe to a server push. Handlers live in a registry rather than on the
 * socket, so a reconnection (and a component mounting before the socket exists)
 * never loses an event.
 */
export function onCommunityEvent(event: CommunityEvent, handler: Handler): () => void {
  const set = handlers.get(event) ?? new Set<Handler>();
  set.add(handler);
  handlers.set(event, set);
  socket?.on(event, (payload: unknown) => handler(payload as never));

  return () => {
    set.delete(handler);
  };
}

export function onCommunityStatus(listener: (connected: boolean) => void): () => void {
  statusListeners.add(listener);
  /*
   * A listener that appears after the socket is already up must learn the
   * present state rather than wait for the next change — which is what a
   * re-subscribing effect does. Deferred a tick so it never lands inside the
   * effect that registered it.
   */
  const live = socket?.connected ?? false;
  queueMicrotask(() => listener(live));
  return () => {
    statusListeners.delete(listener);
  };
}

/** Ephemeral: the server relays it to the other half of the thread, unstored. */
export function emitTyping(conversationId: string, isTyping: boolean): void {
  if (!socket?.connected) return;
  socket.emit(isTyping ? "typing:start" : "typing:stop", { conversationId });
}
