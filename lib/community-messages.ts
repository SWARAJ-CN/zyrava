import type { MessageItem } from "@/lib/community";

/** HTTP acknowledgements and socket pushes may arrive in either order. */
export function mergeMessage(list: MessageItem[], incoming: MessageItem): MessageItem[] {
  const index = list.findIndex((item) => item.id === incoming.id || (!!incoming.clientId && item.clientId === incoming.clientId));
  if (index === -1) return [...list, incoming];
  if ((list[index].revision ?? 0) > (incoming.revision ?? 0)) return list;
  const next = [...list];
  next[index] = { ...incoming, seen: Boolean(incoming.seen || list[index].seen), pending: false, failed: false };
  return next;
}

export function applyReadReceipt(list: MessageItem[], messageIds: string[], ownRead: boolean): MessageItem[] {
  const ids = new Set(messageIds);
  return list.map((message) => ids.has(message.id) && message.mine !== ownRead ? { ...message, seen: true } : message);
}

/** Updates never resurrect a message hidden by Clear chat or Delete for me. */
export function applyMessageChange(list: MessageItem[], incoming: MessageItem): MessageItem[] {
  const existing = list.find(message => message.id === incoming.id);
  if (existing && (existing.revision ?? 0) > (incoming.revision ?? 0)) return list;
  return list.map(message => message.id === incoming.id
    ? { ...incoming, seen: !!(incoming.seen || message.seen) }
    : message.reply?.id === incoming.id
      ? { ...message, reply: { id: incoming.id, from: incoming.from, text: incoming.deleted ? "" : incoming.text, kind: incoming.deleted ? null : incoming.attachment?.kind ?? null, deleted: !!incoming.deleted } }
      : message);
}
export function removeMessage(list: MessageItem[], id: string): MessageItem[] {
  return list.filter(message => message.id !== id).map(message => message.reply?.id === id ? { ...message, reply: { ...message.reply, text: "", kind: null, deleted: true } } : message);
}
