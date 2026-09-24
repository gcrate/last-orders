import { describe, expect, it } from 'vitest';
import { nextFloat, randInt, seedRng, weighted } from '../src/engine/rng';

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = seedRng(42);
    const b = seedRng(42);
    for (let i = 0; i < 100; i++) expect(nextFloat(a)).toBe(nextFloat(b));
  });

  it('differs between seeds', () => {
    expect(nextFloat(seedRng(1))).not.toBe(nextFloat(seedRng(2)));
  });

  it('stays in range', () => {
    const r = seedRng('range');
    for (let i = 0; i < 2000; i++) {
      const f = nextFloat(r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = randInt(r, 3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('respects weights roughly', () => {
    const r = seedRng('w');
    let a = 0;
    for (let i = 0; i < 10000; i++) if (weighted(r, [['a', 3], ['b', 1]]) === 'a') a++;
    expect(a / 10000).toBeGreaterThan(0.7);
    expect(a / 10000).toBeLessThan(0.8);
  });

  it('survives a JSON round trip mid-stream', () => {
    const a = seedRng('json');
    nextFloat(a);
    const b = JSON.parse(JSON.stringify(a));
    expect(nextFloat(a)).toBe(nextFloat(b));
  });
});
