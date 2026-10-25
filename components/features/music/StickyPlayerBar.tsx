"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Waveform } from "./Waveform";
import {
  EQ_BANDS,
  EQ_PRESETS,
  SPATIAL_MODES,
  useMusicPlayer,
  type EqPreset,
  type SpatialMode,
} from "@/components/providers/MusicPlayerProvider";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * The persistent listening bar. Rendered once in the app shell so it floats
 * above every page; the queue keeps playing while the user browses around
 * (or leaves the browser minimized — the OS media session keeps it alive).
 *
 * Layouts: phones stack in two tidy rows (info / seek + EQ); sm and up use a
 * strict 3-column grid (details · transport · extras) so the seek row is
 * perfectly centred at every width. The EQ panel holds presets, band sliders
 * and the 8D / 3D / surround space modes.
 */
export function StickyPlayerBar() {
  const [eqOpen, setEqOpen] = useState(false);
  const [heavyPending, setHeavyPending] = useState<string | null>(null);
  const {
    queue,
    queueLabel,
    index,
    current,
    playing,
    progress,
    duration,
    volume,
    muted,
    playerError,
    visualizerReady,
    nowPlayingOpen,
    setNowPlayingOpen,
    sidebarWide,
    setMixerOpen,
    eqPreset,
    eqGains,
    spatialMode,
    getAnalyser,
    togglePlay,
    stepTrack,
    seek,
    setVolume,
    setMuted,
    applyPreset,
    setEqGains,
    setSpatialMode,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
  } = useMusicPlayer();

  const { isLiked, toggleLike, openPicker } = useLibrary();

  if (!current) return null;

  /** Live bars with a CSS mimic fallback when CORS blocks the analyser. */
  const renderWave = (className: string, tone: string) => (
    <span className={cn("grid place-items-center p-1", className)}>
      {visualizerReady ? (
        <Waveform
          getAnalyser={getAnalyser}
          active={playing}
          className={cn("h-full w-full", tone)}
        />
      ) : (
        <span className={cn("eq", tone)}>
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );

  const transport = (size: "sm" | "lg") => {
    const playSize = size === "lg" ? "size-11" : "size-10";
    const keySize = size === "lg" ? "size-9" : "size-8";
    const icon = size === "lg" ? "size-4" : "size-4 sm:size-[17px]";
    return (
      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
        <button
          type="button"
          title="Shuffle queue"
          aria-label="Shuffle queue"
          aria-pressed={shuffle}
          onClick={toggleShuffle}
          className={cn(
            "grid place-items-center rounded-full transition-colors duration-150",
            shuffle
              ? "bg-accent-soft text-brand"
              : "text-muted hover:bg-surface-secondary hover:text-foreground",
            keySize
          )}
        >
          <Icon name="shuffle" className={icon} />
        </button>
        <button
          type="button"
          title="Previous"
          aria-label="Previous track"
          onClick={() => stepTrack(-1)}
          disabled={index <= 0 && progress <= 3}
          className={cn(
            "grid place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
            keySize
          )}
        >
          <Icon name="skip-back" className={cn(icon, "fill-current")} />
        </button>
        <button
          type="button"
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          className={cn(
            "grid place-items-center rounded-full bg-foreground text-background transition-transform duration-150 hover:scale-105 active:scale-95",
            playSize
          )}
        >
          {playing ? (
            <Icon name="pause" className={cn(icon, "fill-current")} />
          ) : (
            <Icon name="play" className={cn(icon, "translate-x-px fill-current")} />
          )}
        </button>
        <button
          type="button"
          title="Next"
          aria-label="Next track"
          onClick={() => stepTrack(1)}
          className={cn(
            "grid place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-secondary hover:text-foreground",
            keySize
          )}
        >
          <Icon name="skip-forward" className={cn(icon, "fill-current")} />
        </button>
        <button
          type="button"
          title="Repeat — off, whole queue, this track"
          aria-label="Repeat mode"
          aria-pressed={repeat !== "off"}
          onClick={cycleRepeat}
          className={cn(
            "relative grid place-items-center rounded-full transition-colors duration-150",
            repeat !== "off"
              ? "bg-accent-soft text-brand"
              : "text-muted hover:bg-surface-secondary hover:text-foreground",
            keySize
          )}
        >
          <Icon name="repeat" className={icon} />
          {repeat !== "off" ? (
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 font-mono text-[7px] font-black uppercase tracking-widest">
              {repeat === "all" ? "all" : "1"}
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  const seekRow = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="w-9 flex-none text-end text-[10px] font-semibold tabular-nums text-muted-foreground sm:w-10 sm:text-[11px]">
        {formatSeconds(progress)}
      </span>
      <input
        type="range"
        min={0}
        max={Math.max(duration, 1)}
        step={1}
        value={Math.min(progress, duration || progress)}
        aria-label="Seek"
        onChange={(event) => seek(Number(event.target.value))}
        className="h-1.5 min-w-0 w-full cursor-pointer rounded-full sm:h-2"
        style={{ accentColor: "var(--accent)" }}
      />
      <span className="w-9 flex-none text-[10px] font-semibold tabular-nums text-muted-foreground sm:w-10 sm:text-[11px]">
        {formatSeconds(duration)}
      </span>
    </div>
  );

  /** Heavy-duty profiles need a hearing-safety confirmation before they engage. */
  const choosePreset = (preset: EqPreset) => {
    if (preset.heavy && eqPreset !== preset.label) {
      setHeavyPending(preset.label);
      return;
    }
    applyPreset(preset);
  };

  const eqChipActive = eqOpen || eqPreset !== EQ_PRESETS[0].label || spatialMode !== "off";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div
          className={cn(
            "pointer-events-none mx-auto w-full max-w-[100rem] px-3 pb-3 sm:px-6 lg:px-8",
            "dock-offset",
            !sidebarWide && "dock-offset--rail"
          )}
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {/* Equalizer + space panel floats above the bar. */}
          {eqOpen ? (
            <div className="glass pointer-events-auto mb-2 ml-auto max-h-[min(72vh,31rem)] w-full max-w-2xl overflow-y-auto rounded-t-field border border-b-0 border-separator px-4 pb-3 pt-3 shadow-pop sm:border-b-0 lg:max-w-3xl lg:rounded-b-none lg:border-b-0">
              <div className="flex items-center justify-between gap-2 pb-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Equalizer
                </p>
                <div className="flex flex-1 items-center gap-3">
                  {visualizerReady ? (
                    <div className="h-4 w-24 sm:block lg:w-56">
                      {renderWave("h-full w-full", "text-brand")}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEqOpen(false)}
                    className="min-h-8 px-1 text-[11px] font-semibold text-muted transition-colors hover:text-foreground"
                  >
                    Close ✕
                  </button>
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {EQ_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={eqPreset === preset.label}
                    onClick={() => choosePreset(preset)}
                    className={cn(
                      "min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors duration-150",
                      eqPreset === preset.label
                        ? "border-transparent bg-accent text-accent-foreground"
                        : "border-separator bg-surface text-muted hover:text-foreground"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Responsive band grid: stacks on phones,
                  3 across on tablets, 5 across on desktop. */}
              <div className="grid grid-cols-1 gap-2.5 pt-3 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-5">
                {EQ_BANDS.map((band, bandIndex) => (
                  <div key={band.frequency} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[11px] font-medium text-muted">
                      {band.label}
                    </span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={eqGains[bandIndex]}
                      aria-label={`${band.label} Hz gain`}
                      onChange={(event) => {
                        const gains = [...eqGains];
                        gains[bandIndex] = Number(event.target.value);
                        setEqGains(gains);
                      }}
                      className="h-1.5 w-full min-w-0 cursor-pointer rounded-full"
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span className="w-11 shrink-0 text-end text-[11px] tabular-nums text-muted">
                      {eqGains[bandIndex] > 0 ? "+" : ""}
                      {eqGains[bandIndex].toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Space modes */}
              <div className="mt-3.5 border-t border-separator pt-3">
                <p className="pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Space
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SPATIAL_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      title={mode.hint}
                      aria-pressed={spatialMode === mode.value}
                      onClick={() => setSpatialMode(mode.value as SpatialMode)}
                      className={cn(
                        "min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors duration-150",
                        spatialMode === mode.value
                          ? "border-transparent bg-accent text-accent-foreground"
                          : "border-separator bg-surface text-muted hover:text-foreground"
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="glass pointer-events-auto relative rounded-t-field border border-b-0 border-separator p-2.5 shadow-pop sm:rounded-none sm:border-b-0 sm:p-0 lg:rounded-b-none lg:border-b-0">
            {/* ── Phone: row 1 = cover · title · play ───────────────── */}
            <div className="flex items-center gap-2.5 sm:hidden">
              <div className="relative size-11 flex-none overflow-hidden rounded-lg bg-surface-muted">
                {current.image ? (
                  <Image
                    src={current.image}
                    alt=""
                    width={96}
                    height={96}
                    sizes="48px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-faint-foreground">
                    <Icon name="music" className="size-5" />
                  </span>
                )}
                {playing ? renderWave("absolute inset-0", "text-white") : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{current.title}</p>
                <p className="truncate text-xs text-muted">
                  {queueLabel ? `${queueLabel} · ` : ""}
                  {current.artist}
                </p>
                {/* Queue position stays visible on phones too. */}
                <p className="text-[10px] font-medium tabular-nums text-faint-foreground">
                  {index + 1} / {queue.length}
                  {playerError ? " · stream retry needed" : ""}
                </p>
              </div>
              {transport("sm")}
            </div>
            {/* ── Phone: row 2 = seek + EQ ─────────────────────────── */}
            <div className="mt-2 flex items-center gap-2 sm:hidden">
              {seekRow}
              <button
                type="button"
                title="Equalizer"
                aria-label="Equalizer"
                aria-expanded={eqOpen}
                onClick={() => setEqOpen((open) => !open)}
                className={cn(
                  "flex h-9 flex-none items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-colors",
                  eqChipActive
                    ? "border-accent/40 bg-accent-soft text-brand"
                    : "border-separator text-muted hover:text-foreground"
                )}
              >
                <Icon name="sliders" className="size-3.5" />
                EQ
              </button>
            </div>
            {playerError ? (
              <p className="mt-1 truncate text-[11px] text-danger sm:hidden">{playerError}</p>
            ) : null}

            {/* ── sm+: strict 3-column grid — details | transport | extras.
                The seek line lives on its own full-width row underneath. ── */}
            <div className="hidden items-center gap-4 px-3 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)_minmax(0,1fr)] lg:gap-6 lg:px-4">
              {/* Zone 1 — track details, right-aligned content edge */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative size-12 flex-none overflow-hidden rounded-lg bg-surface-muted lg:size-13">
                  {current.image ? (
                    <Image
                      src={current.image}
                      alt=""
                      width={96}
                      height={96}
                      sizes="52px"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-faint-foreground">
                      <Icon name="music" className="size-5" />
                    </span>
                  )}
                  {playing ? renderWave("absolute inset-0", "text-white") : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground sm:max-w-36 lg:max-w-52">
                    {current.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {current.artist}
                    {queueLabel ? (
                      <span className="text-faint-foreground"> · {queueLabel}</span>
                    ) : null}
                  </p>
                  {playerError ? (
                    <p className="truncate text-[11px] text-danger">{playerError}</p>
                  ) : null}
                </div>
              </div>

              {/* Zone 2 — transport, always visually centred */}
              <div className="flex justify-center">{transport("lg")}</div>

              {/* Zone 3 — EQ, queue position, volume, song page */}
              <div className="flex min-w-0 items-center justify-end gap-1 lg:gap-1.5">
                <button
                  type="button"
                  title={isLiked(current) ? "Liked" : "Like this song"}
                  aria-label={isLiked(current) ? "Remove from Liked songs" : "Like this song"}
                  aria-pressed={isLiked(current)}
                  onClick={() => toggleLike(current)}
                  className={cn(
                    "hidden size-9 flex-none place-items-center rounded-full transition-colors lg:grid",
                    isLiked(current)
                      ? "text-danger"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  <Icon name="heart" className={cn("size-4", isLiked(current) && "fill-current")} />
                </button>
                <button
                  type="button"
                  title="Add to playlist"
                  aria-label="Add this song to a playlist"
                  onClick={() => openPicker(current)}
                  className="hidden size-9 flex-none place-items-center rounded-full text-muted transition-colors hover:text-foreground lg:grid"
                >
                  <Icon name="plus" className="size-4" />
                </button>
                <span
                  className="hidden items-center gap-1.5 px-1 text-[11px] font-medium tabular-nums text-muted xl:flex"
                  title="Position in the queued list"
                >
                  <Icon name="list" className="size-3.5" />
                  {index + 1}/{queue.length}
                </span>
                <button
                  type="button"
                  title="Now playing panel"
                  aria-label="Toggle the now playing side panel"
                  aria-pressed={nowPlayingOpen}
                  onClick={() => setNowPlayingOpen(!nowPlayingOpen)}
                  className={cn(
                    "hidden size-9 flex-none place-items-center rounded-full border transition-colors xl:grid",
                    nowPlayingOpen
                      ? "border-accent/40 bg-accent-soft text-brand"
                      : "border-separator text-muted hover:text-foreground"
                  )}
                >
                  <Icon name="sidebar" className="size-4" />
                </button>
                <button
                  type="button"
                  title="Open the sound console"
                  aria-label="Open the full-screen sound console"
                  onClick={() => setMixerOpen(true)}
                  className="hidden size-9 flex-none place-items-center rounded-full border border-separator text-muted transition-colors hover:text-foreground xl:grid"
                >
                  <Icon name="sliders" className="size-4" />
                </button>
                <button
                  type="button"
                  title="Equalizer & space"
                  aria-label="Equalizer and space modes"
                  aria-expanded={eqOpen}
                  onClick={() => setEqOpen((open) => !open)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold transition-colors xl:px-3",
                    eqChipActive
                      ? "border-accent/40 bg-accent-soft text-brand"
                      : "border-separator text-muted hover:text-foreground"
                  )}
                >
                  <Icon name="sliders" className="size-3.5" />
                  EQ
                </button>
                <button
                  type="button"
                  aria-label={muted ? "Unmute" : "Mute"}
                  title={muted ? "Unmute" : "Mute"}
                  onClick={() => setMuted(!muted)}
                  className="grid size-9 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                >
                  {muted ? <Icon name="volume-x" className="size-4" /> : <Icon name="volume-2" className="size-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  aria-label="Volume"
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="w-16 cursor-pointer rounded-full lg:w-24"
                  style={{ accentColor: "var(--accent)" }}
                />
              </div>
            </div>

            {/* Seek spans the whole bottom bar on the desktop —
                timings at the edges, the scrubber eating the rest. */}
            <div className="hidden ps-3 pe-4 sm:block lg:ps-4">
              {seekRow}
            </div>
          </div>
        </div>
      </div>

      {/* Heavy-preset hearing-safety confirmation */}
      {heavyPending ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Heavy bass hearing warning"
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          onClick={() => setHeavyPending(null)}
        >
          <div
            className="glass w-full max-w-sm rounded-field border border-separator p-5 shadow-pop"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 pb-3">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-warning-soft text-warning-soft-foreground">
                <Icon name="alert-triangle" className="size-5" />
              </span>
              <p className="text-base font-bold text-foreground">
                {heavyPending} — ear check
              </p>
            </div>
            <p className="pb-1.5 text-sm leading-relaxed text-muted">
              This profile pushes the low frequencies hard — made for large
              speaker stacks (party PA systems, tourist-bus subwoofers).
              Extended listening at high volume — especially in enclosed
              spaces — can permanently damage your hearing, and big driver
              excursion can stress small speakers.
            </p>
            <p className="pb-4 text-sm text-muted">Keep the volume as loud as it needs to be — no louder.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => setHeavyPending(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={() => {
                  applyPreset(
                    EQ_PRESETS.find((preset) => preset.label === heavyPending) ??
                      EQ_PRESETS[0]
                  );
                  setHeavyPending(null);
                }}
              >
                Enable {heavyPending.toLowerCase()}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
