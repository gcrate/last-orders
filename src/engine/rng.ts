// Seeded RNG (sfc32). The state is a plain array so it serializes with the game state.
// All engine randomness must come through here. Never use Math.random() in the engine.

export type RngState = [number, number, number, number];

/** Hash a string or number seed into four 32-bit words (cyrb128). */
export function seedRng(seed: string | number): RngState {
  const str = String(seed);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const state: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  // Warm up.
  for (let i = 0; i < 15; i++) nextFloat(state);
  return state;
}

/** Returns a float in [0, 1) and advances the state in place. */
export function nextFloat(s: RngState): number {
  let a = s[0] >>> 0;
  let b = s[1] >>> 0;
  let c = s[2] >>> 0;
  let d = s[3] >>> 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t / 4294967296;
}

/** Float in [lo, hi). */
export function randRange(s: RngState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(s);
}

/** Integer in [lo, hi] inclusive. */
export function randInt(s: RngState, lo: number, hi: number): number {
  return lo + Math.floor(nextFloat(s) * (hi - lo + 1));
}

export function chance(s: RngState, p: number): boolean {
  return nextFloat(s) < p;
}

export function pick<T>(s: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[Math.floor(nextFloat(s) * items.length)];
}

/** Pick from [item, weight] pairs. Weights must not all be zero. */
export function weighted<T>(s: RngState, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) throw new Error('weighted pick with no weight');
  let r = nextFloat(s) * total;
  for (const [item, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return item;
  }
  return entries[entries.length - 1][0];
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(s: RngState, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Stable 32-bit hash of a string, for non-simulation uses (e.g. text variant choice). */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
