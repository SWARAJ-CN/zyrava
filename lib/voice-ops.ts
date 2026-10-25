/**
 * A registry of the operations the page on screen has put up for voice.
 *
 * Pages register what they can do — "new sale", "export CSV", "save settings",
 * "next page" — and the microphone control offers and runs them. Only what the
 * current page contributes is available, so a command can never trigger
 * something the user cannot see or reach.
 *
 * Kept as a plain module store rather than React context so any client
 * component can register, including ones deep inside a feature panel; pages do
 * not have to be positioned relative to it in the tree.
 */

export interface VoiceOp {
  /** Stable within the registering component — it is how voice finds the op. */
  id: string;
  /**
   * Shown in the panel as the thing to tap or say.
   *
   * The message itself, not the translated text — the assistant puts it into
   * the language of the voice conversation when it reads it out, so the same
   * action is called by its own name whichever language is being spoken.
   */
  label: string;
  /** Spoken forms, on top of the label itself. */
  phrases: string[];
  /** What the panel reports once it has run — a message, for the same reason. */
  feedback: string;
  /**
   * Runs the operation.
   *
   * `spoken` is the whole utterance that triggered it — "search for Asha" —
   * so an operation can use what was said, not only that something was said.
   */
  run: (spoken: string) => void;
}

interface OwnedOps {
  owner: string;
  ops: VoiceOp[];
}

let owners: OwnedOps[] = [];
let cache: VoiceOp[] = [];
const listeners = new Set<() => void>();

function rebuild(): void {
  // Two pages should never claim the same id; if they do, the first wins and
  // the rest are dropped so lookups stay unambiguous.
  const seen = new Set<string>();
  const next: VoiceOp[] = [];
  for (const owner of owners) {
    for (const op of owner.ops) {
      if (seen.has(op.id)) continue;
      seen.add(op.id);
      next.push(op);
    }
  }
  cache = next;
}

function changed(): void {
  rebuild();
  for (const listener of listeners) listener();
}

/**
 * Puts operations up for voice. Returns the function that takes them down, so
 * pages can release them in an effect's cleanup and what can be said always
 * matches what is on screen.
 *
 * Only ids, labels and phrases are captured here. Handlers are looked up fresh
 * at call time by the hook, which keeps the latest closures — an op that
 * depends on state does not need re-registering on every render.
 */
export function registerVoiceOps(owner: string, ops: VoiceOp[]): () => void {
  owners = [
    ...owners.filter((entry) => entry.owner !== owner),
    { owner, ops },
  ];
  changed();

  return () => {
    owners = owners.filter((entry) => entry.owner !== owner);
    changed();
  };
}

export function readVoiceOps(): VoiceOp[] {
  return cache;
}

export function subscribeVoiceOps(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore`'s server snapshot — the server renders nothing. */
export const readVoiceOpsOnServer = (): VoiceOp[] => [];

export function findVoiceOp(id: string): VoiceOp | null {
  return cache.find((op) => op.id === id) ?? null;
}
