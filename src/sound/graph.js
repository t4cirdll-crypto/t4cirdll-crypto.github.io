import { W } from '../config.js';

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const screenPan = x => Number.isFinite(x) ? clamp((x / W - 0.5) * 1.6, -0.8, 0.8) : 0;

export function smooth(param, value, now, seconds = 0.035) {
  param.setTargetAtTime(value, now, seconds);
}

/** Seeded noise: sound never consumes the gameplay's random sequence. */
export function noiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x4e574154;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 0x100000000) * 2 - 1;
  }
  return buffer;
}

export function createMix(ctx) {
  const ambience = ctx.createGain(), effects = ctx.createGain(), preview = ctx.createGain();
  const world = ctx.createGain(), master = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
  const analyser = ctx.createAnalyser();
  world.gain.value = 0;
  analyser.fftSize = 2048;
  limiter.threshold.value = -12; limiter.knee.value = 16; limiter.ratio.value = 8;
  limiter.attack.value = 0.004; limiter.release.value = 0.18;
  ambience.connect(world); effects.connect(world); world.connect(master); preview.connect(master);
  master.connect(limiter); limiter.connect(analyser); analyser.connect(ctx.destination);
  return { ambience, effects, preview, world, master, limiter, analyser };
}

/** A few quiet persistent voices; levels and positions follow simulation time. */
export function createBed(ctx, mix, noise) {
  const voices = [], now = ctx.currentTime;
  function voice(kind, frequency, filterType, cutoff, pan = 0, bus = mix.ambience) {
    const source = kind === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
    if (kind === 'noise') { source.buffer = noise; source.loop = true; }
    else { source.type = kind; source.frequency.value = frequency; }
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
    filter.type = filterType; filter.frequency.value = cutoff; filter.Q.value = 0.65;
    gain.gain.value = 0; panner.pan.value = pan;
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(bus);
    source.start(now);
    const v = { source, filter, gain, panner }; voices.push(v); return v;
  }
  const room = voice('noise', 0, 'lowpass', 540, 0.35);
  const breath = voice('noise', 0, 'bandpass', 680, screenPan(130));
  const nightA = voice('sine', 130.81, 'lowpass', 600, -0.4);
  const nightB = voice('sine', 196, 'lowpass', 600, 0.4);
  const tension = voice('sine', 55, 'lowpass', 250);
  const bugs = Array.from({ length: 5 }, (_, i) => voice('sawtooth', 175 + i * 19, 'bandpass', 850, 0, mix.effects));

  function level(v, gain, pan, frequency) {
    smooth(v.gain.gain, gain, ctx.currentTime, 0.09);
    if (pan !== undefined) smooth(v.panner.pan, pan, ctx.currentTime);
    if (frequency !== undefined) smooth(v.source.frequency, frequency, ctx.currentTime, 0.08);
  }
  function update(game) {
    const t = game.time, human = game.human;
    const danger = Math.max(human.suspicion / 100, game.hunter.state === 'chase' ? 0.7 : 0, (game.pressure || 0) * 0.5);
    const wet = ['rain', 'storm'].includes(game.night?.weather);
    smooth(room.filter.frequency, wet ? 1250 : game.night?.weather === 'wind' ? 780 : 540, ctx.currentTime, 0.2);
    level(room, (wet ? 0.043 : 0.024) + Math.sin(t * 0.22) * (wet ? 0.008 : 0.004));
    const sleeping = human.state === 'sleep';
    level(breath, sleeping ? 0.055 * Math.max(0, Math.sin(t * 1.55)) ** 2 : 0.005);
    level(nightA, 0.013 * (1 - danger * 0.7)); level(nightB, 0.009 * (1 - danger * 0.7));
    level(tension, danger * 0.032 * (0.65 + 0.35 * Math.sin(t * 7)));
    const visible = game.mosquitoes.filter(m => m.state !== 'dead').slice(0, bugs.length);
    bugs.forEach((v, i) => {
      const m = visible[i];
      if (!m) { level(v, 0); return; }
      const distance = Math.hypot(m.x - game.spider.x, m.y - game.spider.y);
      const proximity = 0.35 + 0.65 / (1 + distance / 180);
      const gain = (m.state === 'stuck' ? 0.004 : 0.016) * proximity;
      level(v, gain, screenPan(m.x), 190 + i * 17 + Math.sin(t * 24 + i) * 10);
    });
  }
  function silence() { for (const v of voices) level(v, 0); }
  function dispose() {
    for (const v of voices) {
      v.source.stop(); v.source.disconnect(); v.filter.disconnect(); v.gain.disconnect(); v.panner.disconnect();
    }
  }
  return { update, silence, dispose, voices };
}

/** Finite one-shot with attack/release envelope and deterministic node cleanup. */
export function createVoice(ctx, output, noise, options) {
  const { kind = 'sine', frequency = 300, end = frequency, duration = 0.2, delay = 0,
    gain = 0.06, pan = 0, cutoff = 1800, filterType = 'lowpass' } = options;
  const source = kind === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
  const filter = ctx.createBiquadFilter(), envelope = ctx.createGain(), panner = ctx.createStereoPanner();
  const start = ctx.currentTime + delay, stop = start + duration;
  if (kind === 'noise') source.buffer = noise;
  else {
    source.type = kind; source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(Math.max(1, end), stop);
  }
  filter.type = filterType; filter.frequency.value = cutoff; filter.Q.value = 0.8;
  panner.pan.value = pan;
  envelope.gain.setValueAtTime(0, ctx.currentTime);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.012, duration / 4));
  envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
  source.connect(filter); filter.connect(envelope); envelope.connect(panner); panner.connect(output);
  const nodes = [source, filter, envelope, panner];
  let finished = false;
  function cleanup() { if (finished) return; finished = true; for (const n of nodes) n.disconnect(); }
  source.onended = cleanup;
  source.start(start); source.stop(stop + 0.015);
  return {
    until: stop + 0.02,
    stop() { if (!finished) { source.stop(); cleanup(); } },
  };
}
