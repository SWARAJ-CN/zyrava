/**
 * One-tap party pads — short sounds synthesized directly on the AudioContext,
 * so they fire with zero downloads. Every pad builds its own oscillator /
 * noise nodes, schedules envelopes, and lets them garbage-collect on stop.
 */

export const PADS = [
  { name: "bass-drop", label: "Bass drop", hint: "Sub-heavy resonance drop" },
  { name: "impact", label: "Impact", hint: "Kick + air slam" },
  { name: "siren", label: "Siren", hint: "Rising-loop hi-lo wail" },
  { name: "air-horn", label: "Air horn", hint: "Festival triple honk" },
  { name: "crowd", label: "Crowd", hint: "Cheer swell" },
  { name: "drum-roll", label: "Drum roll", hint: "Accelerating snare roll" },
  { name: "laser", label: "Laser", hint: "Zap sweep burst" },
  { name: "riser", label: "Riser", hint: "Noise build into the drop" },
] as const;

export type PadName = (typeof PADS)[number]["name"];

/** A white-noise buffer, generated once per call and reused inside a pad. */
function makeNoise(context: AudioContext, seconds: number): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(seconds * rate)), rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Schedules a percussive amplitude envelope on this gain node. */
function envelope(
  context: AudioContext,
  gain: GainNode,
  from: number,
  peak: number,
  attack: number,
  decay: number,
  at: number
) {
  gain.gain.setValueAtTime(from, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.03), at + attack + decay);
}

export function playPad(context: AudioContext, destination: AudioNode, name: PadName) {
  const now = context.currentTime + 0.03;

  switch (name) {
    case "bass-drop": {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 1.1);
      envelope(context, gain, 0.0001, 1, 0.02, 1.2, now);
      osc.connect(gain).connect(destination);
      osc.start(now);
      osc.stop(now + 2.4);
      break;
    }
    case "impact": {
      const sine = context.createOscillator();
      const subGain = context.createGain();
      sine.type = "sine";
      sine.frequency.setValueAtTime(150, now);
      sine.frequency.exponentialRampToValueAtTime(36, now + 0.35);
      envelope(context, subGain, 0.0001, 1, 0.005, 0.6, now);
      sine.connect(subGain).connect(destination);

      const noise = context.createBufferSource();
      const airGain = context.createGain();
      const airFilter = context.createBiquadFilter();
      noise.buffer = makeNoise(context, 0.2);
      airFilter.type = "lowpass";
      airFilter.frequency.value = 3200;
      envelope(context, airGain, 0.4, 0.35, 0.008, 0.25, now);
      noise.connect(airFilter).connect(airGain).connect(destination);
      noise.start(now);

      sine.start(now);
      sine.stop(now + 1);
      break;
    }
    case "siren": {
      const osc = context.createOscillator();
      const lfo = context.createOscillator();
      const depth = context.createGain();
      const gain = context.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 720;
      lfo.type = "sine";
      lfo.frequency.value = 3.2;
      depth.gain.value = 260;
      lfo.connect(depth).connect(osc.frequency);
      envelope(context, gain, 0.0001, 0.16, 0.06, 1.7, now);
      osc.connect(gain).connect(destination);
      osc.start(now);
      lfo.start(now);
      osc.stop(now + 2.2);
      lfo.stop(now + 2.2);
      break;
    }
    case "air-horn": {
      const honkAt = (start: number, length: number) => {
        const gain = context.createGain();
        envelope(context, gain, 0.0001, 0.09, 0.02, length, start);
        gain.connect(destination);
        [228, 271, 322].forEach((freq, part) => {
          const osc = context.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.value = freq * (1 + part * 0.001);
          osc.connect(gain);
          osc.start(start);
          osc.stop(start + length + 0.3);
        });
      };
      honkAt(now, 0.16);
      honkAt(now + 0.3, 0.16);
      honkAt(now + 0.6, 1);
      break;
    }
    case "crowd": {
      const noise = context.createBufferSource();
      const band = context.createBiquadFilter();
      const gain = context.createGain();
      noise.buffer = makeNoise(context, 2.4);
      band.type = "bandpass";
      band.frequency.value = 1000;
      band.Q.value = 0.6;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 1.1);
      gain.gain.exponentialRampToValueAtTime(0.0002, now + 2.3);
      noise.connect(band).connect(gain).connect(destination);
      noise.start(now);
      break;
    }
    case "drum-roll": {
      let tick = 0;
      let at = now;
      // 26 ticks accelerating 90ms → 26ms: classic roll build.
      while (tick < 26) {
        const noise = context.createBufferSource();
        const band = context.createBiquadFilter();
        const gain = context.createGain();
        noise.buffer = makeNoise(context, 0.05);
        band.type = "highpass";
        band.frequency.value = 1400;
        gain.gain.setValueAtTime(0.5, at);
        gain.gain.exponentialRampToValueAtTime(0.002, at + 0.05);
        noise.connect(band).connect(gain).connect(destination);
        noise.start(at);
        tick += 1;
        at += 0.09 - tick * 0.0024;
      }
      break;
    }
    case "laser": {
      [0, 0.14].forEach((offset, volley) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(2600 - volley * 500, now + offset);
        osc.frequency.exponentialRampToValueAtTime(240, now + offset + 0.26);
        envelope(context, gain, 0.0001, 0.16, 0.004, 0.3, now + offset);
        osc.connect(gain).connect(destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.4);
      });
      break;
    }
    case "riser": {
      const noise = context.createBufferSource();
      const band = context.createBiquadFilter();
      const gain = context.createGain();
      noise.buffer = makeNoise(context, 2.2);
      band.type = "bandpass";
      band.Q.value = 1.1;
      band.frequency.setValueAtTime(220, now);
      band.frequency.exponentialRampToValueAtTime(7600, now + 2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 1.9);
      gain.gain.exponentialRampToValueAtTime(0.0002, now + 2.15);
      noise.connect(band).connect(gain).connect(destination);
      noise.start(now);
      break;
    }
  }
}
