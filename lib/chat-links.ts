export interface ChatTextPart { text: string; href?: string }
const DOMAIN = String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)`;
const LINKS = new RegExp(String.raw`https?:\/\/[^\s<>\x22\x60]+|www\.[^\s<>\x22\x60]+|[a-z0-9._%+-]+@${DOMAIN}|${DOMAIN}(?::\d{1,5})?(?:[/?#][^\s<>\x22\x60]*)?`, "gi");
const EMAIL = new RegExp(String.raw`^[a-z0-9._%+-]+@${DOMAIN}$`, "i");

function trimPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const last = value[end - 1];
    if (/[.,!?;:'”’]/.test(last)) { end--; continue; }
    const opening = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[last];
    if (opening) {
      const text = value.slice(0, end);
      if (text.split(last).length > text.split(opening).length) { end--; continue; }
    }
    break;
  }
  return value.slice(0, end);
}

/** Plain-text URL detection only: never interpret HTML or executable schemes. */
export function chatTextParts(text: string): ChatTextPart[] {
  const parts: ChatTextPart[] = [];
  let end = 0;
  for (const match of text.matchAll(LINKS)) {
    const start = match.index!;
    // Don't turn the tail of an unsupported scheme or an email into a web link.
    if (start && /[\w@/\\:.+-]/.test(text[start - 1])) continue;
    const label = trimPunctuation(match[0]);
    if (!label) continue;
    let href: string;
    if (EMAIL.test(label)) href = `mailto:${label}`;
    else {
      try {
        const url = new URL(/^https?:\/\//i.test(label) ? label : `https://${label}`);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
        href = url.href;
      } catch { continue; }
    }
    if (start > end) parts.push({ text: text.slice(end, start) });
    parts.push({ text: label, href }); end = start + label.length;
  }
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts.length ? parts : [{ text }];
}
