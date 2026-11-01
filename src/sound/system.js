import { CUES, COOLDOWNS } from './cues.js';
import { createBed, createMix, createVoice, noiseBuffer, screenPan, smooth } from './graph.js';
import { normalizeSound, readSoundSettings, writeSoundSettings } from './settings.js';

/** Web Audio is a consumer of simulation events, never a dependency of the model. */
export class SoundSystem {
  constructor(options = {}) {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.factory = options.contextFactory || (AudioContext ? () => new AudioContext({ latencyHint: 'interactive' }) : null);
    try { this.storage = options.storage === undefined ? globalThis.localStorage : options.storage; } catch { this.storage = null; }
    this.settings = readSoundSettings(this.storage);
    this.ctx = null; this.mix = null; this.bed = null;
    this.voices = []; this.cooldowns = new Map(); this.counts = {}; this.pendingEvents = [];
    this.round = null; this.lastState = null; this.active = true; this.gameState = 'menu';
    this.previewUntil = 0; this.resumePending = false; this.resumeBlocked = false;
    this.error = ''; this.disposed = false;
    this.stepTravel = 0; this.hunterTravel = 0;
  }

  get status() {
    if (!this.factory) return 'unsupported';
    if (this.error) return 'failed';
    if (!this.ctx) return 'locked';
    if (this.resumeBlocked || this.ctx.state === 'interrupted') return 'blocked';
    return this.ctx.state === 'running' ? 'ready' : 'paused';
  }

  setSettings(patch) {
    this.settings = normalizeSound({ ...this.settings, ...patch });
    writeSoundSettings(this.storage, this.settings);
    this.applySettings();
    if (this.settings.muted || this.settings.master === 0) { this.stopVoices(); this.pendingEvents = []; }
  }

  applySettings() {
    if (!this.mix) return;
    const now = this.ctx.currentTime, s = this.settings;
    smooth(this.mix.master.gain, s.muted ? 0 : s.master, now);
    smooth(this.mix.ambience.gain, s.ambience, now);
    smooth(this.mix.effects.gain, s.effects, now);
    smooth(this.mix.preview.gain, s.effects, now);
  }

  /** Called directly inside a real pointer/key gesture, not from requestAnimationFrame. */
  unlock() {
    if (this.disposed || !this.factory || this.error === 'unavailable' || this.settings.muted || this.settings.master === 0) return;
    try {
      if (!this.ctx) {
        this.ctx = this.factory();
        this.mix = createMix(this.ctx);
        const s = this.settings;
        this.mix.master.gain.value = s.muted ? 0 : s.master;
        this.mix.ambience.gain.value = s.ambience;
        this.mix.effects.gain.value = this.mix.preview.gain.value = s.effects;
        this.noise = noiseBuffer(this.ctx);
        this.bed = createBed(this.ctx, this.mix, this.noise);
        this.applySettings();
      }
      this.resumeBlocked = false;
      this.resume();
    } catch {
      this.error = 'unavailable';
      if (this.ctx) void this.ctx.close().catch(() => {});
    }
  }

  resume() {
    if (!this.ctx || this.disposed || this.resumePending || this.resumeBlocked || this.ctx.state === 'running' || this.ctx.state === 'closed') return;
    this.resumePending = true;
    try {
      const promise = this.ctx.resume();
      Promise.resolve(promise).catch(() => { this.resumeBlocked = true; })
        .finally(() => { this.resumePending = false; });
    } catch { this.resumeBlocked = true; this.resumePending = false; }
  }

  suspend() {
    if (!this.ctx || this.ctx.state === 'closed' || this.ctx.state === 'suspended') return;
    void this.ctx.suspend().catch(() => {});
  }

  setActive(active) {
    this.active = active;
    if (!active && this.ctx && !this.error) {
      this.stopVoices(); this.bed.silence();
      this.gateWorld(0);
      this.suspend();
    }
  }

  gateWorld(value) {
    // Scheduled automation does not take effect while the context is suspended.
    // Set the intrinsic value too, so a pause-preview cannot leak the room mix.
    const gain = this.mix.world.gain;
    gain.cancelScheduledValues(this.ctx.currentTime);
    gain.value = value;
  }

  stopVoices() {
    for (const voice of this.voices) voice.stop();
    this.voices = []; this.previewUntil = 0;
  }

  resetRound(round) {
    this.stopVoices(); this.cooldowns.clear(); this.pendingEvents = []; this.round = round;
    this.stepTravel = 0; this.hunterTravel = 0;
    this.lastPosition = null; this.lastHunter = null;
  }

  play(type, x, output = this.mix?.effects) {
    const layers = CUES[type];
    if (!layers || !output || !this.ctx || this.ctx.state !== 'running' || this.settings.muted ||
        this.settings.master === 0 || this.settings.effects === 0) return false;
    const now = this.ctx.currentTime;
    if (now < (this.cooldowns.get(type) ?? -1)) return false;
    this.cooldowns.set(type, now + (COOLDOWNS[type] ?? 0.05));
    this.voices = this.voices.filter(v => v.until > now);
    // Bounded polyphony, including sources scheduled for the short end motifs.
    for (const layer of layers) {
      if (this.voices.length >= 32) this.voices.shift().stop();
      this.voices.push(createVoice(this.ctx, output, this.noise, { ...layer, pan: screenPan(x) }));
    }
    this.counts[type] = (this.counts[type] || 0) + 1;
    return true;
  }

  preview() {
    this.unlock();
    if (!this.ctx || this.error || this.disposed || this.ctx.state === 'closed') return;
    // resume() may resolve asynchronously. This is the only explicitly requested preview.
    return Promise.resolve(this.ctx.resume()).then(() => {
      if (!this.active || this.disposed || this.settings.muted) { this.suspend(); return; }
      this.previewUntil = this.ctx.currentTime + 0.7;
      this.play('preview', undefined, this.mix.preview);
    }).catch(() => { this.resumeBlocked = true; });
  }

  movement(game) {
    const s = game.spider, h = game.hunter;
    const moved = (old, p) => old ? Math.hypot(p.x - old.x, p.y - old.y) : 0;
    this.stepTravel += Math.min(15, moved(this.lastPosition, s));
    this.hunterTravel += Math.min(15, moved(this.lastHunter, h));
    if (this.stepTravel > 13 && !s.frozen && s.speed > 5) {
      this.play('step', s.x); this.stepTravel %= 13;
    }
    if (this.hunterTravel > 15 && h.state === 'chase' && Math.hypot(h.vx, h.vy) > 5) {
      this.play('hunterStep', h.x); this.hunterTravel %= 15;
    }
    this.lastPosition = { x: s.x, y: s.y }; this.lastHunter = { x: h.x, y: h.y };
  }

  update(game, events = [], active = true) {
    if (this.disposed) return;
    this.active = active; this.gameState = game.state;
    if (this.round !== game.spider) this.resetRound(game.spider);
    const interrupted = !active || game.state === 'pause';
    if ((interrupted && this.lastState !== 'silent') || game.state === 'play' && this.lastState === 'silent') {
      this.stopVoices(); this.lastPosition = null; this.lastHunter = null;
    }
    this.lastState = interrupted ? 'silent' : game.state;
    if (!this.ctx || this.error) return; // events are still drained by the caller; never replay stale cues.
    const now = this.ctx.currentTime;
    const previewing = this.previewUntil > now;
    const audible = !this.settings.muted && this.settings.master > 0 &&
      (this.settings.ambience > 0 || this.settings.effects > 0);
    const enabled = active && audible && (!interrupted || previewing);
    this.gateWorld(interrupted || game.state === 'menu' ? 0 : 1);
    if (!enabled || (game.state === 'menu' && !previewing)) {
      this.pendingEvents = []; this.bed.silence(); this.suspend(); return;
    }
    if (!interrupted && this.settings.effects > 0 && !this.resumeBlocked) {
      const stamp = performance.now();
      this.pendingEvents.push(...events.map(event => ({ ...event, stamp })));
    }
    this.pendingEvents = this.pendingEvents.filter(event => performance.now() - event.stamp < 300).slice(-96);
    this.voices = this.voices.filter(v => v.until > now);
    // Do not repeatedly resume/suspend the device on a finished result screen.
    if (game.state !== 'play' && !previewing && !this.pendingEvents.length && !this.voices.length) {
      this.bed.silence(); this.suspend(); return;
    }
    this.resume();
    if (game.state === 'play' && !interrupted) { this.bed.update(game); this.movement(game); }
    else this.bed.silence();
    // Preserve the first cue while the browser's asynchronous resume is completing.
    // Muting, pausing, hiding or retrying discards this tiny queue instead of replaying it.
    if (this.ctx.state === 'running') {
      const pending = this.pendingEvents; this.pendingEvents = [];
      for (const event of pending) {
        if (event.type === 'lose') {
          this.play(event.cause === 'hunter' ? 'caught' : event.cause === 'swat' ? 'swat' : 'lose', event.x);
        } else this.play(event.type, event.x);
      }
    }
  }

  diagnostics() {
    return { status: this.status, contextState: this.ctx?.state ?? 'not-created',
      voices: this.voices.length, counts: { ...this.counts }, settings: { ...this.settings },
      worldGain: this.mix?.world.gain.value ?? 0 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopVoices(); this.bed?.dispose();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
  }
}
