"use client";
/** Explicit playback/recording intent prevents chat audio and music talking over each other. */
export const MEDIA_FOCUS_EVENT = "zyrava:media-focus";
export function focusMedia(id: string) {
  window.dispatchEvent(new CustomEvent(MEDIA_FOCUS_EVENT, { detail: id }));
}
