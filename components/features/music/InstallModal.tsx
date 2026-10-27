"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { usePwa } from "@/components/providers/PwaProvider";

/** The app gets a moment on screen before it asks anything. */
const ARRIVE_DELAY = 900;

/** Session flag: the "Open app" bounce stays down once dismissed. */
const OPEN_APP_MARK = "zyrava:open-app-dismissed";

/** Session flag: a turned-down download offer stays down for this tab. */
const INSTALL_MARK = "zyrava:install-dismissed";

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
    /* The offer walks in on the first open of the session — turning it down
       keeps it down for the session, reloads included. A fresh tab asks again
       only because "installed" still isn't true. */
    try {
      if (window.sessionStorage.getItem(INSTALL_MARK) === "1") return;
    } catch {
      /* storage off keeps the asking standing */
    }
    const timer = window.setTimeout(() => setOpen(true), ARRIVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [installed]);

  const close = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(INSTALL_MARK, "1");
    } catch {
      /* the session simply forgets the forgetting */
    }
  };

  return (
    <>
      <InstallOffer
        open={open && !installed}
        onClose={close}
        canInstall={canInstall}
        installing={installing}
        install={install}
      />
      <OpenAppModal />
    </>
  );
}

interface InstallOfferProps {
  open: boolean;
  onClose: () => void;
  canInstall: boolean;
  installing: boolean;
  install: () => Promise<void>;
}

function InstallOffer({ open, onClose, canInstall, installing, install }: InstallOfferProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take the music with you"
      description="Download this as an app on your device — no store, no extra account."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={installing}>
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

/** Once per session: a tab visitor who has already installed gets bounced to
 *  the app with one button. Nothing to install, nothing to nag about — just
 *  the faster door. */
function OpenAppModal() {
  const { installed } = usePwa();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!installed) return;
    const app = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const display = window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: minimal-ui)").matches;
    if (app || display) return;
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(OPEN_APP_MARK) === "1";
    } catch {
      /* storage off leaves the offer standing */
    }
    if (dismissed) return;
    const timer = window.setTimeout(() => setOpen(true), ARRIVE_DELAY + 600);
    return () => window.clearTimeout(timer);
  }, [installed]);

  const close = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(OPEN_APP_MARK, "1");
    } catch {
      /* the session simply keeps the modal again */
    }
  };

  const openApp = () => {
    close();
    /* Going to the start URL hands the launch to the installed app on every
       engine that owns one — the manifest's launch handler focuses it. */
    window.open(window.location.origin, "_blank");
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Open ZYRAVA"
      description="The app is already installed — this is just the browser tab it lives in."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Keep browsing here
          </Button>
          <Button variant="primary" onClick={openApp}>
            <Icon name="external-link" className="size-4" />
            Open app
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted">
        Opening it from your home screen or this button starts ZYRAVA in its own window —
        same session, same music, no extra account.
      </p>
    </Modal>
  );
}
