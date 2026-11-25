"use client";

/*
 * The community's account calls, all relative: next.config proxies
 * `/api/community` to the API host so the CSRF and session cookies stay
 * first-party — the same reason `lib/api.ts` never calls the API directly.
 *
 * Live delivery happens over the socket in `lib/socket.ts`. These calls are
 * still what writes anything, which is why chat keeps working when the
 * websocket is down: only the other tab's live update waits for a reconnect.
 */

import type { MediaAttachment } from "./media";
import { ApiError, apiFetch } from "@/lib/api";

export const MAX_CHAT_MESSAGE = 2000;

export interface ChatPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  lastSeenAt: string | null;
  online: boolean;
  /** Only set on the discover list. */
  relation?: "none" | "incoming" | "outgoing" | "conversation";
}

export interface ConversationItem {
  id: string;
  user: ChatPerson;
  blockedByMe?: boolean;
  messagingDisabled?: boolean;
  lastMessage: { text: string; from: string; at: string } | null;
  unread: number;
  updatedAt: string;
}

export interface MessageReply { id: string; from: string; text: string; kind: "image" | "video" | "audio" | null; deleted: boolean }
export const CHAT_REACTIONS = ["❤️", "😂", "😮", "👍"] as const;
export const CHAT_EDIT_WINDOW = 20 * 60 * 1000;
export interface MessageItem {
  id: string;
  conversationId: string;
  from: string;
  text: string;
  attachment?: MediaAttachment | null;
  reply?: MessageReply | null;
  editedAt?: string | null;
  deleted?: boolean;
  revision?: number;
  reactions?: Array<{ userId: string; emoji: string }>;
  clientId: string;
  createdAt: string;
  mine: boolean;
  /** Confirmed by the server when the other participant has read this message. */
  seen?: boolean;
  /** Local-only: an optimistic bubble the server has not confirmed. */
  pending?: boolean;
  failed?: boolean;
}

export interface RequestItem {
  id: string;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  user: ChatPerson;
}

export interface CommunitySummary {
  unread: number;
  requests: number;
  online: number;
}

export interface RequestResult {
  status: "pending" | "accepted";
  request?: RequestItem;
  conversation?: ConversationItem;
}

export async function fetchSummary(): Promise<CommunitySummary> {
  return apiFetch<CommunitySummary>("/api/community/summary");
}

export async function fetchPeople(query: string): Promise<ChatPerson[]> {
  const q = encodeURIComponent(query.trim().slice(0, 80));
  const payload = await apiFetch<{ people: ChatPerson[] }>(
    `/api/community/people${q ? `?q=${q}` : ""}`
  );
  return payload.people;
}

export async function fetchRequests(): Promise<{ incoming: RequestItem[]; outgoing: RequestItem[] }> {
  return apiFetch<{ incoming: RequestItem[]; outgoing: RequestItem[] }>("/api/community/requests");
}

export async function fetchConversations(): Promise<ConversationItem[]> {
  const payload = await apiFetch<{ conversations: ConversationItem[] }>("/api/community/conversations");
  return payload.conversations;
}

export async function fetchMessages(conversationId: string, before?: string): Promise<MessageItem[]> {
  const params = new URLSearchParams({ conversationId });
  if (before) params.set("before", before);
  const payload = await apiFetch<{ messages: MessageItem[] }>(
    `/api/community/messages?${params.toString()}`
  );
  return payload.messages;
}

export async function sendChatRequest(userId: string): Promise<RequestResult> {
  return apiFetch<RequestResult>("/api/community/request", { method: "POST", body: { userId } });
}

export async function respondToRequest(
  requestId: string,
  accept: boolean
): Promise<{ status: string; conversation: ConversationItem | null; from: string }> {
  return apiFetch<{ status: string; conversation: ConversationItem | null; from: string }>(
    "/api/community/respond",
    { method: "POST", body: { requestId, accept } }
  );
}

export async function postMessage(
  conversationId: string,
  text: string,
  clientId: string,
  attachmentId?: string,
  replyTo?: string
): Promise<MessageItem> {
  const payload = await apiFetch<{ message: MessageItem }>("/api/community/message", {
    method: "POST",
    body: { conversationId, text, clientId, attachmentId, replyTo },
  });
  return payload.message;
}

export interface ReadReceipt {
  conversationId: string;
  messageIds: string[];
  unread: number;
}

export async function markConversationRead(conversationId: string, messageIds: string[]): Promise<ReadReceipt | null> {
  try {
    return await apiFetch<ReadReceipt>("/api/community/read", { method: "POST", body: { conversationId, messageIds } });
  } catch (error) {
    // Read state is cosmetic; a failure here must never look like a lost message.
    if (!(error instanceof ApiError)) throw error;
    return null;
  }
}

/** Stable per-message id for optimistic sends and the server's de-duplication. */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type MessageAction = { action: "edit"; text: string } | { action: "delete"; scope: "me" | "everyone" } | { action: "react"; emoji: string | null };
export function mutateMessage(conversationId: string, messageId: string, change: MessageAction) {
  const { action, ...values } = change;
  return apiFetch<{ message?: MessageItem; removed?: boolean; messageId?: string }>(`/api/community/message/${action}`, { method: "POST", body: { conversationId, messageId, ...values } });
}
export function clearConversation(conversationId: string) {
  return apiFetch<{ conversationId: string; clearedAt: string }>("/api/community/clear", { method: "POST", body: { conversationId } });
}
export function blockConversation(conversationId: string, blocked: boolean) {
  return apiFetch<{ conversation: ConversationItem }>("/api/community/block", { method: "POST", body: { conversationId, blocked } });
}
