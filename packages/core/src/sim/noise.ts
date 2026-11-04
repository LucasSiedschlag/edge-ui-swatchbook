/** FNV-1a hash of a string, 32 bit. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Deterministic value in [0, 1) for a key and an integer step. Integer maths only. */
export function noise(key: number, step: number): number {
  let t = (key ^ Math.imul(step | 0, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Smooth value in [0, 1) that drifts over `period` steps. Uses only + - * /, so every engine agrees. */
export function smooth(key: number, step: number, period: number): number {
  const i = Math.floor(step / period);
  const f = (step - i * period) / period;
  const s = f * f * (3 - 2 * f);
  return noise(key, i) * (1 - s) + noise(key, i + 1) * s;
}
