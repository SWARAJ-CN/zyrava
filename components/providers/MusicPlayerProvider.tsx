"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Song } from "@/lib/saavn";
import { playPad as firePad, type PadName } from "@/lib/dj/pads";

/* ------------------------------------------------------------------ *
 * DJ rig — repeat modes, the effect-rack wet levels and the FX names. *
 * ------------------------------------------------------------------ */
export type RepeatMode = "off" | "all" | "one";

/** Master level the app opens at — deliberately quiet, so the first tap never
 *  blasts the room. Every reset returns here too. */
export const DEFAULT_VOLUME = 0.01;

export const FX_ORDER = [
  "echo",
  "reverb",
  "flanger",
  "chorus",
  "phaser",
  "drive",
  "roll",
  "stutter",
] as const;
export type FxName = (typeof FX_ORDER)[number];
export type FxLevels = Record<FxName, number>;

export const FX_LABELS: Record<FxName, string> = {
  echo: "Echo",
  reverb: "Reverb",
  flanger: "Flanger",
  chorus: "Chorus",
  phaser: "Phaser",
  drive: "Distortion",
  roll: "Beat roll",
  stutter: "Stutter",
};

/** One serial FX slot: a dry/wet crossfade pair around the effect nodes. */
interface FxStage {
  input: GainNode;
  output: GainNode;
  dry: GainNode;
  wet: GainNode;
}



/* ------------------------------------------------------------------ *
 * Equalizer — ten peaking filters wired into the Web Audio graph
 * (the full classic 31 Hz – 16 kHz octave ladder).
 * ------------------------------------------------------------------ */
export const EQ_BANDS = [
  { frequency: 31, label: "31" },
  { frequency: 62, label: "62" },
  { frequency: 125, label: "125" },
  { frequency: 250, label: "250" },
  { frequency: 500, label: "500" },
  { frequency: 1000, label: "1k" },
  { frequency: 2000, label: "2k" },
  { frequency: 4000, label: "4k" },
  { frequency: 8000, label: "8k" },
  { frequency: 16000, label: "16k" },
];

export interface EqPreset {
  label: string;
  gains: number[];
  /** Heavy-duty profiles ask before engaging — big lows want a warning. */
  heavy?: boolean;
}

/*
 * Ten-band presets — each array maps onto EQ_BANDS, low → high.
 * Values stay within ±12 dB so the sum can never clip the bus.
 */
export const EQ_PRESETS: EqPreset[] = [
  { label: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { label: "Bass boost", gains: [9, 7.5, 5, 2.5, 0, -0.5, -1, -1, 0, 0.5], heavy: true },
  { label: "Sub bass", gains: [11, 9, 4, 1, 0, 0, 0, -0.5, -1, -1.5], heavy: true },
  { label: "Vocal", gains: [-2, -2.5, -1, 1.5, 3.5, 4.5, 4, 2, 0.5, 0] },
  { label: "Acoustic", gains: [2, 3, 1.5, 0.5, 2, 1.5, 2.5, 3, 2.5, 1] },
  { label: "Treble", gains: [-1, -1.5, -2, -1, 0, 1, 2.5, 4.5, 6.5, 7.5] },
  { label: "Party", gains: [7, 6, 3, 1, -1, 0.5, 1.5, 2.5, 4.5, 5.5] },
  { label: "Soft", gains: [2.5, 1.5, 0, -2.5, -4, -1.5, 0.5, 1.5, 2.5, 3.5] },
  { label: "Rock", gains: [6, 5, 3, 0.5, -1, -0.5, 1.5, 3.5, 5, 5.5] },
  { label: "Pop", gains: [-1, 1, 3, 4, 2.5, 0, -1.5, -1, 1.5, 2] },
  { label: "Hip hop", gains: [9, 8, 2, 3, -1, -1.5, 1, 2, 3.5, 2], heavy: true },
  { label: "Dance", gains: [9, 6, 2, -0.5, 2, 3.5, 4, 2.5, 0, 0] },
  { label: "Classical", gains: [5, 4, 2.5, 0.5, -1.5, -1.5, 0, 1.5, 2.5, 4] },
  { label: "Podcast", gains: [-6, -5, -2.5, 1, 4, 5.5, 3, 1.5, -1, -3] },
  { label: "Late night", gains: [3, 2.5, 1, 0, -0.5, -1, -1.5, -0.5, 1.5, 2] },
  /*
   * Heavy-duty rigs — big speaker stacks, party PA and tourist-bus thumpers.
   * Subs sit at the ceiling of the gain range; the highs are pushed to keep
   * the whole stack audible over the road and the crowd, and the mids are
   * pulled back just enough that the low end stays clean.
   */
  {
    label: "Boom bass",
    gains: [12, 10.5, 6.5, 1.5, -2, -0.5, 0, 1, 2, 2.5],
    heavy: true,
  },
  {
    label: "Party hall PA",
    gains: [11, 9.5, 5.5, 1, -2, 0, 2, 3.5, 4.5, 5.5],
    heavy: true,
  },
  {
    label: "Tourist bus",
    gains: [12, 11.5, 8, 2.5, -2.5, -1, 0, 2, 3, 4],
    heavy: true,
  },
];

export const BASS_PRESET_LABEL = "Bass boost";

/* ------------------------------------------------------------------ *
 * Custom EQ — the user's own curve, remembered across sessions.       *
 * ------------------------------------------------------------------ */
const CUSTOM_EQ_KEY = "music-custom-eq";

function readCustomEq(): number[] {
  if (typeof window === "undefined") return [...EQ_PRESETS[0].gains];
  try {
    const raw = window.localStorage.getItem(CUSTOM_EQ_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      Array.isArray(parsed) &&
      parsed.length === EQ_BANDS.length &&
      parsed.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      return (parsed as number[]).map((value) => Math.min(12, Math.max(-12, value)));
    }
  } catch {
    /* storage can be unavailable in private mode */
  }
  return [...EQ_PRESETS[0].gains];
}

/** Immersive playback modes wired in between the EQ and the analyser. */
export type SpatialMode =
  | "off"
  | "stereo"
  | "mono"
  | "wide"
  | "8d"
  | "3d"
  | "surround"
  | "stack"
  | "pan"
  | "telephone"
  | "echo";

export const SPATIAL_MODES: Array<{ value: SpatialMode; label: string; hint: string }> = [
  { value: "off", label: "Off", hint: "Raw stream" },
  { value: "stereo", label: "Stereo", hint: "Standard two-channel" },
  { value: "mono", label: "Mono", hint: "Both channels summed" },
  { value: "wide", label: "Wide", hint: "Extra-wide stereo field" },
  { value: "8d", label: "8D", hint: "Slow orbit around your head" },
  { value: "3d", label: "3D", hint: "HRTF room feel" },
  { value: "surround", label: "Surround", hint: "Widened stereo field" },
  { value: "stack", label: "PA stack", hint: "Mono sub, stereo tops" },
  { value: "pan", label: "Auto pan", hint: "Fast ping-pong pan" },
  { value: "telephone", label: "Telephone", hint: "Restrained AM-radio band" },
  { value: "echo", label: "Echo", hint: "Warm space tail" },
];

interface MusicPlayerValue {
  queue: Song[];
  queueLabel: string;
  index: number;
  current: Song | null;
  playing: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  playerError: string | null;
  visualizerReady: boolean;
  /** Spotify-style right-side "Now playing" preview panel. */
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
  eqPreset: string;
  eqGains: number[];
  spatialMode: SpatialMode;
  getAnalyser: () => AnalyserNode | null;
  startQueue: (list: Song[], label: string, position: number) => void;
  /** Append the next batch to the running queue (deduped by track id). */
  appendQueue: (list: Song[]) => void;
  togglePlay: () => void;
  stepTrack: (direction: 1 | -1) => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  setMuted: (value: boolean) => void;
  applyPreset: (preset: EqPreset) => void;
  /** Call after a manual band move so the preset name stops claiming a curve. */
  markEqCustom: (gains: number[]) => void;
  /** Restore the saved custom curve and keep its label. */
  applyCustomPreset: () => void;
  setEqGains: (gains: number[]) => void;
  setSpatialMode: (mode: SpatialMode) => void;
  /** Studio mixer — gain, balance and tempo ride the Web Audio graph. */
  preampDb: number;
  setPreampDb: (value: number) => void;
  balance: number;
  setBalance: (value: number) => void;
  rate: number;
  setRate: (value: number) => void;
  /** Left dock — rail ⇄ wide dashboard/mixer state. */
  sidebarWide: boolean;
  setSidebarWide: (wide: boolean) => void;
  /** Dashboard telemetry: seconds heard and tracks queued this session. */
  listenedSeconds: number;
  sessionPlays: number;
  /** Live graph facts for the dashboard. */
  getGraphInfo: () => {
    webAudio: boolean;
    sampleRate: number | null;
    channels: number | null;
  };
  /** True stereo level pairs for the console's VU meters. */
  getLevels: () => [number, number];
  /** Low-cut (rumble/hiss) stage engaged. */
  loCut: boolean;
  setLoCut: (on: boolean) => void;
  /* ── DJ transport ── */
  repeat: RepeatMode;
  cycleRepeat: () => void;
  shuffle: boolean;
  toggleShuffle: () => void;
  stop: () => void;
  /** Stop, clear the queue and close the studio panels (sign-out). */
  endSession: () => void;
  jumpTo: (position: number) => void;
  /** End-fade transition length in seconds (Auto DJ hand-off). */
  crossfade: number;
  setCrossfade: (value: number) => void;
  /* ── DJ effect rack (wet levels 0..1) ── */
  fx: FxLevels;
  setFx: (patch: Partial<FxLevels>) => void;
  /** Filter sweep: −1 high-pass gate … 0 neutral … +1 low-pass fade. */
  sweep: number;
  setSweep: (value: number) => void;
  /** Dedicated sub-bass shelf ±12 dB around 55 Hz. */
  subDb: number;
  setSubDb: (value: number) => void;
  /** Bus dynamics. */
  compAmt: number;
  setCompAmt: (value: number) => void;
  limiterOn: boolean;
  setLimiterOn: (on: boolean) => void;
  loudnessOn: boolean;
  setLoudnessOn: (on: boolean) => void;
  /** One-tap party pads, synthesized straight on the audio context. */
  playPad: (name: PadName) => void;
  /** Full-screen hardware console. */
  mixerOpen: boolean;
  setMixerOpen: (open: boolean) => void;
  /** The dock as a phone-sized drawer (below the md breakpoint). */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

const MusicPlayerContext = createContext<MusicPlayerValue | null>(null);

/** Synthesized wet-noise impulse for the reverb convolver. */
function makeReverbIr(context: AudioContext, seconds = 1.4, decay = 2.6): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(seconds * rate);
  const buffer = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let sample = 0; sample < length; sample += 1) {
      data[sample] = (Math.random() * 2 - 1) * Math.pow(1 - sample / length, decay);
    }
  }
  return buffer;
}

/** Tanh transfer curve for the distortion drive (0 → clean, 1 → crushed). */
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const size = 1024;
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const drive = 1 + amount * 40;
  const norm = Math.tanh(drive);
  for (let index = 0; index < size; index += 1) {
    const x = (index / (size - 1)) * 2 - 1;
    curve[index] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/**
 * App-wide music playback.
 *
 * Lives beside the data providers (not inside /music) so the queue and the
 * <audio> element survive page navigation — switching tabs keeps the music
 * running, and Chrome's background tab continues it too. MediaSession hooks
 * hand the OS lock screen / mini-player controls.
 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueLabel, setQueueLabel] = useState("");
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [muted, setMutedState] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const [eqPreset, setEqPreset] = useState<string>("Flat");
  const [eqGains, setEqGains] = useState<number[]>(EQ_PRESETS[0].gains);
  /** The user's own ten-band curve, saved separately from the factory presets. */
  const [customEqGains, setCustomEqGains] = useState<number[]>(readCustomEq);
  const [spatialMode, setSpatialModeState] = useState<SpatialMode>("off");
  const [visualizerReady, setVisualizerReady] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpenState] = useState(false);

  /* Studio mixer values — refs mirror them so the graph reads the freshest
   * value the moment nodes are built. */
  const [preampDb, setPreampDbState] = useState(0);
  const [balance, setBalanceState] = useState(0);
  const [rate, setRateState] = useState(1);
  const preampDbRef = useRef(0);
  const balanceRef = useRef(0);
  const rateRef = useRef(1);

  /* Session telemetry for the dashboard. */
  const [listenedSeconds, setListenedSeconds] = useState(0);
  const [sessionPlays, setSessionPlays] = useState(0);
  const lastTickRef = useRef(0);

  /* DJ transport — repeat / shuffle / transition hand-off. */
  const [repeat, setRepeatState] = useState<RepeatMode>("off");
  const [shuffle, setShuffleState] = useState(false);
  const [crossfade, setCrossfadeState] = useState(0);
  const crossfadeRef = useRef(0);

  /* DJ effect rack + dynamics + sweep/sub trim. */
  const [fx, setFxState] = useState<FxLevels>({
    echo: 0,
    reverb: 0,
    flanger: 0,
    chorus: 0,
    phaser: 0,
    drive: 0,
    roll: 0,
    stutter: 0,
  });
  const [sweep, setSweepState] = useState(0);
  const [subDb, setSubDbState] = useState(0);
  const [compAmt, setCompAmtState] = useState(0);
  const [limiterOn, setLimiterOnState] = useState(false);
  const [loudnessOn, setLoudnessOnState] = useState(false);

  /* The FX rack / dynamics nodes, captured at graph build. */
  const djInRef = useRef<GainNode | null>(null);
  const djOutRef = useRef<GainNode | null>(null);
  const fxStagesRef = useRef<Map<FxName, FxStage> | null>(null);
  const subShelfRef = useRef<BiquadFilterNode | null>(null);
  const sweepLpRef = useRef<BiquadFilterNode | null>(null);
  const sweepHpRef = useRef<BiquadFilterNode | null>(null);
  const compRef = useRef<DynamicsCompressorNode | null>(null);
  const limitRef = useRef<DynamicsCompressorNode | null>(null);
  const loudLowRef = useRef<BiquadFilterNode | null>(null);
  const loudHighRef = useRef<BiquadFilterNode | null>(null);
  const padBusRef = useRef<GainNode | null>(null);
  /** Context created solely for pads when the stream graph doesn't exist yet. */
  const padContextRef = useRef<AudioContext | null>(null);
  /** Stutter amplitude node pair + the distortion shaper. */
  const stGainRef = useRef<GainNode | null>(null);
  const stDepthRef = useRef<GainNode | null>(null);
  const shaperRef = useRef<WaveShaperNode | null>(null);

  /* The left dock: rail ⇄ wide dashboard. Wide is the desktop default. */
  const [sidebarWide, setSidebarWideState] = useState(true);
  /* The full-screen hardware console. */
  const [mixerOpen, setMixerOpenState] = useState(false);
  /* The dock as a drawer below the md breakpoint. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /** Post-balance stereo meter taps for the console's VU bridge. */
  const metersRef = useRef<[AnalyserNode | null, AnalyserNode | null]>([null, null]);
  /** The node the routing currently feeds — reconnects only on real changes. */
  const routeTargetRef = useRef<AudioNode | null>(null);
  /** Low-cut stage state + mirror for the graph build. */
  const [loCut, setLoCutState] = useState(false);
  const loCutRef = useRef(false);
  /** The high-pass node for the low-cut stage in the graph. */
  const loCutNodeRef = useRef<BiquadFilterNode | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const eqGainsRef = useRef<number[]>(eqGains);
  /** Fixed entry/exit gains that the spatial FX rewire between. */
  const spaceInRef = useRef<GainNode | null>(null);
  const spaceOutRef = useRef<GainNode | null>(null);
  /** The mixer section every route passes through: gain then balance. */
  const preampNodeRef = useRef<GainNode | null>(null);
  const panNodeRef = useRef<StereoPannerNode | null>(null);
  /** Stops LFOs / disconnects the current spatial chain. */
  const spatialCleanupRef = useRef<() => void>(() => {});
  const spatialModeRef = useRef<SpatialMode>("off");
  /** Global CORS probe cache: hostname → analyser allowed. */
  const corsCacheRef = useRef<Map<string, boolean>>(new Map());
  /** The element's tap into the Web Audio graph (created at most once). */
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  // Play intent is read at track-switch time; state would force the loader
  // effect to re-run on clicks.
  const shouldPlayRef = useRef(false);
  /** Whether the side preview's first auto-open has already happened. */
  const panelShownRef = useRef(false);

  useEffect(() => {
    eqGainsRef.current = eqGains;
  }, [eqGains]);

  const current = queue[index] ?? null;

  const getAnalyser = useCallback(() => analyserRef.current, []);

  // CORS check — the analyser needs the stream to be readable from JS, and so
  // does the Web Audio path: a tainted (non-CORS) media element is downgraded
  // by Chromium. The CDN grants CORS on GET responses only — HEAD misses the
  // headers entirely — so the probe is a tiny ranged GET, matching how the
  // element itself will fetch.
  const probeCors = useCallback(async (url: string, hostname: string): Promise<boolean> => {
    const cached = corsCacheRef.current.get(hostname);
    if (cached !== undefined) return cached;
    let allowed = false;
    try {
      const response = await fetch(url, {
        mode: "cors",
        headers: { Range: "bytes=0-63" },
      });
      allowed = response.ok;
    } catch {
      allowed = false;
    }
    corsCacheRef.current.set(hostname, allowed);
    return allowed;
  }, []);



  /**
   * Rewires the spatial section between `spaceIn` and `spaceOut` for the
   * active mode the EQ feeds the section and the analyser listens after it,
   * so the wave visualiser reflects every effect.
   */
  const applySpatial = useCallback(() => {
    const context = audioContextRef.current;
    const input = spaceInRef.current;
    const output = spaceOutRef.current;
    if (!context || !input || !output) return;

    spatialCleanupRef.current();
    spatialCleanupRef.current = () => {};
    input.disconnect();

    const mode = spatialModeRef.current;
    if (mode === "off" || mode === "stereo") {
      // "Stereo" is the deliberate pass-through mode (same signal path as
      // off, minus the automatic shortcut).
      input.connect(output);
      return;
    }

    try {
      if (mode === "mono") {
        // Sum both halves into one bus; halve each so the sum can't clip.
        const splitter = context.createChannelSplitter(2);
        const sum = context.createGain();
        const halfL = context.createGain();
        const halfR = context.createGain();
        halfL.gain.value = 0.5;
        halfR.gain.value = 0.5;
        splitter.connect(halfL, 0);
        splitter.connect(halfR, 1);
        halfL.connect(sum);
        halfR.connect(sum);
        input.connect(splitter);
        sum.connect(output);
        spatialCleanupRef.current = () => {
          try {
            splitter.disconnect();
            halfL.disconnect();
            halfR.disconnect();
            sum.disconnect();
          } catch {
            // already disconnected
          }
        };
        return;
      }

      if (mode === "8d") {
        // Slow circular orbit: a sub-0.1 Hz sine breathes the stereo pan.
        const panner = context.createStereoPanner();
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.type = "sine";
        lfo.frequency.value = 0.08;
        depth.gain.value = 0.95;
        lfo.connect(depth);
        depth.connect(panner.pan);
        input.connect(panner);
        panner.connect(output);
        lfo.start();
        spatialCleanupRef.current = () => {
          try {
            lfo.stop();
            lfo.disconnect();
            depth.disconnect();
            panner.disconnect();
          } catch {
            // already stopped
          }
        };
        return;
      }

      if (mode === "3d") {
        // HRTF binaural placement with a gentle lateral drift.
        const panner = context.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 0.5;
        panner.rolloffFactor = 0.4;
        panner.positionZ.value = -0.9;
        panner.positionY.value = -0.1;
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.type = "sine";
        lfo.frequency.value = 0.05;
        depth.gain.value = 1.8;
        lfo.connect(depth);
        depth.connect(panner.positionX);
        input.connect(panner);
        panner.connect(output);
        lfo.start();
        spatialCleanupRef.current = () => {
          try {
            lfo.stop();
            lfo.disconnect();
            depth.disconnect();
            panner.disconnect();
          } catch {
            // already stopped
          }
        };
        return;
      }

      if (mode === "stack") {
        // PA stack topology: everything below ~130 Hz is summed to one mono
        // sub bus (speakers can hold their phase), while the tops keep the
        // original stereo sides.
        const splitter = context.createChannelSplitter(2);
        const merger = context.createChannelMerger(2);
        const subL = context.createGain();
        const subR = context.createGain();
        const subSum = context.createGain();
        const subLow = context.createBiquadFilter();
        const topL = context.createGain();
        const topR = context.createGain();
        subL.gain.value = 0.5;
        subR.gain.value = 0.5;
        subLow.type = "lowpass";
        subLow.frequency.value = 130;
        subLow.Q.value = 0.7;
        topL.gain.value = 0.95;
        topR.gain.value = 0.95;
        splitter.connect(subL, 0);
        splitter.connect(subR, 1);
        subL.connect(subSum);
        subR.connect(subSum);
        subSum.connect(subLow);
        subLow.connect(merger, 0, 0);
        subLow.connect(merger, 0, 1);
        splitter.connect(topL, 0);
        splitter.connect(topR, 1);
        topL.connect(merger, 0, 0);
        topR.connect(merger, 0, 1);
        input.connect(splitter);
        merger.connect(output);
        spatialCleanupRef.current = () => {
          try {
            splitter.disconnect();
            merger.disconnect();
            subL.disconnect();
            subR.disconnect();
            subSum.disconnect();
            subLow.disconnect();
            topL.disconnect();
            topR.disconnect();
          } catch {
            // already disconnected
          }
        };
        return;
      }

      if (mode === "wide") {
        // Mid/side expander: each ear hears its own channel reinforced by a
        // phase-inverted sliver of the opposite one. Gains stay under unity
        // in sum so the widened signal cannot clip.
        const splitter = context.createChannelSplitter(2);
        const merger = context.createChannelMerger(2);
        const straightL = context.createGain();
        const straightR = context.createGain();
        const crossL = context.createGain();
        const crossR = context.createGain();
        straightL.gain.value = 0.85;
        straightR.gain.value = 0.85;
        crossL.gain.value = -0.45;
        crossR.gain.value = -0.45;
        splitter.connect(straightL, 0);
        splitter.connect(crossR, 0);
        splitter.connect(straightR, 1);
        splitter.connect(crossL, 1);
        straightL.connect(merger, 0, 0);
        crossL.connect(merger, 0, 0);
        crossR.connect(merger, 0, 1);
        straightR.connect(merger, 0, 1);
        input.connect(splitter);
        merger.connect(output);
        spatialCleanupRef.current = () => {
          try {
            splitter.disconnect();
            merger.disconnect();
            straightL.disconnect();
            straightR.disconnect();
            crossL.disconnect();
            crossR.disconnect();
          } catch {
            // already disconnected
          }
        };
        return;
      }

      if (mode === "pan") {
        // Fast ping-pong: the stereo axis swings quicker and shallower than
        // 8D — audible motion without the full orbit.
        const panner = context.createStereoPanner();
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.type = "sine";
        lfo.frequency.value = 0.45;
        depth.gain.value = 0.7;
        lfo.connect(depth);
        depth.connect(panner.pan);
        input.connect(panner);
        panner.connect(output);
        lfo.start();
        spatialCleanupRef.current = () => {
          try {
            lfo.stop();
            lfo.disconnect();
            depth.disconnect();
            panner.disconnect();
          } catch {
            // already stopped
          }
        };
        return;
      }

      if (mode === "telephone") {
        // Band-limited to the voice range — the classic AM-radio filter.
        const band = context.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 1400;
        band.Q.value = 1.1;
        const level = context.createGain();
        level.gain.value = 1.6;
        input.connect(band);
        band.connect(level);
        level.connect(output);
        spatialCleanupRef.current = () => {
          try {
            band.disconnect();
            level.disconnect();
          } catch {
            // already disconnected
          }
        };
        return;
      }

      if (mode === "echo") {
        // A short warm tail: dry signal stays up front, a low-passed feedback
        // delay sits just behind it.
        const dry = context.createGain();
        dry.gain.value = 0.85;
        const delay = context.createDelay(1.2);
        delay.delayTime.value = 0.32;
        const damp = context.createBiquadFilter();
        damp.type = "lowpass";
        damp.frequency.value = 3200;
        const feedback = context.createGain();
        feedback.gain.value = 0.38;
        const wet = context.createGain();
        wet.gain.value = 0.5;
        input.connect(dry);
        dry.connect(output);
        input.connect(delay);
        delay.connect(damp);
        damp.connect(feedback);
        feedback.connect(delay);
        damp.connect(wet);
        wet.connect(output);
        spatialCleanupRef.current = () => {
          try {
            dry.disconnect();
            delay.disconnect();
            damp.disconnect();
            feedback.disconnect();
            wet.disconnect();
          } catch {
            // already disconnected
          }
        };
        return;
      }

      // Surround: cross-bled Haas widener — each side hears a slightly
      // delayed ghost of the other, doubling the perceived stage width.
      const splitter = context.createChannelSplitter(2);
      const merger = context.createChannelMerger(2);
      const bleedDelay = context.createDelay(0.05);
      bleedDelay.delayTime.value = 0.018;
      const bleedGain = context.createGain();
      bleedGain.gain.value = 0.55;

      input.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 1, 1);
      splitter.connect(bleedDelay, 0);
      bleedDelay.connect(bleedGain);
      bleedGain.connect(merger, 0, 1);
      merger.connect(output);
      spatialCleanupRef.current = () => {
        try {
          splitter.disconnect();
          bleedDelay.disconnect();
          bleedGain.disconnect();
          merger.disconnect();
        } catch {
          // already disconnected
        }
      };
    } catch {
      // Node types unavailable — stay silent-equivalent (direct).
      input.connect(output);
    }
  }, []);

  /**
   * Parameter worker for the whole DJ rack: wet/dry crossfades, distortion
   * curve, sweep filters, sub shelf, stutter depth and the dynamics section.
   * Everything is set in place on existing nodes — zero rewiring, zero clicks.
   */
  const applyFX = useCallback(() => {
    const stages = fxStagesRef.current;
    if (stages) {
      FX_ORDER.forEach((name) => {
        const stage = stages.get(name);
        if (!stage) return;
        const wet = Math.min(1, Math.max(0, fx[name]));
        stage.dry.gain.value = 1 - wet * 0.85;
        stage.wet.gain.value = wet;
      });
    }
    if (shaperRef.current) shaperRef.current.curve = driveCurve(fx.drive);
    if (sweepLpRef.current && sweepHpRef.current) {
      const lp = sweepLpRef.current;
      const hp = sweepHpRef.current;
      if (sweep <= 0) {
        // Negative: high-pass gate closing toward 3 kHz.
        lp.frequency.value = 20000;
        hp.frequency.value = 20 + Math.pow(-sweep, 1.6) * 3000;
      } else {
        // Positive: low-pass fade sliding down to 300 Hz.
        hp.frequency.value = 20;
        lp.frequency.value = Math.max(300, 20000 * Math.pow(0.015, sweep));
      }
    }
    if (subShelfRef.current) subShelfRef.current.gain.value = subDb;
    if (stGainRef.current && stDepthRef.current) {
      const depth = Math.min(0.5, fx.stutter * 0.45);
      stGainRef.current.gain.value = 1 - depth;
      stDepthRef.current.gain.value = depth;
    }
    if (compRef.current) {
      if (compAmt <= 0) {
        compRef.current.threshold.value = 0;
        compRef.current.ratio.value = 1;
        compRef.current.knee.value = 30;
      } else {
        compRef.current.threshold.value = -2 - 36 * compAmt;
        compRef.current.ratio.value = 1 + 11 * compAmt;
        compRef.current.knee.value = 8;
        compRef.current.attack.value = 0.004;
        compRef.current.release.value = 0.18;
      }
    }
    if (limitRef.current) {
      if (!limiterOn) {
        limitRef.current.threshold.value = 0;
        limitRef.current.ratio.value = 1;
        limitRef.current.knee.value = 30;
      } else {
        limitRef.current.threshold.value = -2;
        limitRef.current.ratio.value = 20;
        limitRef.current.knee.value = 0;
        limitRef.current.attack.value = 0.001;
        limitRef.current.release.value = 0.07;
      }
    }
    if (loudLowRef.current) loudLowRef.current.gain.value = loudnessOn ? 4 : 0;
    if (loudHighRef.current) loudHighRef.current.gain.value = loudnessOn ? 2.5 : 0;
  }, [fx, sweep, subDb, compAmt, limiterOn, loudnessOn]);

  // Run the rack parameters whenever any DJ control moves (and once after
  // the graph is built — applyFX() also runs inside ensureGraph).
  useEffect(() => {
    applyFX();
  }, [applyFX]);

  /**
   * Routes the mixer head's low-cut output between the untouched straight
   * line and the effects chain (EQ → spatial). The connection is only
   * re-wired when the route *type* actually changes — dragging EQ faders
   * updates filter gain values in place without touching the wiring, which
   * keeps the signal click-free (a bare disconnect() mid-buffer breaks audio).
   * The meter tap is attached off the balance stage permanently.
   */
  const applyRouting = useCallback(() => {
    const context = audioContextRef.current;
    const head = loCutNodeRef.current;
    if (!context || !head) return;
    const eqOn = filtersRef.current.length > 0 && eqGainsRef.current.some((gain) => gain !== 0);
    const spaceOn =
      spatialModeRef.current !== "off" && spatialModeRef.current !== "stereo";
    const target: AudioNode =
      eqOn || spaceOn
        ? filtersRef.current[0] ?? djInRef.current ?? context.destination
        : djInRef.current ?? context.destination;
    if (routeTargetRef.current === target) return; // unchanged route — no rewiring, no click
    if (routeTargetRef.current) {
      try {
        head.disconnect(routeTargetRef.current);
      } catch {
        // already detached
      }
    }
    try {
      head.connect(target);
      routeTargetRef.current = target;
    } catch {
      // routing unavailable
    }
  }, []);

  /**
   * Wires the audio graph exactly once: source → analyser tap + the mixer
   * head (gain pre-amp → balance), which either drains straight into the
   * speakers or through the effect chain (EQ → spatial → output). Creating a
   * MediaElementSource twice throws, so this is guarded by the context ref.
   */
  const ensureGraph = useCallback((): AnalyserNode | null => {
    const audio = audioRef.current;
    if (!audio || audioContextRef.current) return analyserRef.current;
    const Context = window.AudioContext ?? (
      window as unknown as { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext;
    if (!Context) return null;
    try {
      const context = new Context();
      const source = context.createMediaElementSource(audio);
      /* Mixer head — gain pre-amp → balance → low-cut → routed output. */
      const preamp = context.createGain();
      preamp.gain.value = Math.pow(10, preampDbRef.current / 20);
      const panNode = context.createStereoPanner();
      panNode.pan.value = balanceRef.current;
      const loCutNode = context.createBiquadFilter();
      loCutNode.type = "highpass";
      loCutNode.frequency.value = loCutRef.current ? 40 : 4; // 4 Hz ≡ transparent
      source.connect(preamp);
      preamp.connect(panNode);
      panNode.connect(loCutNode);
      const filters = EQ_BANDS.map((band, bandIndex) => {
        const filter = context.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = band.frequency;
        filter.Q.value = 1;
        filter.gain.value = eqGainsRef.current[bandIndex];
        return filter;
      });
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const spaceIn = context.createGain();
      const spaceOut = context.createGain();

      // Effects chain: filters → spatial section → speakers.
      let node: AudioNode = filters[0];
      for (let filterIndex = 1; filterIndex < filters.length; filterIndex += 1) {
        node.connect(filters[filterIndex]);
        node = filters[filterIndex];
      }
      node.connect(spaceIn);

      /* ── DJ rack — the master bus every route drains into. ── */
      const djIn = context.createGain();
      const djOut = context.createGain();
      djOut.gain.value = 1;

      const subShelf = context.createBiquadFilter();
      subShelf.type = "lowshelf";
      subShelf.frequency.value = 55;
      subShelf.gain.value = 0; // applyFX() hot-loads the saved value below.

      const sweepLp = context.createBiquadFilter();
      sweepLp.type = "lowpass";
      sweepLp.frequency.value = 20000;
      sweepLp.Q.value = 0.71;
      const sweepHp = context.createBiquadFilter();
      sweepHp.type = "highpass";
      sweepHp.frequency.value = 20;
      sweepHp.Q.value = 0.71;

      const comp = context.createDynamicsCompressor();
      const limit = context.createDynamicsCompressor();
      const loudLow = context.createBiquadFilter();
      loudLow.type = "lowshelf";
      loudLow.frequency.value = 100;
      const loudHigh = context.createBiquadFilter();
      loudHigh.type = "highshelf";
      loudHigh.frequency.value = 11000;

      const mkStage = (): FxStage => {
        const stageInput = context.createGain();
        const stageOutput = context.createGain();
        const dry = context.createGain();
        const wet = context.createGain();
        dry.gain.value = 1;
        wet.gain.value = 0;
        stageInput.connect(dry);
        dry.connect(stageOutput);
        wet.connect(stageOutput);
        return { input: stageInput, output: stageOutput, dry, wet };
      };
      /* Effects land on stage.wet — one crossfade per slot. */
      const stages = new Map<FxName, FxStage>();
      (
        ["echo", "reverb", "flanger", "chorus", "phaser", "drive", "roll"] as const
      ).forEach((name) => {
        stages.set(name, mkStage());
      });

      // Echo: 1/8-ish delay with a dark feedback tail.
      const echoDelay = context.createDelay(1.5);
      echoDelay.delayTime.value = 0.31;
      const echoFb = context.createGain();
      echoFb.gain.value = 0.42;
      echoDelay.connect(echoFb);
      echoFb.connect(echoDelay);
      stages.get("echo")!.input.connect(echoDelay);
      echoDelay.connect(stages.get("echo")!.wet);

      // Reverb: convolver on a synthesized decaying-noise impulse.
      const convolver = context.createConvolver();
      convolver.buffer = makeReverbIr(context);
      stages.get("reverb")!.input.connect(convolver);
      convolver.connect(stages.get("reverb")!.wet);

      // Flanger: 3 ms delay, slow LFO on the delay time, feedback loop.
      const flDelay = context.createDelay(0.05);
      flDelay.delayTime.value = 0.003;
      const flFb = context.createGain();
      flFb.gain.value = 0.5;
      flDelay.connect(flFb);
      flFb.connect(flDelay);
      const flLfo = context.createOscillator();
      flLfo.frequency.value = 0.16;
      const flDepth = context.createGain();
      flDepth.gain.value = 0.0022;
      flLfo.connect(flDepth);
      flDepth.connect(flDelay.delayTime);
      stages.get("flanger")!.input.connect(flDelay);
      flDelay.connect(stages.get("flanger")!.wet);
      flLfo.start();

      // Chorus: two modulated detune delays merged.
      const chorusWet = context.createGain();
      (
        [
          [0.017, 0.48, 0.005],
          [0.026, 0.34, 0.0065],
        ] as Array<[number, number, number]>
      ).forEach(([time, lfoRate, depth]) => {
        const delay = context.createDelay(0.05);
        delay.delayTime.value = time;
        const lfo = context.createOscillator();
        lfo.frequency.value = lfoRate;
        const chorusDepth = context.createGain();
        chorusDepth.gain.value = depth;
        lfo.connect(chorusDepth);
        chorusDepth.connect(delay.delayTime);
        stages.get("chorus")!.input.connect(delay);
        delay.connect(chorusWet);
        lfo.start();
      });
      chorusWet.connect(stages.get("chorus")!.wet);

      // Phaser: four all-pass stages, their corner frequencies swept.
      const phLfo = context.createOscillator();
      phLfo.frequency.value = 0.3;
      const phDepth = context.createGain();
      phDepth.gain.value = 520;
      phLfo.connect(phDepth);
      let phNode: AudioNode = stages.get("phaser")!.input;
      [280, 740, 1700, 2800].forEach((freq) => {
        const allPass = context.createBiquadFilter();
        allPass.type = "allpass";
        allPass.frequency.value = freq;
        allPass.Q.value = 1.4;
        phDepth.connect(allPass.frequency);
        phNode.connect(allPass);
        phNode = allPass;
      });
      phNode.connect(stages.get("phaser")!.wet);
      phLfo.start();

      // Distortion: tanh waveshaper; the drive follows the wet level.
      const shaper = context.createWaveShaper();
      shaper.curve = driveCurve(0);
      stages.get("drive")!.input.connect(shaper);
      shaper.connect(stages.get("drive")!.wet);

      // Beat roll: a short repeating delay — 1/16 at ~90 BPM.
      const rollDelay = context.createDelay(1);
      rollDelay.delayTime.value = 0.166;
      const rollFb = context.createGain();
      rollFb.gain.value = 0.92;
      rollDelay.connect(rollFb);
      rollFb.connect(rollDelay);
      stages.get("roll")!.input.connect(rollDelay);
      rollDelay.connect(stages.get("roll")!.wet);

      // Stutter: square-LFO amplitude chop in the main path (0 = transparent).
      const stGain = context.createGain();
      stGain.gain.value = 1;
      const stLfo = context.createOscillator();
      stLfo.type = "square";
      stLfo.frequency.value = 3.4;
      const stDepth = context.createGain();
      stDepth.gain.value = 0;
      stLfo.connect(stDepth);
      stDepth.connect(stGain.gain);
      stLfo.start();

      /* Serial power chain: djIn → sub → sweep → FX slots → stutter →
         dynamics → loudness shelf → djOut. */
      let chain: AudioNode = djIn;
      const link = (node: AudioNode) => {
        chain.connect(node);
        chain = node;
      };
      link(subShelf);
      link(sweepLp);
      link(sweepHp);
      (
        ["echo", "reverb", "flanger", "chorus", "phaser", "drive", "roll"] as const
      ).forEach((name) => {
        const stage = stages.get(name)!;
        link(stage.input);
        link(stage.output);
      });
      link(stGain);
      link(comp);
      link(limit);
      link(loudLow);
      link(loudHigh);
      link(djOut);
      chain.connect(context.destination);
      spaceOut.connect(djIn);

      // Pads fire on this bus so effects never colour the one-tap sounds.
      const padBus = context.createGain();
      padBus.gain.value = 0.9;
      padBus.connect(context.destination);
      padBusRef.current = padBus;

      // The analyser is a parallel tap off the source, so the wave mirrors
      // what reaches the ear whether or not any effect is engaged.
      source.connect(analyser);

      // Stereo meter bridge: post-balance left / right RMS pair for the
      // console's VU meters — fan-out off the balance stage.
      const meterSplit = context.createChannelSplitter(2);
      const meterL = context.createAnalyser();
      const meterR = context.createAnalyser();
      meterL.fftSize = 1024;
      meterR.fftSize = 1024;
      meterL.smoothingTimeConstant = 0;
      meterR.smoothingTimeConstant = 0;
      panNode.connect(meterSplit);
      meterSplit.connect(meterL, 0);
      meterSplit.connect(meterR, 1);
      metersRef.current = [meterL, meterR];

      audioContextRef.current = context;
      sourceRef.current = source;
      preampNodeRef.current = preamp;
      panNodeRef.current = panNode;
      loCutNodeRef.current = loCutNode;
      djInRef.current = djIn;
      djOutRef.current = djOut;
      fxStagesRef.current = stages;
      subShelfRef.current = subShelf;
      sweepLpRef.current = sweepLp;
      sweepHpRef.current = sweepHp;
      compRef.current = comp;
      limitRef.current = limit;
      loudLowRef.current = loudLow;
      loudHighRef.current = loudHigh;
      stGainRef.current = stGain;
      stDepthRef.current = stDepth;
      shaperRef.current = shaper;
      applyFX();
      filtersRef.current = filters;
      analyserRef.current = analyser;
      spaceInRef.current = spaceIn;
      spaceOutRef.current = spaceOut;
      applySpatial();
      applyRouting();
      return analyser;
    } catch {
      analyserRef.current = null;
      return null;
    }
  }, [applySpatial, applyRouting, applyFX]);


  // Apply EQ changes live and re-route: everything back at zero frees the
  // signal from the filter chain entirely.
  useEffect(() => {
    eqGainsRef.current = eqGains;
    filtersRef.current.forEach((filter, filterIndex) => {
      filter.gain.value = eqGains[filterIndex];
    });
    applyRouting();
  }, [eqGains, applyRouting]);

  // Load a fresh stream whenever the active track changes. The play path is
  // async because the analyser needs a CORS check on the stream host first.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    let cancelled = false;

    setProgress(0);
    setDuration(current.duration || 0);
    setPlayerError(null);

    const startStream = async () => {
      let hostname = "";
      try {
        hostname = new URL(current.streamUrl).hostname;
      } catch {
        // Unusual but possible; treat as non-analyserable.
      }
      const cors = hostname ? await probeCors(current.streamUrl, hostname) : false;
      if (cancelled) return;

      if (cors) {
        // The analyser — and, in Chromium, audibility through Web Audio —
        // only works with crossorigin="anonymous" on the element.
        audio.crossOrigin = "anonymous";
        setVisualizerReady(Boolean(ensureGraph()));
      } else {
        audio.removeAttribute("crossorigin");
        // Without CORS the graph is skipped: a tainted Web Audio tap degrades
        // or silences the stream, so the element plays natively and the wave
        // falls back to its CSS mimic.
        setVisualizerReady(false);
      }
      audio.src = current.streamUrl;
      audio.playbackRate = rateRef.current;
      audio.load();
      if (shouldPlayRef.current) {
        audioContextRef.current?.resume().catch(() => {});
        // Fresh track: the crossfade envelope starts wide open.
        if (djOutRef.current) djOutRef.current.gain.value = 1;
        audio.play().catch(() => {
          setPlayerError("Streaming was interrupted — press play to retry.");
          setPlaying(false);
        });
      }
    };

    void startStream();
    return () => {
      cancelled = true;
    };
    // The track id is the real trigger; `shouldPlayRef` is consumed above at
    // switch time and re-running on its change would restart finished tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Keep the element's volume/mute in sync with the controls.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
  }, [volume, muted]);

  // Mixer head values ride along live — the nodes already sit in the path.
  useEffect(() => {
    const node = preampNodeRef.current;
    if (node) node.gain.value = Math.pow(10, preampDb / 20);
  }, [preampDb]);

  useEffect(() => {
    const node = panNodeRef.current;
    if (node) node.pan.value = balance;
  }, [balance]);

  // Low-cut stage: 40 Hz engaged, 4 Hz bypassed — retuning the same node
  // avoids any rewiring, so toggling is click-free too.
  useEffect(() => {
    loCutRef.current = loCut;
    const node = loCutNodeRef.current;
    if (node) node.frequency.value = loCut ? 40 : 4;
  }, [loCut]);

  // Tempo: pitch-true time stretch on the media element.
  useEffect(() => {
    rateRef.current = rate;
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate]);

  /**
   * Time tick handler — tracks listening seconds for the dashboard while the
   * progress state the seek bar consumes keeps updating as before.
   */
  const handleTimeUpdate = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
    const time = event.currentTarget.currentTime;
    setProgress(time);
    // Lock-screen and notification controls need a position to render, and an
    // OS that sees a stalled one is quicker to reclaim the playback session.
    if ("mediaSession" in navigator) {
      const duration = event.currentTarget.duration;
      if (duration && Number.isFinite(duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            position: Math.min(time, duration),
            playbackRate: event.currentTarget.playbackRate,
          });
        } catch {
          /* A seek in flight can leave the pair briefly inconsistent. */
        }
      }
    }
    const last = lastTickRef.current;
    // Only count genuine forward plays; big jumps (seeks) don't count.
    if (time > last && time - last < 5) {
      setListenedSeconds((seconds) => seconds + (time - last));
    }
    lastTickRef.current = time;
    // Auto DJ hand-off: the master envelope glides down over the final
    // crossfade seconds, then rides back up through the next track's start.
    const djOut = djOutRef.current;
    if (djOut) {
      const length = event.currentTarget.duration;
      const fade = crossfadeRef.current;
      if (length && Number.isFinite(length) && fade > 0 && length - time < fade) {
        djOut.gain.value = Math.max(0, (length - time) / fade);
      } else {
        djOut.gain.value = 1;
      }
    }
  }, []);

  // Release the audio graph when the provider unmounts (page teardown).
  useEffect(
    () => () => {
      spatialCleanupRef.current();
      analyserRef.current = null;
      filtersRef.current = [];
      sourceRef.current = null;
      preampNodeRef.current = null;
      panNodeRef.current = null;
      loCutNodeRef.current = null;
      routeTargetRef.current = null;
      djInRef.current = null;
      djOutRef.current = null;
      fxStagesRef.current = null;
      subShelfRef.current = null;
      sweepLpRef.current = null;
      sweepHpRef.current = null;
      compRef.current = null;
      limitRef.current = null;
      loudLowRef.current = null;
      loudHighRef.current = null;
      stGainRef.current = null;
      stDepthRef.current = null;
      shaperRef.current = null;
      metersRef.current = [null, null];
      spaceInRef.current = null;
      spaceOutRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      void padContextRef.current?.close();
      padContextRef.current = null;
      padBusRef.current = null;
    },
    []
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      shouldPlayRef.current = true;
      audioContextRef.current?.resume().catch(() => {});
      audio.play().catch(() => {
        setPlayerError("This track could not be streamed — try the next one.");
        setPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [current]);

  const startQueue = useCallback(
    (list: Song[], label: string, position: number) => {
      const track = list[position];
      if (!track) return;
      // Pressing the tile that is already active toggles playback.
      if (queue[index]?.id === track.id) {
        togglePlay();
        return;
      }
      shouldPlayRef.current = true;
      setQueue(list);
      setQueueLabel(label);
      setIndex(position);
      setSessionPlays((plays) => plays + 1);
      // The first play slides the side preview in — after that the user owns
      // the panel's visibility.
      if (!panelShownRef.current) {
        panelShownRef.current = true;
        setNowPlayingOpenState(true);
      }
    },
    [queue, index, togglePlay]
  );

  const setNowPlayingOpen = useCallback((open: boolean) => {
    setNowPlayingOpenState(open);
  }, []);

  /** Grow the running queue without disturbing what is playing — tracks that
   *  are already queued are skipped, so a repeated page can never double up. */
  const appendQueue = useCallback((list: Song[]) => {
    if (!list.length) return;
    setQueue((previous) => {
      const held = new Set(previous.map((song) => song.id));
      const fresh = list.filter((song) => !held.has(song.id));
      return fresh.length ? [...previous, ...fresh] : previous;
    });
  }, []);

  const setPreampDb = useCallback((value: number) => {
    setPreampDbState(value);
  }, []);

  const setBalance = useCallback((value: number) => {
    setBalanceState(value);
  }, []);

  const setRate = useCallback((value: number) => {
    setRateState(value);
  }, []);

  const setSidebarWide = useCallback((wide: boolean) => {
    setSidebarWideState(wide);
  }, []);

  /** Live graph facts — the dashboard reads these on render. */
  const getGraphInfo = useCallback(() => {
    const context = audioContextRef.current;
    return {
      webAudio: context !== null,
      sampleRate: context?.sampleRate ?? null,
      channels: context?.destination.channelCount ?? null,
    };
  }, []);

  /** Stereo RMS pair from the meter taps (0 → silence, ~1 → full swing). */
  const getLevels = useCallback((): [number, number] => {
    return metersRef.current.map((meter) => {
      if (!meter) return 0;
      const buffer = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) sum += sample * sample;
      return Math.sqrt(sum / buffer.length);
    }) as [number, number];
  }, []);

  const setMixerOpen = useCallback((open: boolean) => {
    setMixerOpenState(open);
  }, []);

  const setLoCut = useCallback((on: boolean) => {
    setLoCutState(on);
  }, []);

  /* ── DJ transport ── */
  const cycleRepeat = useCallback(() => {
    setRepeatState((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffleState((on) => !on);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    shouldPlayRef.current = false;
    audio.pause();
    audio.currentTime = 0;
    setProgress(0);
    if (djOutRef.current) djOutRef.current.gain.value = 1;
  }, []);

  const endSession = useCallback(() => {
    stop();
    shouldPlayRef.current = false;
    setQueue([]);
    setQueueLabel("");
    setIndex(-1);
    setDuration(0);
    setProgress(0);
    setPlaying(false);
    setNowPlayingOpenState(false);
    setMixerOpenState(false);
  }, [stop]);

  const jumpTo = useCallback(
    (position: number) => {
      if (!queue[position]) return;
      shouldPlayRef.current = true;
      setIndex(position);
      setSessionPlays((plays) => plays + 1);
    },
    [queue]
  );

  const setCrossfade = useCallback((value: number) => {
    crossfadeRef.current = value;
    setCrossfadeState(value);
  }, []);

  /** One-tap party pad — synthesized straight on the audio context. */
  const playPad = useCallback((name: PadName) => {
    let context = audioContextRef.current;
    if (!context) {
      if (!padContextRef.current) {
        const Ctor = window.AudioContext ?? (
          window as unknown as { webkitAudioContext?: typeof AudioContext }
        ).webkitAudioContext;
        if (!Ctor) return;
        padContextRef.current = new Ctor();
      }
      context = padContextRef.current;
    }
    let bus = padBusRef.current;
    if (!bus) {
      bus = context.createGain();
      bus.gain.value = 0.9;
      bus.connect(context.destination);
      padBusRef.current = bus;
    }
    void context.resume().catch(() => {});
    firePad(context, bus, name);
  }, []);

  const setFx = useCallback((patch: Partial<FxLevels>) => {
    setFxState((levels) => ({ ...levels, ...patch }));
  }, []);

  const setSweep = useCallback((value: number) => {
    setSweepState(Math.min(1, Math.max(-1, Math.round(value * 100) / 100)));
  }, []);

  const setSubDb = useCallback((value: number) => {
    setSubDbState(value);
  }, []);

  const setCompAmt = useCallback((value: number) => {
    setCompAmtState(value);
  }, []);

  const setLimiterOn = useCallback((on: boolean) => {
    setLimiterOnState(on);
  }, []);

  const setLoudnessOn = useCallback((on: boolean) => {
    setLoudnessOnState(on);
  }, []);

  const stepTrack = useCallback(
    (direction: 1 | -1) => {
      if (index < 0) return;
      const audio = audioRef.current;
      // The first "previous" within the opening seconds restarts the track.
      if (direction === -1 && audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
      const next = index + direction;
      if (next < 0) {
        if (audio) audio.currentTime = 0;
        return;
      }
      // Shuffle picks a random other track; advance wraps the queue so a long
      // listening session never dead-ends.
      if (shuffle && queue.length > 1) {
        shouldPlayRef.current = true;
        let random = index;
        while (random === index) random = Math.floor(Math.random() * queue.length);
        setIndex(random);
        return;
      }
      shouldPlayRef.current = true;
      setIndex(next >= queue.length ? 0 : next);
    },
    [index, queue, shuffle]
  );

  /** Track end: repeat-one restarts in place; otherwise the queue advances
   * (random pick under shuffle) and never dead-ends. */
  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (repeat === "one") {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
      return;
    }
    if (shuffle && queue.length > 1) {
      let random = index;
      while (random === index) random = Math.floor(Math.random() * queue.length);
      shouldPlayRef.current = true;
      setIndex(random);
      return;
    }
    shouldPlayRef.current = true;
    setIndex(index + 1 >= queue.length ? 0 : index + 1);
  }, [current, repeat, shuffle, queue, index]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setProgress(seconds);
    if (djOutRef.current) djOutRef.current.gain.value = 1;
  }, []);



  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    setMutedState(false);
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
  }, []);

  const applyPreset = useCallback((preset: EqPreset) => {
    setEqPreset(preset.label);
    setEqGains([...preset.gains]);
  }, []);

  const markEqCustom = useCallback((gains: number[]) => {
    setCustomEqGains([...gains]);
    setEqPreset("Custom");
    try {
      window.localStorage.setItem(CUSTOM_EQ_KEY, JSON.stringify(gains));
    } catch {
      /* storage can be unavailable in private mode */
    }
  }, []);

  const applyCustomPreset = useCallback(() => {
    setEqPreset("Custom");
    setEqGains([...customEqGains]);
  }, [customEqGains]);

  const setSpatialMode = useCallback((mode: SpatialMode) => {
      spatialModeRef.current = mode;
      setSpatialModeState(mode);
      applySpatial();
      applyRouting();
    },
    [applySpatial, applyRouting]
  );

  // OS media controls: lock screen, notification shade and hardware keys keep
  // working with the tab in the background — the music keeps playing there.
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album || undefined,
        artwork: current.imageLarge
          ? [{ src: current.imageLarge, sizes: "500x500", type: "image/jpeg" }]
          : [],
      });
      navigator.mediaSession.setActionHandler("play", () => togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => togglePlay());
      navigator.mediaSession.setActionHandler("nexttrack", () => stepTrack(1));
      navigator.mediaSession.setActionHandler("previoustrack", () => stepTrack(-1));
    } catch {
      // MediaSession is progressive enhancement only.
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
      } catch {
        // ignore
      }
    };
  }, [current, togglePlay, stepTrack]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }
  }, [playing]);

  /*
   * Locking the phone suspends the AudioContext, and nothing here brought it
   * back: the element keeps decoding while the Web Audio chain stays silent, so
   * the song sounds like it stopped. Resume the context whenever the browser
   * pulls it out from under a playing track.
   */
  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    const revive = () => {
      // iOS reports a non-standard "interrupted" state, so anything short of
      // "running" while audio is playing needs the same treatment.
      if (context.state !== "running" && !audioRef.current?.paused) {
        void context.resume().catch(() => {});
      }
    };
    context.addEventListener("statechange", revive);
    const onVisible = () => {
      if (!document.hidden) revive();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      context.removeEventListener("statechange", revive);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [visualizerReady, current]);

  const value = useMemo<MusicPlayerValue>(
    () => ({
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
      eqPreset,
      eqGains,
      getAnalyser,
      startQueue,
      appendQueue,
      togglePlay,
      stepTrack,
      seek,
      setVolume,
      setMuted,
      applyPreset,
      markEqCustom,
      applyCustomPreset,
      setEqGains,
      spatialMode,
      setSpatialMode,
      preampDb,
      setPreampDb,
      balance,
      setBalance,
      rate,
      setRate,
      sidebarWide,
      setSidebarWide,
      listenedSeconds,
      sessionPlays,
      getGraphInfo,
      getLevels,
      loCut,
      setLoCut,
      repeat,
      cycleRepeat,
      shuffle,
      toggleShuffle,
      stop,
      endSession,
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
      mixerOpen,
      setMixerOpen,
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [
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
      eqPreset,
      eqGains,
      getAnalyser,
      startQueue,
      appendQueue,
      togglePlay,
      stepTrack,
      seek,
      setVolume,
      setMuted,
      applyPreset,
      markEqCustom,
      applyCustomPreset,
      setEqGains,
      spatialMode,
      setSpatialMode,
      preampDb,
      setPreampDb,
      balance,
      setBalance,
      rate,
      setRate,
      sidebarWide,
      setSidebarWide,
      listenedSeconds,
      sessionPlays,
      getGraphInfo,
      getLevels,
      loCut,
      setLoCut,
      repeat,
      cycleRepeat,
      shuffle,
      toggleShuffle,
      stop,
      endSession,
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
      mixerOpen,
      setMixerOpen,
      mobileNavOpen,
      setMobileNavOpen,
    ]
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      {/* The singleton media element — persists through navigation. */}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(event) =>
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
        }
        onEnded={handleEnded}
        onError={() => {
          if (current) {
            setPlayerError("This track could not be streamed — try another one.");
            setPlaying(false);
          }
        }}
      />
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerValue {
  const value = useContext(MusicPlayerContext);
  if (!value) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return value;
}
