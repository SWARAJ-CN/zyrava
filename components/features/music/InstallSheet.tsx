"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { usePwa } from "@/components/providers/PwaProvider";

/**
 * The three taps Safari's own menu takes. There is no call a page can make to
 * install on iPhone or iPad, so this sheet *is* the install flow.
 */
const STEPS = [
  "Tap Share — the box with an arrow pointing out of it, in the bar along the bottom of Safari. On iPad it sits up beside the address.",
  "Scroll that menu and tap “Add to Home Screen”.",
  "Tap Add. ZYRAVA lands with the rest of your apps and opens without Safari around it.",
];

export function InstallSheet() {
  const { sheetOpen, closeSheet } = usePwa();

  return (
    <Modal
      open={sheetOpen}
      onClose={closeSheet}
      title="Add ZYRAVA to your home screen"
      description="iPhone and iPad install an app this way — Safari does the rest."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeSheet}>
            Not now
          </Button>
          <Button variant="primary" onClick={closeSheet}>
            Got it
          </Button>
        </div>
      }
    >
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-xs text-muted">
            <span className="grid size-5 flex-none place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground tabular-nums">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mt-4 flex items-start gap-2 text-[11px] text-faint-foreground">
        <Icon name="share" className="mt-0.5 size-3.5 flex-none text-brand" strokeWidth={2} />
        {/* The menu is Safari’s alone, so the offer has to say where to be. */}
        Safari only: Chrome and Firefox on iPhone have no such menu. Open the page in Safari
        first, then tap Share.
      </p>
    </Modal>
  );
}
