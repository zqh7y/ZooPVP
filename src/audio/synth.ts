/*
 * The synthesizer the sound effects and the music are built with. Every sound is a small recipe of layers
 * (a sharp transient, a body, a sub thump, a noisy tail, metal rings, crackle, brass, bells, choir) rendered
 * once, much faster than real time, into an audio buffer when the page loads. No audio files.
 */

export const SAMPLE_RATE = 44100;

/** A value, or [time, value] points joined by exponential ramps. */
type Pts = number | [number, number][];

interface Env {
  t?: number; // start
  a?: number; // attack
  h?: number; // hold
  d: number; // decay to silence
  v: number; // level
  to?: AudioNode;
}

/** Builds sounds inside an OfflineAudioContext, with its own repeatable random numbers. */
export class Synth {
  private noises = new Map<string, AudioBuffer>();
  private seed: number;

  constructor(readonly ac: OfflineAudioContext, seed: number) {
    this.seed = seed >>> 0 || 1;
  }

  rnd() {
    // mulberry32
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  rand(a: number, b: number) {
    return a + (b - a) * this.rnd();
  }

  private pts(p: AudioParam, t: number, v: Pts) {
    if (typeof v === 'number') return p.setValueAtTime(v, t);
    p.setValueAtTime(v[0][1], t + v[0][0]);
    for (let i = 1; i < v.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-4, v[i][1]), t + v[i][0]);
  }

  private env(g: AudioParam, e: Env) {
    const t = e.t ?? 0;
    const a = e.a ?? 0.002;
    const h = e.h ?? 0;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(e.v, t + a);
    if (h > 0) g.setValueAtTime(e.v, t + a + h);
    g.exponentialRampToValueAtTime(1e-4, t + a + h + e.d);
    g.setValueAtTime(0, t + a + h + e.d + 0.002);
  }

  private end(e: Env) {
    return (e.t ?? 0) + (e.a ?? 0.002) + (e.h ?? 0) + e.d + 0.05;
  }

  private filter(type: BiquadFilterType, f: Pts, q: number, t: number) {
    const b = this.ac.createBiquadFilter();
    b.type = type;
    b.Q.value = q;
    this.pts(b.frequency, t, f);
    return b;
  }

  /** Soft clipping: punch and warmth for guns, drums and explosions. Returns the input to route voices into. */
  drive(k: number, to?: AudioNode): AudioNode {
    const ws = this.ac.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    ws.curve = curve;
    ws.oversample = '4x';
    ws.connect(to ?? this.ac.destination);
    return ws;
  }

  /** An oscillator with a pitch path, optional vibrato and filter, through an envelope. */
  tone(o: Env & { type?: OscillatorType; f: Pts; lp?: Pts; hp?: number; q?: number; vib?: [number, number]; detune?: number }) {
    const t = o.t ?? 0;
    const osc = this.ac.createOscillator();
    osc.type = o.type ?? 'sine';
    this.pts(osc.frequency, t, o.f);
    if (o.detune) osc.detune.value = o.detune;
    const stop = this.end(o);
    if (o.vib) {
      const lfo = this.ac.createOscillator();
      lfo.frequency.value = o.vib[0];
      const depth = this.ac.createGain();
      depth.gain.value = o.vib[1];
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start(t);
      lfo.stop(stop);
    }
    let node: AudioNode = osc;
    if (o.lp !== undefined) {
      const f = this.filter('lowpass', o.lp, o.q ?? 0.8, t);
      node.connect(f);
      node = f;
    }
    if (o.hp) {
      const f = this.filter('highpass', o.hp, 0.7, t);
      node.connect(f);
      node = f;
    }
    const g = this.ac.createGain();
    this.env(g.gain, o);
    node.connect(g);
    g.connect(o.to ?? this.ac.destination);
    osc.start(t);
    osc.stop(stop);
  }

  private noiseBuf(color: 'white' | 'pink' | 'brown') {
    let buf = this.noises.get(color);
    if (buf) return buf;
    const len = this.ac.length + Math.ceil(SAMPLE_RATE * 0.6);
    buf = this.ac.createBuffer(1, len, SAMPLE_RATE);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = this.rnd() * 2 - 1;
      if (color === 'white') d[i] = w;
      else if (color === 'pink') {
        // Paul Kellet's pink noise filter
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    this.noises.set(color, buf);
    return buf;
  }

  /** Filtered noise through an envelope: hiss, crack, whoosh, rumble. */
  noise(o: Env & { color?: 'white' | 'pink' | 'brown'; filter?: BiquadFilterType; f?: Pts; q?: number }) {
    const t = o.t ?? 0;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf(o.color ?? 'white');
    let node: AudioNode = src;
    if (o.filter) {
      const f = this.filter(o.filter, o.f ?? 1000, o.q ?? 0.7, t);
      src.connect(f);
      node = f;
    }
    const g = this.ac.createGain();
    this.env(g.gain, o);
    node.connect(g);
    g.connect(o.to ?? this.ac.destination);
    src.start(t, this.rand(0, 0.5));
    src.stop(this.end(o));
  }

  /** An FM bell: bright at the strike, mellowing as it rings. ratio 2 is sweet, odd ratios are metallic. */
  bell(o: Env & { f: number; ratio?: number; index?: number }) {
    const t = o.t ?? 0;
    const ratio = o.ratio ?? 2;
    const index = o.index ?? 1;
    const car = this.ac.createOscillator();
    car.frequency.value = o.f;
    const mod = this.ac.createOscillator();
    mod.frequency.value = o.f * ratio;
    const mg = this.ac.createGain();
    const dev = o.f * ratio * index;
    mg.gain.setValueAtTime(dev, t);
    mg.gain.exponentialRampToValueAtTime(dev * 0.04 + 0.01, t + (o.a ?? 0.002) + (o.h ?? 0) + o.d * 0.7);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = this.ac.createGain();
    this.env(g.gain, o);
    car.connect(g);
    g.connect(o.to ?? this.ac.destination);
    const stop = this.end(o);
    car.start(t);
    mod.start(t);
    car.stop(stop);
    mod.stop(stop);
  }

  /** Sparse random clicks: debris, gravel, fireworks crackle, glass. */
  crackle(o: Env & { density: number; filter?: BiquadFilterType; f?: Pts; q?: number }) {
    const t = o.t ?? 0;
    const len = Math.ceil((this.end(o) - t) * SAMPLE_RATE);
    const buf = this.ac.createBuffer(1, Math.max(1, len), SAMPLE_RATE);
    const d = buf.getChannelData(0);
    const p = o.density / SAMPLE_RATE;
    for (let i = 0; i < len; i++) {
      if (this.rnd() >= p) continue;
      const amp = this.rand(0.3, 1) * (this.rnd() < 0.5 ? -1 : 1);
      const n = 6 + Math.floor(this.rnd() * 40);
      for (let k = 0; k < n && i + k < len; k++) d[i + k] += amp * Math.exp(-k / (n * 0.3)) * (this.rnd() * 2 - 1);
    }
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    let node: AudioNode = src;
    if (o.filter) {
      const f = this.filter(o.filter, o.f ?? 3000, o.q ?? 0.7, t);
      src.connect(f);
      node = f;
    }
    const g = this.ac.createGain();
    this.env(g.gain, o);
    node.connect(g);
    g.connect(o.to ?? this.ac.destination);
    src.start(t);
  }

  /** Brass: pairs of slightly detuned saws per note through a lowpass that opens and closes (the "wah"). */
  brass(o: Env & { notes: number[]; cut: Pts; q?: number; vib?: [number, number] }) {
    const t = o.t ?? 0;
    const f = this.filter('lowpass', o.cut, o.q ?? 1.2, t);
    const g = this.ac.createGain();
    this.env(g.gain, o);
    f.connect(g);
    g.connect(o.to ?? this.ac.destination);
    const stop = this.end(o);
    const per = 1 / Math.sqrt(o.notes.length * 2);
    for (const n of o.notes) {
      for (const cents of [-7, 7]) {
        const osc = this.ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = m(n);
        osc.detune.value = cents + this.rand(-3, 3);
        if (o.vib) {
          const lfo = this.ac.createOscillator();
          lfo.frequency.value = o.vib[0];
          const depth = this.ac.createGain();
          depth.gain.value = o.vib[1];
          lfo.connect(depth);
          depth.connect(osc.detune);
          lfo.start(t);
          lfo.stop(stop);
        }
        const lvl = this.ac.createGain();
        lvl.gain.value = per;
        osc.connect(lvl);
        lvl.connect(f);
        osc.start(t);
        osc.stop(stop);
      }
    }
  }

  /** A choir "aah": detuned saws with a slow vibrato through two vowel formants. */
  choir(o: Env & { notes: number[] }) {
    const t = o.t ?? 0;
    const sum = this.ac.createGain();
    const g = this.ac.createGain();
    this.env(g.gain, o);
    for (const [f, q, lvl] of [
      [800, 5, 1],
      [1150, 6, 0.7],
      [2900, 8, 0.25],
    ]) {
      const bp = this.filter('bandpass', f, q, t);
      const l = this.ac.createGain();
      l.gain.value = lvl * 2.2;
      sum.connect(bp);
      bp.connect(l);
      l.connect(g);
    }
    g.connect(o.to ?? this.ac.destination);
    const stop = this.end(o);
    const per = 1 / Math.sqrt(o.notes.length * 3);
    for (const n of o.notes) {
      for (const cents of [-11, 0, 10]) {
        const osc = this.ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = m(n);
        osc.detune.value = cents;
        const lfo = this.ac.createOscillator();
        lfo.frequency.value = this.rand(4.6, 5.6);
        const depth = this.ac.createGain();
        depth.gain.value = 14;
        lfo.connect(depth);
        depth.connect(osc.detune);
        const lvl = this.ac.createGain();
        lvl.gain.value = per;
        osc.connect(lvl);
        lvl.connect(sum);
        for (const x of [osc, lfo]) {
          x.start(t);
          x.stop(stop);
        }
      }
    }
  }
}

/** MIDI note number to Hz (60 = middle C). */
export const m = (n: number) => 440 * 2 ** ((n - 69) / 12);
export const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
/** The Japanese "in" scale (miyako-bushi): the sound of the koto. */
export const IN_SCALE = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24];
/** The yo scale: a bright folk pentatonic (festival tunes). */
export const YO_SCALE = [0, 2, 5, 7, 9, 12, 14, 17, 19, 21, 24];
export const semi = (s: number) => 2 ** (s / 12);

// ------------------------------------------------------------------ building blocks

/** A kick / timpani hit: a falling sine with a click, a little driven. */
export function drum(s: Synth, t: number, f: number, d: number, v: number, drive = 2) {
  const hot = s.drive(drive);
  s.tone({ t, f: [[0, f * 2.4], [0.025, f], [d, f * 0.55]], a: 0.001, d, v, to: hot });
  s.noise({ t, filter: 'bandpass', f: Math.min(9000, f * 7), q: 0.9, a: 0.0005, d: 0.03, v: v * 0.45 });
}

/** A cymbal crash. */
export function crash(s: Synth, t: number, d: number, v: number) {
  s.noise({ t, filter: 'highpass', f: [[0, 6500], [d, 3800]], q: 0.5, a: 0.002, d, v });
  s.noise({ t, filter: 'bandpass', f: 9500, q: 1.4, a: 0.001, d: d * 0.45, v: v * 0.6 });
  for (const f of [3150, 4720, 5980]) s.bell({ t, f: f * s.rand(0.97, 1.03), ratio: 1.47, index: 2.2, d: d * 0.55, v: v * 0.08 });
}

/** A shimmer of high bells and air. */
export function sparkle(s: Synth, t: number, d: number, v: number, count = 6, lo = 2600, hi = 6400) {
  s.noise({ t, filter: 'highpass', f: 7500, q: 0.7, a: 0.03, d, v: v * 0.3 });
  for (let i = 0; i < count; i++) s.bell({ t: t + s.rand(0, d * 0.6), f: s.rand(lo, hi), ratio: 2, index: 0.5, d: s.rand(0.12, 0.32), v: v * s.rand(0.25, 0.6) });
}

/** Bell notes one after another. */
export function arp(s: Synth, notes: number[], t: number, step: number, d: number, v: number, ratio = 2, index = 0.9) {
  notes.forEach((n, i) => s.bell({ t: t + i * step, f: m(n), ratio, index, d, v }));
}

/** Soft sustained chord of triangles (sweetens brass and bells). */
export function pad(s: Synth, notes: number[], t: number, a: number, h: number, d: number, v: number) {
  for (const n of notes) s.tone({ type: 'triangle', f: m(n), t, a, h, d, v: v / Math.sqrt(notes.length) });
}

export function whoosh(s: Synth, t: number, f0: number, f1: number, f2: number, d: number, v: number, q = 1.6) {
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, f0], [d * 0.4, f1], [d, f2]], q, a: d * 0.3, d: d * 0.7, v });
}

/** A rising pentatonic run of bells (rewards). */
export function cascade(s: Synth, root: number, n: number, t: number, step: number, v: number) {
  for (let i = 0; i < n; i++) s.bell({ t: t + i * step, f: m(root + PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length)), ratio: 2, index: 0.7, d: 0.35, v });
}

// ------------------------------------------------------------------ rendering

/** Renders any recipe (sound effects, music instruments) into a levelled, trimmed buffer. */
export async function renderRecipe(id: string, dur: number, make: (s: Synth) => void): Promise<AudioBuffer> {
  const ac = new OfflineAudioContext(1, Math.ceil(dur * SAMPLE_RATE), SAMPLE_RATE);
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 2654435761);
  make(new Synth(ac, seed));
  const buf = await ac.startRendering();
  return finish(buf, ac);
}

/**
 * Levels a rendered sound by its loudest moment (so a click and an explosion start from the same loudness and the
 * table's vol sets the mix), never above full scale, then trims the silent tail and fades the last few ms.
 */
export function finish(buf: AudioBuffer, ac: OfflineAudioContext): AudioBuffer {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (!(peak > 1e-6)) return buf;
  const W = 1024;
  let loud = 0;
  for (let i = 0; i < d.length; i += W / 2) {
    let sum = 0;
    const end = Math.min(d.length, i + W);
    for (let k = i; k < end; k++) sum += d[k] * d[k];
    loud = Math.max(loud, Math.sqrt(sum / W));
  }
  const gain = Math.min(0.98 / peak, 0.3 / Math.max(loud, 1e-6));
  let last = d.length - 1;
  while (last > 0 && Math.abs(d[last]) * gain < 1e-3) last--;
  const len = Math.min(d.length, last + Math.ceil(SAMPLE_RATE * 0.02));
  const out = ac.createBuffer(1, Math.max(1, len), SAMPLE_RATE);
  const o = out.getChannelData(0);
  const fade = Math.min(len, Math.ceil(SAMPLE_RATE * 0.008));
  for (let i = 0; i < len; i++) o[i] = d[i] * gain * (i >= len - fade ? (len - i) / fade : 1);
  return out;
}
