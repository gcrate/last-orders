import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/step';
import { runDays, scriptedInput, stateHash } from './helpers';

describe('determinism', () => {
  it('same seed and inputs give identical states', () => {
    const a = newGame('det');
    const b = newGame('det');
    runDays(a, 30);
    runDays(b, 30);
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('different seeds diverge', () => {
    const a = newGame('det-1');
    const b = newGame('det-2');
    runDays(a, 5);
    runDays(b, 5);
    expect(stateHash(a)).not.toBe(stateHash(b));
  });

  it('step() does not mutate its input', () => {
    const s = newGame('pure');
    const before = stateHash(s);
    step(s, scriptedInput(s), 48);
    expect(stateHash(s)).toBe(before);
  });

  it('stepping 1 hour at a time equals stepping in one go', () => {
    const a = newGame('chunks');
    const b = newGame('chunks');
    let sa = step(a, scriptedInput(a), 0).state;
    let sb = step(b, scriptedInput(b), 0).state;
    sa = step(sa, null, 72).state;
    for (let i = 0; i < 72; i++) sb = step(sb, null, 1).state;
    expect(stateHash(sa)).toBe(stateHash(sb));
  });
});
