const note = (frequency, delay = 0, gain = 0.07, duration = 0.3) =>
  ({ frequency, end: frequency * 0.995, gain, duration, delay });
const rustle = (gain, duration, cutoff = 1400, delay = 0) =>
  ({ kind: 'noise', gain, duration, cutoff, delay, filterType: 'bandpass' });

/** Foley-like noise layers, silk resonances and distinct danger motifs. No samples/CDN. */
export const CUES = {
  start: [note(261.63, 0, 0.045, 0.5), note(392, 0.14, 0.04, 0.6)],
  wave: [rustle(0.06, 0.7, 950), note(196, 0, 0.04, 0.55), note(207.65, 0.24, 0.03, 0.65)],
  respite: [note(392, 0, 0.035, 0.55), note(523.25, 0.2, 0.025, 0.7)],
  weave: [rustle(0.055, 0.1, 2900), { frequency: 720, end: 1050, gain: 0.014, duration: 0.09 }],
  stitch: [rustle(0.045, 0.09, 2600), note(1046.5, 0, 0.022, 0.18)],
  step: [rustle(0.025, 0.035, 1800)],
  hunterStep: [rustle(0.05, 0.06, 1100), { frequency: 100, end: 70, gain: 0.022, duration: 0.07 }],
  trap: [{ frequency: 540, end: 320, gain: 0.055, duration: 0.22 }, rustle(0.04, 0.1, 3200)],
  eat: [note(659.25, 0, 0.05, 0.13), note(987.77, 0.065, 0.05, 0.24), rustle(0.025, 0.07, 900)],
  bite: [{ frequency: 160, end: 85, gain: 0.065, duration: 0.19 }, rustle(0.07, 0.12, 550)],
  snap: [rustle(0.07, 0.14, 3500), { frequency: 950, end: 180, gain: 0.035, duration: 0.13 }],
  stir: [rustle(0.14, 0.65, 620), { frequency: 180, end: 130, gain: 0.025, duration: 0.45 }],
  look: [note(440, 0, 0.04, 0.35), note(466.16, 0.08, 0.027, 0.38)],
  mantisWarning: [rustle(0.10, 0.18, 2100), note(220, 0, 0.065, 0.17), note(220, 0.22, 0.065, 0.18)],
  mantisBite: [rustle(0.20, 0.27, 2400), { frequency: 125, end: 52, gain: 0.12, duration: 0.19 }, rustle(0.09, 0.12, 3800, 0.08)],
  hunterWarning: [rustle(0.09, 0.5, 900), note(146.83, 0, 0.09, 0.34), note(155.56, 0.3, 0.08, 0.4)],
  hunterChase: [{ frequency: 110, end: 65, gain: 0.09, duration: 0.5 }, rustle(0.10, 0.4, 1300)],
  hunterEscape: [note(293.66, 0, 0.06, 0.4), note(440, 0.12, 0.05, 0.55)],
  lowSilk: [note(783.99, 0, 0.035, 0.11), note(587.33, 0.15, 0.035, 0.17)],
  win: [note(261.63, 0, 0.07, 0.9), note(329.63, 0.18, 0.06, 0.9), note(392, 0.36, 0.06, 1.1), note(523.25, 0.6, 0.06, 1.4)],
  lose: [{ frequency: 155.56, end: 73.42, gain: 0.1, duration: 0.85 }, rustle(0.12, 0.5, 600)],
  caught: [rustle(0.18, 0.22, 1200), { frequency: 120, end: 45, gain: 0.12, duration: 0.5 }],
  swat: [rustle(0.28, 0.2, 800), { frequency: 80, end: 32, gain: 0.14, duration: 0.3 }],
  preview: [rustle(0.08, 0.16, 2500), note(523.25, 0.03, 0.06, 0.3), note(783.99, 0.18, 0.05, 0.4)],
};

export const COOLDOWNS = {
  weave: 0.065, stitch: 0.09, step: 0.07, hunterStep: 0.08,
  trap: 0.09, eat: 0.09, bite: 0.35, snap: 0.15, lowSilk: 3,
};
