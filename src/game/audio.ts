/** Tiny synth bus. Unlocked synchronously from the start gesture. */

export type AudioBus = {
  unlock: () => void;
  resume: () => void;
  setMuted: (m: boolean) => void;
  muted: () => boolean;
  engine: (speed: number, thrust: number, alive: boolean) => void;
  gun: () => void;
  mine: () => void;
  boom: () => void;
  hit: () => void;
  land: (hard: boolean) => void;
  fall: () => void;
  lap: () => void;
  finish: () => void;
};

export function createAudio(): AudioBus {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let engineGain: GainNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  let oscA: OscillatorNode | null = null;
  let oscB: OscillatorNode | null = null;
  let thrustGain: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let thrustSrc: AudioBufferSourceNode | null = null;
  let muted = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 240;
    oscA = ctx.createOscillator();
    oscB = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "triangle";
    oscA.frequency.value = 48;
    oscB.frequency.value = 48;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    oscA.connect(mix);
    oscB.connect(engineFilter);
    mix.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    oscA.start();
    oscB.start();

    const len = ctx.sampleRate * 1;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    thrustGain = ctx.createGain();
    thrustGain.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    thrustSrc = ctx.createBufferSource();
    thrustSrc.buffer = noise;
    thrustSrc.loop = true;
    thrustSrc.connect(bp);
    bp.connect(thrustGain);
    thrustGain.connect(master);
    thrustSrc.start();
  }

  function blip(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (!ctx || !sfx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(sfx);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur: number, gain: number, freq: number) {
    if (!ctx || !sfx || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    resume() {
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    setMuted(m: boolean) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.03);
    },
    muted: () => muted,
    engine(speed: number, thrust: number, alive: boolean) {
      if (!ctx || !engineGain || !engineFilter || !oscA || !oscB || !thrustGain) return;
      const sp = Math.max(0, speed);
      const f = 42 + sp * 2.4;
      oscA.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      oscB.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.05);
      engineFilter.frequency.setTargetAtTime(180 + sp * 22, ctx.currentTime, 0.05);
      const g = alive ? Math.min(0.11, 0.02 + sp * 0.0015) : 0;
      engineGain.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
      thrustGain.gain.setTargetAtTime(alive ? thrust * 0.07 : 0, ctx.currentTime, 0.04);
    },
    gun() {
      blip(210 + Math.random() * 40, 0.07, "square", 0.08);
      noiseBurst(0.05, 0.12, 1800);
    },
    mine() {
      blip(160, 0.18, "sine", 0.1);
    },
    boom() {
      noiseBurst(0.38, 0.28, 900);
      blip(90, 0.32, "sine", 0.16);
    },
    hit() {
      noiseBurst(0.09, 0.16, 1400);
      blip(140, 0.08, "triangle", 0.06);
    },
    land(hard: boolean) {
      noiseBurst(hard ? 0.16 : 0.08, hard ? 0.18 : 0.07, 500);
    },
    fall() {
      blip(220, 0.4, "sawtooth", 0.06);
    },
    lap() {
      blip(520, 0.12, "sine", 0.06);
      blip(780, 0.16, "sine", 0.05);
    },
    finish() {
      blip(392, 0.18, "sine", 0.07);
      setTimeout(() => blip(523, 0.22, "sine", 0.07), 140);
      setTimeout(() => blip(659, 0.32, "sine", 0.07), 280);
    },
  };
}
