"use client";

import { useEffect } from "react";

/*
 * Arrival is recorded the moment the page opens — before the visitor does
 * anything — because the click that brought them here is the fact worth
 * keeping. Everything the row needs is either in this URL (a tagged link) or
 * on the request (the address, the browser), so nothing is asked of them and
 * no permission is opened.
 */

const CLIENT_ID_KEY = "zyrava:client-id";
const SENT_MARK = "zyrava:visit-sent";

/**
 * A random id kept on this device, so "the same person came back from
 * Instagram twice" is answerable without a name, an email or a cookie trail.
 */
function clientId(): string {
  const minted = () =>
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    const stored = window.localStorage.getItem(CLIENT_ID_KEY);
    if (stored && stored.length <= 64) return stored;
    const fresh = minted();
    window.localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    // Storage off (private mode): this tab still counts as one arrival.
    return minted();
  }
}

export function VisitBeacon() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SENT_MARK)) return;
      window.sessionStorage.setItem(SENT_MARK, "1");
    } catch {
      /* No sessionStorage means no de-duplication; one extra row is honest. */
    }

    void fetch("/api/visits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: clientId(),
        path: window.location.pathname + window.location.search,
        referrer: document.referrer || undefined,
      }),
      credentials: "omit",
      keepalive: true,
      cache: "no-store",
    }).catch(() => {
      /* An unreachable API loses the row; the visitor never learns of it. */
    });
  }, []);

  return null;
}
