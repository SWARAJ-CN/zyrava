"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { usePwa } from "@/components/providers/PwaProvider";

/** The app gets a moment on screen before it asks anything. */
const ARRIVE_DELAY = 900;

const PERKS = [
  "Opens from your device like any other app, with its own icon.",
  "Keeps playing when you leave the page or lose the connection.",
  "Holds the songs you saved on this device, ready with no network.",
];

/**
 * The download offer, on every opening of the app until it is taken — a
 * turned-down modal is forgotten, only a real install stops the asking.
 *
 * There is no percentage to report: the device installs the app and says when
 * it is done, so the bar sweeps rather than counts.
 */
export function InstallModal() {
  const { canInstall, installed, installing, install } = usePwa();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (installed) return;
    const timer = window.setTimeout(() => setOpen(true), ARRIVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [installed]);

  const close = () => setOpen(false);

  return (
    <Modal
      open={open && !installed}
      onClose={close}
      title="Take the music with you"
      description="Download this as an app on your device — no store, no extra account."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={installing}>
            Ignore
          </Button>
          {canInstall ? (
            <Button
              variant="primary"
              loading={installing}
              onClick={() => void install()}
            >
              {!installing ? <Icon name="download" className="size-4" /> : null}
              {installing ? "Installing" : "Download"}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {PERKS.map((line) => (
            <li key={line} className="flex items-start gap-2 text-xs text-muted">
              <Icon name="check" className="mt-0.5 size-3.5 flex-none text-brand" strokeWidth={2.4} />
              {line}
            </li>
          ))}
        </ul>

        {installing ? (
          <div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-secondary">
              <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent motion-safe:animate-[splash-sweep_1.15s_ease-in-out_infinite]" />
            </div>
            <p className="mt-2 text-[11px] text-faint-foreground">
              Your device confirms the rest — the app icon shows up wherever your others live.
            </p>
          </div>
        ) : canInstall ? null : (
          <p className="text-[11px] text-faint-foreground">
            This browser keeps the download button to itself. Its own menu has the same option,
            usually worded as adding the page to your home screen.
          </p>
        )}
      </div>
    </Modal>
  );
}
