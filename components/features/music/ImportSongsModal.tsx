"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { useOffline } from "@/components/providers/OfflineProvider";
import { IMPORT_LIMITS } from "@/lib/offline";
import { formatBytes } from "@/lib/format";

/**
 * The way in for audio the user already owns. A folder is one click where the
 * browser can hand back a directory tree; everywhere else the same files are
 * reachable by picking them directly.
 */
export function ImportSongsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { canPickFolder, importFolder, importFiles, importing, locals } = useOffline();
  const filesRef = useRef<HTMLInputElement>(null);

  const busy = importing !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Songs on your device"
      description="Add audio you own and it plays here with no connection at all."
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2.5">
          {canPickFolder ? (
            <Button
              variant="primary"
              onClick={() => void importFolder()}
              disabled={busy}
              loading={busy}
            >
              <Icon name="music" className="size-4" />
              Choose a folder
            </Button>
          ) : null}
          <Button
            variant={canPickFolder ? "outline" : "primary"}
            onClick={() => filesRef.current?.click()}
            disabled={busy}
          >
            <Icon name="plus" className="size-4" />
            Choose files
          </Button>
        </div>

        <input
          ref={filesRef}
          type="file"
          multiple
          className="hidden"
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(event) => {
            const picked = event.currentTarget.files;
            if (picked?.length) void importFiles(picked);
            // Cleared so the same folder can be chosen twice in one session.
            event.currentTarget.value = "";
          }}
        />

        {busy ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Icon name="loader" className="size-3.5 motion-safe:animate-spin" />
            {importing && importing.total
              ? `Adding ${importing.done} of ${importing.total}…`
              : "Looking through that folder…"}
          </p>
        ) : (
          <p className="text-xs text-muted">
            {canPickFolder
              ? "The folder is remembered, so adding what landed in it later is one click."
              : "This browser can't open a whole folder — pick the files themselves."}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-separator bg-separator text-xs">
          <div className="bg-surface px-3 py-2">
            <dt className="text-faint-foreground">Songs here</dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">{locals.length}</dd>
          </div>
          <div className="bg-surface px-3 py-2">
            <dt className="text-faint-foreground">Room used</dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">
              {formatBytes(locals.reduce((sum, track) => sum + track.bytes, 0))}
            </dd>
          </div>
        </dl>

        <p className="text-[11px] text-faint-foreground">
          Up to {IMPORT_LIMITS.maxFiles} files at a time, none larger than{" "}
          {formatBytes(IMPORT_LIMITS.maxBytes)}. Names like “Artist - Title” are read as the
          artist and the song.
        </p>
      </div>
    </Modal>
  );
}
