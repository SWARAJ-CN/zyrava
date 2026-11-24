import type { MessageItem } from "@/lib/community";

/** HTTP acknowledgements and socket pushes may arrive in either order. */
export function mergeMessage(list: MessageItem[], incoming: MessageItem): MessageItem[] {
  const index = list.findIndex((item) => item.id === incoming.id || (!!incoming.clientId && item.clientId === incoming.clientId));
  if (index === -1) return [...list, incoming];
  const next = [...list];
  next[index] = { ...incoming, seen: Boolean(incoming.seen || list[index].seen), pending: false, failed: false };
  return next;
}

export function applyReadReceipt(list: MessageItem[], messageIds: string[], ownRead: boolean): MessageItem[] {
  const ids = new Set(messageIds);
  return list.map((message) => ids.has(message.id) && message.mine !== ownRead ? { ...message, seen: true } : message);
}
