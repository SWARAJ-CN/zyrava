export const ONLINE_NOTICE = {
  title: "Someone’s online 👀",
  description: "Your next “hey” is waiting. Someone’s around for a little chit-chat 😄",
};
export const OPEN_COMMUNITY_MESSAGE = "zyrava:open-community";

/** Reconnect snapshots and repeat presence events must not become alerts. */
export function createOnlineNoticeGate(selfId: string) {
  let online = new Set<string>();
  let initialized = false;
  let lastNotice = -Infinity;
  const lastPerPerson = new Map<string, number>();
  return {
    snapshot(ids: string[]) {
      online = new Set(ids.filter((id) => id !== selfId));
      initialized = true;
    },
    update(id: string, isOnline: boolean, roomOpen: boolean, now = Date.now()) {
      if (id === selfId) return false;
      const wasOnline = online.has(id);
      if (isOnline) online.add(id);
      else online.delete(id);
      if (!initialized || !isOnline || wasOnline || roomOpen) return false;
      if (now - lastNotice < 120_000 || now - (lastPerPerson.get(id) ?? -Infinity) < 900_000) return false;
      lastNotice = now;
      lastPerPerson.delete(id);
      lastPerPerson.set(id, now);
      if (lastPerPerson.size > 256) lastPerPerson.delete(lastPerPerson.keys().next().value!);
      return true;
    },
  };
}

/** Use the phone's notification tray only with an existing permission grant. */
export async function showOnlineSystemNotice(): Promise<boolean> {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return false;
    await registration.showNotification(ONLINE_NOTICE.title, {
      body: ONLINE_NOTICE.description,
      icon: "/icons/pwa-192x192.png",
      badge: "/icons/pwa-192x192.png",
      tag: "zyrava-community-online",
      // No identity, email, name or contact details in the payload.
      data: { action: OPEN_COMMUNITY_MESSAGE },
    });
    return true;
  } catch { return false; }
}
