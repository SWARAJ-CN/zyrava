import type { MessageItem } from "./community";

/** Fetch contiguous history, never insert a distant reply with an invisible gap. */
export async function loadReplyHistory(
  messageId: string,
  current: MessageItem[],
  fetchOlder: (before?: string) => Promise<MessageItem[]>,
  isCurrent: () => boolean,
): Promise<MessageItem[] | null> {
  if (current.some(message => message.id === messageId)) return [];
  const dated = current.filter(message => !message.pending && !message.failed);
  let before = dated.length ? dated.reduce((first, row) => row.createdAt < first ? row.createdAt : first, dated[0].createdAt) : undefined;
  const additions: MessageItem[] = [];
  while (isCurrent()) {
    const page = await fetchOlder(before);
    if (!isCurrent()) return null;
    if (!page.length) throw new Error("The original message is no longer available in this chat.");
    additions.push(...page);
    if (page.some(message => message.id === messageId)) return additions;
    const oldest = page.reduce((first, row) => row.createdAt < first ? row.createdAt : first, page[0].createdAt);
    if (before && oldest >= before) throw new Error("Couldn't load the original message. Please try again.");
    before = oldest;
  }
  return null;
}
