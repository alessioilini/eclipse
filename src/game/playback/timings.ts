// Beat durations of the round playback (UI spec §4.2), in milliseconds at normal speed.
export const BEAT_MS = {
  reveal: 600, card: 500, action: 300, hit: 400, heal: 300, status: 200, death: 500, swap: 500,
  moon: 600, bloodMoon: 800, fizzle: 400, end: 800,
} as const;

/** Multiplier of every beat duration per playback speed (settings: normal, fast). */
export const SPEED_FACTOR = { normal: 1, fast: 0.4 } as const;
