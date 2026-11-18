"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Check, X } from "lucide-react";
import {
  DANCING_CHARACTERS,
  type DancingCharacter,
} from "@/lib/dancing-characters";

export const DanceAnimation = dynamic(
  () =>
    import("./DancingCharacterPlayer").then(
      (module) => module.DancingCharacterPlayer,
    ),
  {
    ssr: false,
    loading: () => (
      <span className="dance-player-message" role="status">
        Loading character…
      </span>
    ),
  },
);

export function DancingCharacterPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: DancingCharacter | null;
  onSelect: (character: DancingCharacter) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    // A native top-layer dialog keeps the picker above fullscreen lyrics and
    // makes the underlying playback controls inert until the picker closes.
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="dance-picker"
      aria-labelledby="dance-picker-title"
      aria-describedby="dance-picker-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="dance-picker-content">
        <header className="dance-picker-header">
          <div>
            <p className="dance-picker-eyebrow">DANCING MODE</p>
            <h2 id="dance-picker-title">Select your dancing character</h2>
            <p id="dance-picker-description">
              Give your music a little company.
            </p>
          </div>
          <button
            type="button"
            className="dance-picker-close"
            onClick={onClose}
            aria-label="Close character picker"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div
          className="dance-character-options"
          role="group"
          aria-label="Dancing characters"
        >
          {DANCING_CHARACTERS.map((character) => (
            <button
              type="button"
              key={character.id}
              className="dance-character-option"
              aria-label={`Select ${character.label}`}
              aria-pressed={selected?.id === character.id}
              onClick={() => onSelect(character)}
            >
              <span className="dance-character-preview" aria-hidden="true">
                <DanceAnimation character={character} />
              </span>
              <span className="dance-character-label">
                {character.label}
                {selected?.id === character.id ? (
                  <Check size={16} aria-hidden="true" />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <p className="dance-picker-note">
          Your character replaces the artwork. Turn dancing mode off to bring it
          back.
        </p>
      </section>
    </dialog>
  );
}
