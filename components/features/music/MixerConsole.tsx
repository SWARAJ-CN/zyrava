"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Waveform } from "@/components/features/music/Waveform";
import {
  DEFAULT_VOLUME,
  EQ_BANDS,
  EQ_PRESETS,
  FX_LABELS,
  FX_ORDER,
  SPATIAL_MODES,
  useMusicPlayer,
  type EqPreset,
  type FxName,
  type SpatialMode,
} from "@/components/providers/MusicPlayerProvider";
import { PADS, type PadName } from "@/lib/dj/pads";
import type { Song } from "@/lib/saavn";

/** Shared chrome for every console panel. */
const PANEL =
  "rounded-2xl border border-white/[0.08] bg-white/[0.025] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]";

/**
 * The hardware console — a full-screen mixer machine: deck with the current
 * song, stereo VU bridge, channel-strip faders for every EQ band, rotary
 * knobs for gain / balance / tempo / master and a backlit FX board for
 * presets and space modes.
 */
export function MixerConsole() {
  const [heavyPending, setHeavyPending] = useState<string | null>(null);
  const {
    queue,
    index,
    current,
    playing,
    progress,
    duration,
    queueLabel,
    volume,
    setVolume,
    preampDb,
    setPreampDb,
    balance,
    setBalance,
    rate,
    setRate,
    eqPreset,
    eqGains,
    setEqGains,
    applyPreset,
    markEqCustom,
    applyCustomPreset,
    spatialMode,
    setSpatialMode,
    muted,
    setMuted,
    loCut,
    setLoCut,
    repeat,
    cycleRepeat,
    shuffle,
    toggleShuffle,
    stop,
    jumpTo,
    crossfade,
    setCrossfade,
    fx,
    setFx,
    sweep,
    setSweep,
    subDb,
    setSubDb,
    compAmt,
    setCompAmt,
    limiterOn,
    setLimiterOn,
    loudnessOn,
    setLoudnessOn,
    playPad,
    togglePlay,
    stepTrack,
    seek,
    getAnalyser,
    getLevels,
    mixerOpen,
    setMixerOpen,
  } = useMusicPlayer();

  /* Lit state for the pad board — each pad glows while it rings. */
  const [padGlow, setPadGlow] = useState<string | null>(null);
  const tapPad = (name: PadName) => {
    playPad(name);
    setPadGlow(name);
    window.setTimeout(() => setPadGlow((lit) => (lit === name ? null : lit)), 1400);
  };

  // Escape closes; body scroll locks while the machine is on the desk.
  useEffect(() => {
    if (!mixerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMixerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [mixerOpen, setMixerOpen]);

  const choosePreset = (preset: EqPreset) => {
    if (preset.heavy && eqPreset !== preset.label) {
      setHeavyPending(preset.label);
      return;
    }
    applyPreset(preset);
  };

  const resetConsole = () => {
    applyPreset(EQ_PRESETS[0]);
    setPreampDb(0);
    setBalance(0);
    setRate(1);
    setVolume(DEFAULT_VOLUME);
    setLoCut(false);
    setMuted(false);
    setSweep(0);
    setSubDb(0);
    setCompAmt(0);
    setCrossfade(0);
    setLimiterOn(false);
    setLoudnessOn(false);
    setSpatialMode("off");
    setFx({
      echo: 0,
      reverb: 0,
      flanger: 0,
      chorus: 0,
      phaser: 0,
      drive: 0,
      roll: 0,
      stutter: 0,
    });
  };

  /** One master state for the party macro, so its lamp and its switch agree. */
  const partyEngaged =
    subDb >= 4 && loudnessOn && limiterOn && compAmt >= 0.4 && spatialMode === "wide";

  if (!mixerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ZYRAVA sound console"
      className="fixed inset-0 z-50 overflow-y-auto bg-[radial-gradient(120%_90%_at_50%_0%,#0d1018_0%,#05070b_58%,#020305_100%)]"
    >
      {/* Console head — sticky so the room, the reset and the exit stay put. */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05070b]/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[120rem] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-6 lg:px-8">
          <span
            className={cn(
              "size-2 flex-none rounded-full",
              playing ? "bg-[oklch(0.78_0.16_150)] shadow-[0_0_8px_oklch(0.78_0.16_150)]" : "bg-white/25"
            )}
          />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80 sm:text-[11px] sm:tracking-[0.3em]">
            <span className="hidden sm:inline">ZYRAVA · </span>Sound console
          </p>
          <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-white/35 sm:block">
            Direct digital mixer
          </span>
          <p className="hidden min-w-0 flex-1 items-center gap-2.5 md:flex">
            <span className="h-4 w-px flex-none bg-white/10" />
            <span className="truncate text-xs font-medium text-white/55">
              {current ? `${current.title} — ${current.artist}` : "No track loaded"}
            </span>
          </p>
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden font-mono text-[10px] tabular-nums tracking-wider text-white/35 sm:block">
              {queue.length
                ? `${String(index + 1).padStart(2, "0")} / ${String(queue.length).padStart(2, "0")}`
                : "00 / 00"}
            </span>
            <button
              type="button"
              onClick={resetConsole}
              title="Everything back to neutral"
              className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-wider text-white/55 transition-colors hover:border-white/20 hover:text-white/85"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setMixerOpen(false)}
              aria-label="Close the console"
              title="Close (Esc)"
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-white/70 transition-colors hover:border-white/20 hover:text-white"
            >
              <Icon name="x" className="size-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Close</span>
              <kbd className="hidden rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-white/40 sm:block">
                Esc
              </kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[120rem] flex-col gap-4 px-3 pb-10 pt-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ── Deck: artwork, VFD readout, transport ── */}
          <section className={cn(PANEL, "p-4 lg:col-span-5 xl:col-span-6")}>
            <div className="flex items-start gap-3.5">
              <div className="relative size-24 flex-none overflow-hidden rounded-xl border border-white/10 bg-black/40 sm:size-32">
                {current?.image ? (
                  <Image
                    src={current.imageLarge || current.image}
                    alt=""
                    fill
                    sizes="112px"
                    className={cn("object-cover", !playing && "opacity-70 saturate-50")}
                  />
                ) : (
                  <span className="grid h-full place-items-center text-white/30">
                    <Icon name="music" className="size-7" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                  {queueLabel || "Deck A"} · {index + 1}/{queue.length || 0}
                </p>
                {/* VFD track name */}
                <p
                  className={cn(
                    "mt-1 truncate font-mono text-lg font-bold tracking-wide text-[oklch(0.85_0.16_170)]",
                    !current && "text-white/25"
                  )}
                  title={current?.title}
                >
                  {current?.title ?? "-- no signal --"}
                </p>
                <p className="truncate text-xs font-medium text-white/55">{current?.artist ?? "--"}</p>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">
                    {current ? "320 kbps · AAC" : "no signal"}
                  </span>
                  {current?.language ? (
                    <span className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">
                      {current.language}
                    </span>
                  ) : null}
                  {current?.year ? (
                    <span className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">
                      {current.year}
                    </span>
                  ) : null}
                </div>

                {/* Ticker progress — click anywhere on the bar to seek */}
                <div className="mt-3">
                  <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-white/45">
                    <span>{fmt(progress)}</span>
                    <BpmChip getAnalyser={getAnalyser} active={playing} />
                    <span>-{fmt(Math.max(0, duration - progress))}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Seek"
                    className="group mt-1 block h-4 w-full cursor-pointer"
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      const fraction = (event.clientX - box.left) / box.width;
                      if (duration) seek(fraction * duration);
                    }}
                  >
                    <span className="block h-1.5 overflow-hidden rounded-full bg-black/40 transition-all group-hover:h-2.5">
                      <span
                        className="block h-full rounded-full bg-[linear-gradient(90deg,oklch(0.72_0.14_170),oklch(0.8_0.15_150))]"
                        style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                      />
                    </span>
                  </button>
                </div>

                {/* Wave monitor — live signal strip off the analyser tap */}
                <div className="mt-3">
                  <p className="pb-1 text-[9px] font-bold uppercase tracking-[0.3em] text-white/35">
                    Wave monitor
                  </p>
                  <div className="h-14 overflow-hidden rounded-lg border border-white/10 bg-black/45 px-1.5 py-1 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]">
                    <Waveform
                      getAnalyser={getAnalyser}
                      active={playing}
                      density={5}
                      className="h-full w-full text-[oklch(0.85_0.16_170)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Transport + deck utilities */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
              <button
                type="button"
                onClick={() => stepTrack(-1)}
                title="Previous"
                className="grid size-10 place-items-center rounded-lg bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.14] hover:text-white"
              >
                <Icon name="skip-back" className="size-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                title={playing ? "Pause" : "Play"}
                className={cn(
                  "grid size-14 place-items-center rounded-xl text-black shadow-[0_16px_44px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.04] active:scale-95",
                  "bg-[linear-gradient(180deg,oklch(0.9_0.12_170),oklch(0.72_0.14_170))]"
                )}
              >
                <Icon name={playing ? "pause" : "play"} size={22} className="fill-black" />
              </button>
              <button
                type="button"
                onClick={() => stepTrack(1)}
                title="Next"
                className="grid size-10 place-items-center rounded-lg bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.14] hover:text-white"
              >
                <Icon name="skip-forward" className="size-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={stop}
                title="Stop — silence and rewind"
                className="grid size-10 place-items-center rounded-lg bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.14] hover:text-white"
              >
                <Icon name="square" className="size-3.5 fill-current" />
              </button>
              <button
                type="button"
                onClick={toggleShuffle}
                title="Shuffle queue"
                aria-pressed={shuffle}
                className={cn(
                  "ms-auto grid size-10 place-items-center rounded-lg transition-colors",
                  shuffle
                    ? "bg-[oklch(0.78_0.14_170)]/15 text-[oklch(0.85_0.16_170)]"
                    : "bg-white/[0.07] text-white/75 hover:bg-white/[0.14] hover:text-white"
                )}
              >
                <Icon name="shuffle" className="size-4" />
              </button>
              <button
                type="button"
                onClick={cycleRepeat}
                title="Repeat — off, whole queue, this track"
                aria-pressed={repeat !== "off"}
                className={cn(
                  "relative grid size-10 place-items-center rounded-lg transition-colors",
                  repeat !== "off"
                    ? "bg-[oklch(0.78_0.14_170)]/15 text-[oklch(0.85_0.16_170)]"
                    : "bg-white/[0.07] text-white/75 hover:bg-white/[0.14] hover:text-white"
                )}
              >
                <Icon name="repeat" className="size-4" />
                {repeat !== "off" ? (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 font-mono text-[7px] font-black uppercase tracking-widest">
                    {repeat === "all" ? "all" : "1"}
                  </span>
                ) : null}
              </button>
            </div>
          </section>

          {/* ── VU bridge segment meters (fixed frame — never resizes) ── */}
          <section className={cn(PANEL, "bg-black/25 p-3 lg:col-span-3 xl:col-span-2")}>
            <p className="pb-2 text-center text-[9px] font-bold uppercase tracking-[0.3em] text-white/40">
              Output level
            </p>
            <VUMeter getLevels={getLevels} active={playing} />
          </section>

          {/* ── Knob bay ── */}
          <section className={cn(PANEL, "p-4 lg:col-span-4")}>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3">
              <Knob
                label="Filter"
                value={sweep}
                min={-1}
                max={1}
                step={0.05}
                onChange={setSweep}
                format={(value) =>
                  value === 0
                    ? "off"
                    : `${value < 0 ? "HP" : "LP"} ${Math.round(Math.abs(value) * 100)}`
                }
                resetValue={0}
              />
              <Knob
                label="Sub"
                value={subDb}
                min={-12}
                max={12}
                step={0.5}
                onChange={setSubDb}
                format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
                unit="dB"
                resetValue={0}
              />
              <Knob
                label="Gain"
                value={preampDb}
                min={-6}
                max={12}
                step={0.5}
                onChange={setPreampDb}
                format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
                unit="dB"
                resetValue={0}
              />
              <Knob
                label="Balance"
                value={balance}
                min={-1}
                max={1}
                step={0.05}
                onChange={setBalance}
                format={(value) =>
                  value === 0 ? "C" : `${value < 0 ? "L" : "R"}${Math.abs(Math.round(value * 100))}`
                }
                resetValue={0}
              />
              <Knob
                label="Tempo"
                value={rate}
                min={0.7}
                max={1.3}
                step={0.05}
                onChange={setRate}
                format={(value) => value.toFixed(2)}
                unit="×"
                resetValue={1}
              />
              <Knob
                label="Master"
                value={volume}
                min={0}
                max={1}
                step={0.01}
                onChange={setVolume}
                format={(value) => `${Math.round(value * 100)}`}
                unit="%"
                resetValue={DEFAULT_VOLUME}
              />
            </div>
            {/* Utility switches: low-cut and mute */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <SwitchChip
                label="Low cut"
                hint="40 Hz rumble filter — cleans big PA stacks and bus subs"
                engaged={loCut}
                onClick={() => setLoCut(!loCut)}
              />
              <SwitchChip
                label="Mute"
                hint="Silence the master output"
                engaged={muted}
                onClick={() => setMuted(!muted)}
              />
            </div>
          </section>
        </div>

        {/* ── DJ effect rack: dry/wet send per slot, like a real FX unit ── */}
        <section className={cn(PANEL, "p-4")}>
          <div className="pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
              Effect rack · wet send
            </p>
            <p className="pt-0.5 text-[10px] font-medium text-white/30">
              0 = pure signal · 100 = full effect
            </p>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {FX_ORDER.map((name) => (
              <FxRow
                key={name}
                name={name}
                value={fx[name]}
                onChange={(value) => setFx({ [name]: value })}
              />
            ))}
          </div>
        </section>

        {/* ── Dynamics + Auto DJ + party pads ── */}
        <section className={cn(PANEL, "p-4")}>
          <p className="pb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            Bus · Auto DJ · Pads
          </p>

          <div className="grid grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-3">
            {/* Dynamics rows */}
            <div className="space-y-2.5">
              <HorizontalFader
                label="Compressor"
                value={compAmt}
                onChange={setCompAmt}
                format={(value) => `${Math.round(value * 100)}%`}
                hint="Smooths big level swings — radio-style glue"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/55">Limiter</span>
                <SwitchChip
                  label={limiterOn ? "armed" : "off"}
                  hint="Brick-wall safety for the master bus"
                  engaged={limiterOn}
                  onClick={() => setLimiterOn(!limiterOn)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/55">Loudness</span>
                <SwitchChip
                  label={loudnessOn ? "on" : "off"}
                  hint="Warm low + airy top shelf — friendly loud"
                  engaged={loudnessOn}
                  onClick={() => setLoudnessOn(!loudnessOn)}
                />
              </div>
            </div>

            {/* Auto DJ rows */}
            <div className="space-y-2.5">
              <HorizontalFader
                label="Crossfade"
                value={crossfade}
                max={8}
                onChange={setCrossfade}
                format={(value) =>
                  value === 0 ? "hard cut" : `${value.toFixed(1)} s`
                }
                hint="Track hand-off fade — the DJ blend"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/55">Auto mix</span>
                <button
                  type="button"
                  title="Shuffle + 4-second crossfade hand-offs"
                  aria-pressed={shuffle && crossfade >= 4}
                  onClick={() => {
                    const engaged = shuffle && crossfade >= 4;
                    if (engaged) {
                      if (shuffle) toggleShuffle();
                      setCrossfade(0);
                    } else {
                      if (!shuffle) toggleShuffle();
                      setCrossfade(4);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    shuffle && crossfade >= 4
                      ? "border-[oklch(0.78_0.14_170)]/60 bg-[oklch(0.78_0.14_170)]/12 text-[oklch(0.85_0.16_170)]"
                      : "border-white/10 bg-black/25 text-white/50 hover:border-white/25 hover:text-white/85"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-colors",
                      shuffle && crossfade >= 4
                        ? "bg-[oklch(0.85_0.16_170)] shadow-[0_0_7px_oklch(0.85_0.16_170)]"
                        : "bg-white/20"
                    )}
                  />
                  flow
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/55">Party mode</span>
                <button
                  type="button"
                  title="Sub lift, loudness, glue and a wide stage"
                  aria-pressed={partyEngaged}
                  onClick={() => {
                    if (partyEngaged) {
                      setSubDb(0);
                      setLoudnessOn(false);
                      setCompAmt(0);
                      setLimiterOn(false);
                      setSpatialMode("off");
                    } else {
                      setSubDb(5);
                      setLoudnessOn(true);
                      setCompAmt(0.5);
                      setLimiterOn(true);
                      setSpatialMode("wide");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    partyEngaged
                      ? "border-[oklch(0.82_0.17_60)]/60 bg-[oklch(0.82_0.17_60)]/12 text-[oklch(0.86_0.16_70)]"
                      : "border-white/10 bg-black/25 text-white/50 hover:border-white/25 hover:text-white/85"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      partyEngaged
                        ? "bg-[oklch(0.86_0.16_70)] shadow-[0_0_7px_oklch(0.86_0.16_70)]"
                        : "bg-white/20"
                    )}
                  />
                  ignite
                </button>
              </div>
            </div>

            {/* Pad board */}
            <div>
              <p className="pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">
                Pads · one-tap FX
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {PADS.map((pad) => (
                  <button
                    key={pad.name}
                    type="button"
                    title={pad.hint}
                    onClick={() => tapPad(pad.name)}
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg border px-1 transition-all duration-150 active:scale-95",
                      padGlow === pad.name
                        ? "border-[oklch(0.85_0.16_170)] bg-[oklch(0.78_0.14_170)]/20 text-[oklch(0.87_0.16_170)] shadow-[0_0_12px_oklch(0.78_0.14_170/0.45)]"
                        : "border-white/10 bg-black/25 text-white/55 hover:border-white/25 hover:text-white/90"
                    )}
                  >
                    <Icon
                      name={
                        pad.name === "siren"
                          ? "bell"
                          : pad.name === "laser"
                            ? "zap"
                            : pad.name === "crowd"
                              ? "globe"
                              : pad.name === "riser"
                                ? "waves"
                                : pad.name === "air-horn"
                                  ? "volume-2"
                                  : pad.name === "bass-drop"
                                    ? "volume-1"
                                    : "activity"
                      }
                      className="size-4"
                    />
                    <span className="text-[9px] font-bold uppercase tracking-wide">
                      {pad.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Queue control strip ── */}
        {queue.length > 0 ? (
          <section className={cn(PANEL, "p-3")}>
            <p className="pb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
              Queue control · {queue.length} tracks {shuffle ? "· shuffled" : ""}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {queue.map((song: Song, position: number) => (
                <button
                  key={`${song.id}-${position}`}
                  type="button"
                  onClick={() => jumpTo(position)}
                  className={cn(
                    "flex-none max-w-44 truncate rounded border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                    position === index
                      ? "border-[oklch(0.78_0.14_170)]/60 bg-[oklch(0.78_0.14_170)]/12 text-[oklch(0.85_0.16_170)]"
                      : "border-white/10 bg-black/25 text-white/55 hover:border-white/25 hover:text-white/90"
                  )}
                >
                  <span className="me-1 font-mono text-[9px] text-white/35">
                    {String(position + 1).padStart(2, "0")}
                  </span>
                  {song.title}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Channel strips: ten EQ faders + the FX board below ── */}
        <section className={cn(PANEL, "p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
                Channel EQ · 10-band
              </p>
              <p className="pt-1 text-[11px] font-medium text-white/30">
                ±12 dB per band · move a band to save it as Custom
              </p>
            </div>
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
              Preset
              <select
                aria-label="Equalizer preset"
                value={eqPreset}
                onChange={(event) => {
                  if (event.target.value === "Custom") {
                    applyCustomPreset();
                    return;
                  }
                  const preset = EQ_PRESETS.find((entry) => entry.label === event.target.value);
                  if (preset) choosePreset(preset);
                }}
                className="compact-select h-9 rounded-lg border border-white/10 bg-black/35 px-2.5 pe-7 font-semibold text-white/80 transition-colors hover:border-white/25"
              >
                <option value="Custom" className="bg-[#0a0f14] text-white">
                  Custom
                </option>
                {EQ_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.label} className="bg-[#0a0f14] text-white">
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Fader strips */}
          <div className="flex items-end justify-between gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {EQ_BANDS.map((band, bandIndex) => (
              <FaderStrip
                key={band.frequency}
                label={band.label}
                value={eqGains[bandIndex] ?? 0}
                onChange={(value) => {
                  const gains = [...eqGains];
                  gains[bandIndex] = value;
                  setEqGains(gains);
                  markEqCustom(gains);
                }}
              />
            ))}
          </div>
        </section>

        {/* ── FX board: space modes as backlit switches ── */}
        <section className={cn(PANEL, "p-4")}>
          <p className="pb-2.5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            Space processor
          </p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-11">
            {SPATIAL_MODES.map((mode) => {
              const engaged = spatialMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  title={mode.hint}
                  aria-pressed={engaged}
                  onClick={() => setSpatialMode(mode.value as SpatialMode)}
                  className={cn(
                    "group flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-2 transition-all duration-150",
                    engaged
                      ? "border-[oklch(0.78_0.14_170)]/60 bg-[oklch(0.78_0.14_170)]/12 text-[oklch(0.85_0.16_170)] shadow-[inset_0_0_14px_oklch(0.78_0.14_170/0.2)]"
                      : "border-white/10 bg-black/25 text-white/50 hover:border-white/25 hover:text-white/85"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      engaged ? "bg-[oklch(0.85_0.16_170)] shadow-[0_0_7px_oklch(0.85_0.16_170)]" : "bg-white/20"
                    )}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
      {/* Heavy preset hearing-safety dialog */}
      {heavyPending ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Heavy bass hearing warning"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4"
          onClick={() => setHeavyPending(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0c1017] p-5 shadow-pop"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-bold text-white">{heavyPending} — ear check</p>
            <p className="pb-4 pt-2 text-xs leading-relaxed text-white/60">
              Heavy-duty profiles drive big stacks hard. Loud as it needs to be —
              no louder.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setHeavyPending(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  applyPreset(
                    EQ_PRESETS.find((preset) => preset.label === heavyPending) ?? EQ_PRESETS[0]
                  );
                  setHeavyPending(null);
                }}
              >
                Enable
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * SwitchChip — one backlit utility switch.                             *
 * ------------------------------------------------------------------ */
function SwitchChip({
  label,
  hint,
  engaged,
  onClick,
}: {
  label: string;
  hint: string;
  engaged: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-pressed={engaged}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
        engaged
          ? "border-[oklch(0.78_0.14_170)]/60 bg-[oklch(0.78_0.14_170)]/12 text-[oklch(0.85_0.16_170)]"
          : "border-white/10 bg-black/25 text-white/50 hover:border-white/25 hover:text-white/85"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full transition-colors",
          engaged ? "bg-[oklch(0.85_0.16_170)] shadow-[0_0_7px_oklch(0.85_0.16_170)]" : "bg-white/20"
        )}
      />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * FxRow — one wet-send row in the FX rack.                             *
 * ------------------------------------------------------------------ */
function FxRow({
  name,
  value,
  onChange,
}: {
  name: FxName;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="size-1.5 flex-none rounded-full bg-white/20 data-[on]:bg-[oklch(0.85_0.16_170)]" data-on={value > 0 ? "" : undefined} />
      <span className="w-20 flex-none text-[11px] font-bold text-white/60">{FX_LABELS[name]}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={`${FX_LABELS[name]} wet level`}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[oklch(0.78_0.14_170)]"
      />
      <span
        className={cn(
          "w-9 flex-none text-right font-mono text-[10px] font-bold tabular-nums",
          value > 0 ? "text-[oklch(0.85_0.16_170)]" : "text-white/40"
        )}
      >
        {Math.round(value * 100)}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * HorizontalFader — labeled 0..max slider row for dynamics / timing.   *
 * ------------------------------------------------------------------ */
function HorizontalFader({
  label,
  value,
  max = 1,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold text-white/55" title={hint}>
          {label}
        </span>
        <span className="flex-none font-mono text-[10px] font-bold tabular-nums text-[oklch(0.85_0.16_170)]">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={max <= 1 ? 0.05 : 0.5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[oklch(0.78_0.14_170)]"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * BpmChip — live BPM estimate from bass-energy impulse intervals.      *
 * ------------------------------------------------------------------ */
function BpmChip({
  getAnalyser,
  active,
}: {
  getAnalyser: () => AnalyserNode | null;
  active: boolean;
}) {
  const [bpm, setBpm] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      // Reset on the animation clock — React 19's setState-in-effect rule.
      const settle = requestAnimationFrame(() => setBpm(null));
      return () => cancelAnimationFrame(settle);
    }
    const beats: number[] = [];
    const energies: number[] = [];
    let last: number | null = null;
    const finalize = window.setInterval(() => {
      if (beats.length >= 4) {
        // Median interval between impulses → BPM, folded into 70–180.
        const gaps = beats.slice(1).map((time, i) => time - beats[i]).sort((a, b) => a - b);
        const median = gaps[gaps.length >> 1];
        let value = 60000 / median;
        while (value < 70) value *= 2;
        while (value > 180) value /= 2;
        setBpm(Math.round(value));
      } else {
        setBpm(null);
      }
    }, 1100);

    const timer = window.setInterval(() => {
      const analyser = getAnalyser();
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      let bass = 0;
      for (let bin = 0; bin < 8 && bin < data.length; bin += 1) bass += data[bin];
      bass /= Math.min(8, data.length);
      energies.push(bass);
      if (energies.length > 30) energies.shift();
      const baseline =
        energies.reduce((sum, value) => sum + value, 0) / Math.max(1, energies.length);
      const now = performance.now();
      if (bass > baseline * 1.45 && bass > 60) {
        if (last === null || now - last > 220) {
          beats.push(now);
          last = now;
        }
      }
      if (beats.length > 20) beats.shift();
    }, 33);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(finalize);
    };
  }, [active, getAnalyser]);

  return (
    <span className="min-w-10 text-center font-mono text-[10px] font-bold tabular-nums text-white/55">
      {bpm ? (
        <span className="text-[oklch(0.85_0.16_170)]">{bpm} BPM</span>
      ) : (
        "-- BPM"
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * VU bridge — stereo LED segments fed live from the meter taps.        *
 * ------------------------------------------------------------------ */
function VUMeter({
  getLevels,
  active,
}: {
  getLevels: () => [number, number];
  active: boolean;
}) {
  const [meter, setMeter] = useState<{
    levels: [number, number];
    peaks: [number, number];
    db: [number, number];
  }>({
    levels: [0, 0],
    peaks: [0, 0],
    db: [-Infinity, -Infinity],
  });
  const [clip, setClip] = useState(false);
  const clipHoldRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // Meter decay — zero out on the animation clock instead of in the
      // effect body (React 19's setState-in-effect rule).
      const settle = requestAnimationFrame(() => {
        clipHoldRef.current = 0;
        setClip(false);
        setMeter({ levels: [0, 0], peaks: [0, 0], db: [-Infinity, -Infinity] });
      });
      return () => cancelAnimationFrame(settle);
    }
    let frame = requestAnimationFrame(loop);
    const peaksRef: [number, number] = [0, 0];
    // Ballistics: rise fast, fall slow — the meter glides like needle gear
    // instead of twitching at raw frame-rate RMS.
    const smoothRef: [number, number] = [0, 0];
    function loop() {
      const [l, r] = getLevels();
      // Clip catch: hold the red lamp 2.5s after the last overload.
      const peakRms = Math.max(l, r);
      clipHoldRef.current = Math.min(
        clipHoldRef.current + (peakRms > 0.92 ? 1 : -0.016),
        1
      );
      setClip(clipHoldRef.current > 0.2);
      // dB-ish scale: half-RootSquare mapping; 0.28 RMS ~ near full swing.
      const toMeter = (rms: number) =>
        Math.min(1, Math.max(0, (Math.sqrt(rms) - 0.05) / 0.45));
      const raw: [number, number] = [toMeter(l), toMeter(r)];
      smoothRef[0] += (raw[0] - smoothRef[0]) * (smoothRef[0] < raw[0] ? 0.5 : 0.12);
      smoothRef[1] += (raw[1] - smoothRef[1]) * (smoothRef[1] < raw[1] ? 0.5 : 0.12);
      peaksRef[0] = Math.max(peaksRef[0] * 0.96, smoothRef[0]);
      peaksRef[1] = Math.max(peaksRef[1] * 0.96, smoothRef[1]);
      setMeter({
        levels: [smoothRef[0], smoothRef[1]],
        peaks: [peaksRef[0], peaksRef[1]],
        db: [
          l > 1e-4 ? 20 * Math.log10(l) : -Infinity,
          r > 1e-4 ? 20 * Math.log10(r) : -Infinity,
        ],
      });
      frame = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(frame);
  }, [active, getLevels]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Clip lamp — lights red and holds for a beat after an overload */}
      <span
        className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest transition-colors",
          clip ? "bg-[oklch(0.66_0.2_25)] text-white" : "bg-white/10 text-white/30"
        )}
      >
        clip
      </span>
      <div className="flex items-center justify-center gap-2.5">
        {(["L", "R"] as const).map((side, channel) => (
        <div key={side} className="flex flex-col items-center gap-1">
          {/* Per-channel dB readout, straight off the meter tap (fixed box) */}
          <span className="min-w-[4.25rem] text-center font-mono text-[10px] font-bold tabular-nums text-[oklch(0.85_0.16_170)]">
            {meter.db[channel] === -Infinity
              ? "−∞.−"
              : meter.db[channel].toFixed(1).padStart(4, " ")}
            <span className="text-white/30"> dB</span>
          </span>
          <div className="relative flex w-5 flex-col-reverse gap-[2px] rounded bg-black/50 p-1">
            {Array.from({ length: 14 }).map((_, segment) => {
              const lit = meter.levels[channel] * 14 > segment;
              const green = segment < 8;
              const amber = segment >= 8 && segment < 12;
              return (
                <span
                  key={segment}
                  className={cn(
                    "h-1.5 w-full rounded-[1px] transition-colors duration-75",
                    lit
                      ? green
                        ? "bg-[oklch(0.8_0.2_150)]"
                        : amber
                          ? "bg-[oklch(0.82_0.16_85)]"
                          : "bg-[oklch(0.66_0.2_25)]"
                      : "bg-white/[0.07]"
                  )}
                />
              );
            })}
            {/* peak-hold tick */}
            <span
              className="pointer-events-none absolute inset-x-1 h-[2px] bg-white/80 transition-[bottom] duration-150"
              style={{ bottom: `calc(${meter.peaks[channel] * 100}%)` }}
            />
          </div>
          <span className="font-mono text-[9px] font-bold text-white/45">{side}</span>
        </div>
        ))}
        </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Knob — pointer-draggable rotary with an accent value arc.            *
 * ------------------------------------------------------------------ */
const SWEEP_START = -135;
const SWEEP = 270;

function Knob({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  unit,
  resetValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  unit?: string;
  /** Where a double-tap lands — defaults to the centre of the sweep. */
  resetValue?: number;
}) {
  const fraction = (value - min) / (max - min);
  const angle = SWEEP_START + fraction * SWEEP;
  const dragRef = useRef<{ y: number; value: number }>({ y: 0, value: 0 });

  const clamp = useCallback(
    (next: number) => {
      const rounded = Math.round(next / step) * step;
      return Math.min(max, Math.max(min, Number(rounded.toFixed(4))));
    },
    [min, max, step]
  );

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { y: event.clientY, value };
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!(event.currentTarget as Element).hasPointerCapture(event.pointerId)) return;
    const delta = (dragRef.current.y - event.clientY) / 130;
    onChange(clamp(dragRef.current.value + delta * (max - min)));
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      onChange(clamp(value + step));
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(clamp(value - step));
    }
  };

  // Arc geometry: radius 30 on a 72 viewBox, gap at the bottom (270 sweep).
  const knobSize = 74;
  const radius = 30;
  const center = knobSize / 2;
  const rotate = SWEEP_START + (SWEEP / 2); // +0° line points straight up
  const polar = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [center + r * Math.cos(rad), center + r * Math.sin(rad)];
  };
  const arc = (fromDeg: number, toDeg: number, r: number) => {
    const [x1, y1] = polar(fromDeg, r);
    const [x2, y2] = polar(toDeg, r);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const [tipX, tipY] = polar(angle, radius - 5);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={knobSize}
        height={knobSize}
        viewBox={`0 0 ${knobSize} ${knobSize}`}
        role="slider"
        aria-label={label}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={() => onChange(clamp(resetValue ?? (min + max) / 2))}
        onKeyDown={onKey}
        onWheel={(event) => {
          event.preventDefault();
          onChange(clamp(value - Math.sign(event.deltaY) * step));
        }}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.16_170)]/60"
      >
        <defs>
          <radialGradient id={`core-${label}`} cx="50%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#232c36" />
            <stop offset="100%" stopColor="#10151c" />
          </radialGradient>
        </defs>
        {/* Case */}
        <circle cx={center} cy={center} r={radius + 5} fill="#0a0e13" />
        <circle cx={center} cy={center} r={radius + 4} fill={`url(#core-${label})`} stroke="#000" strokeOpacity={0.6} />
        {/* Track arc */}
        <path d={arc(SWEEP_START, SWEEP_START + SWEEP, radius)} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={3} strokeLinecap="round" />
        {/* Value arc */}
        {fraction > 0.001 ? (
          <path
            d={arc(SWEEP_START, angle, radius)}
            fill="none"
            stroke="oklch(0.78_0.14_170)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ) : null}
        {/* Pointer */}
        <line
          x1={center}
          y1={center}
          x2={tipX}
          y2={tipY}
          stroke="oklch(0.92_0.14_170)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <circle cx={center} cy={center} r={3} fill="rgba(255,255,255,0.35)" />
        <title>{`${label}: ${format(value)}${unit ?? ""}`}</title>
        <g transform={`rotate(${rotate} ${center} ${center})`} opacity={0.5}>
          <path d={`M ${center} ${center - radius - 2} v 4`} stroke="#fff" strokeWidth={1} />
        </g>
      </svg>
      <p className="font-mono text-[11px] font-bold tabular-nums text-[oklch(0.85_0.16_170)]">
        {format(value)}
        {unit ? <span className="text-white/40">{unit}</span> : null}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Fader strip — one vertical fader per EQ band, dB under it.           *
 * ------------------------------------------------------------------ */
function FaderStrip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const height = 152;
  const min = -12;
  const max = 12;
  const fraction = (value - min) / (max - min);
  const dragRef = useRef(false);

  const apply = (clientY: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box) return;
    const fraction = Math.min(1, Math.max(0, 1 - (clientY - box.top) / box.height));
    const rounded = Math.round((min + fraction * (max - min)) * 2) / 2;
    onChange(Number(rounded.toFixed(2)));
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragRef.current) apply(event.clientY);
    };
    const up = () => {
      dragRef.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-none flex-col items-center gap-1.5">
      <span
        className={cn(
          "font-mono text-[9px] font-bold tabular-nums",
          value > 0 ? "text-[oklch(0.85_0.16_170)]" : value < 0 ? "text-white/40" : "text-white/60"
        )}
      >
        {value > 0 ? "+" : ""}
        {value.toFixed(1)}
      </span>
      <div
        ref={trackRef}
        role="slider"
        aria-label={`${label} Hz band`}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={(event) => {
          dragRef.current = true;
          apply(event.clientY);
        }}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") onChange(Math.min(max, value + 0.5));
          if (event.key === "ArrowDown") onChange(Math.max(min, value - 0.5));
        }}
        className="relative w-8 cursor-ns-resize touch-none rounded-md bg-black/45 outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.16_170)]/50"
        style={{ height }}
      >
        {/* Graduated rail — geometry: 8px pads, 24px handle, value ↑ = dB ↑. */}
        <div className="absolute inset-x-1/2 top-2 bottom-2 w-1 -translate-x-1/2 rounded-full bg-white/10" />
        {Array.from({ length: 9 }).map((_, tick) => (
          <span
            key={tick}
            className="absolute left-1/2 h-px w-2.5 -translate-x-1/2 bg-white/15"
            style={{ top: 8 + (tick * (height - 16)) / 8 }}
          />
        ))}
        {/* Lit cap above the handle */}
        <div
          className="absolute inset-x-1/2 w-1 -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,oklch(0.78_0.15_170),oklch(0.82_0.14_160))]"
          style={{ top: 8, height: Math.max(1, fraction * (height - 16 - 24)) }}
        />
        {/* Handle */}
        <div
          className="absolute left-1/2 h-6 w-6 -translate-x-1/2 rounded-md border border-white/20 bg-[linear-gradient(180deg,#2b3541,#151b23)] shadow-[0_3px_6px_rgba(0,0,0,0.55)]"
          style={{ top: 8 + fraction * (height - 16 - 24) }}
        >
          <span className="absolute left-1/2 top-1.5 h-px w-3.5 -translate-x-1/2 bg-white/50" />
          <span className="absolute left-1/2 top-1/2 h-px w-3.5 -translate-x-1/2 bg-white/40" />
          <span className="absolute left-1/2 bottom-1.5 h-px w-3.5 -translate-x-1/2 bg-white/50" />
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase text-white/45">{label}</span>
    </div>
  );
}

function fmt(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
