export const SOUND_STORAGE_KEY = 'nightwatch.sound.v1';
export const DEFAULT_SOUND = Object.freeze({ muted: false, master: 0.65, ambience: 0.65, effects: 0.8 });
const volume = (value, fallback) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(1, value)) : fallback;

export function normalizeSound(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    muted: typeof source.muted === 'boolean' ? source.muted : DEFAULT_SOUND.muted,
    master: volume(source.master, DEFAULT_SOUND.master),
    ambience: volume(source.ambience, DEFAULT_SOUND.ambience),
    effects: volume(source.effects, DEFAULT_SOUND.effects),
  };
}

export function readSoundSettings(storage) {
  try { return normalizeSound(JSON.parse(storage.getItem(SOUND_STORAGE_KEY))); }
  catch { return { ...DEFAULT_SOUND }; }
}

export function writeSoundSettings(storage, settings) {
  try { storage.setItem(SOUND_STORAGE_KEY, JSON.stringify(normalizeSound(settings))); return true; }
  catch { return false; }
}
