"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  registerVoiceOps,
  readVoiceOps,
  readVoiceOpsOnServer,
  subscribeVoiceOps,
  type VoiceOp,
} from "@/lib/voice-ops";

/**
 * The operations the page on screen has put up for voice, or `[]` while nothing
 * is registered.
 */
export function useVoiceOps(): VoiceOp[] {
  return useSyncExternalStore(subscribeVoiceOps, readVoiceOps, readVoiceOpsOnServer);
}

/**
 * Offers operations to the microphone for as long as the component is mounted.
 *
 * The trigger words and titles are taken from the render that mounted; run
 * handlers are resolved at the moment voice runs them, so an op that depends on
 * state — whether a form is open, whether there is a next page — is exactly as
 * current as the render that is on screen.
 *
 * The titles are re-registered when they change, so an operation follows the
 * language of the interface rather than keeping the one it was mounted with.
 */
export function useRegisterVoiceOps(owner: string, ops: VoiceOp[]): void {
  const latest = useRef(ops);
  const ownerKey = useId();

  /* Keep the freshest set: the handlers close over this render's state, and
     the words the microphone hears follow the language of the interface. */
  useEffect(() => {
    latest.current = ops;
  });

  /* What the microphone hears. When it changes — a new action, or a different
     language — the operations are put up again. */
  const signature = ops
    .map((op) => `${op.id}|${op.label}|${op.phrases.join(",")}`)
    .join("~");

  useEffect(() => {
    const release = registerVoiceOps(
      `${owner}@${ownerKey}`,
      latest.current.map((op) => ({
        id: op.id,
        label: op.label,
        phrases: op.phrases,
        feedback: op.feedback,
        /* Resolve through the ref, so the handler belongs to the render that
           is actually on screen rather than to the one that mounted. */
        run: (spoken: string) => latest.current.find((entry) => entry.id === op.id)?.run(spoken),
      }))
    );
    return release;
  }, [owner, ownerKey, signature]);
}
