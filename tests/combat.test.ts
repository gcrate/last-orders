import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../src/engine/combat';
import { createExpedition } from '../src/engine/expedition';
import { newGame } from '../src/engine/state';
import { EventSink } from '../src/engine/util';
import { pushOrders } from './helpers';

function setup(seed: string) {
  const s = newGame(seed);
  const sink = new EventSink(s);
  const ids = Object.values(s.adventurers).map((a) => a.id);
  const exp = createExpedition(s, { memberIds: ids, orders: pushOrders(1), counsel: false, supplyIds: [], startLevel: 1 }, sink);
  return { s, exp, sink };
}

describe('combat', () => {
  it('a weak encounter is usually won', () => {
    let wins = 0;
    for (let i = 0; i < 50; i++) {
      const { s, exp, sink } = setup(`weak-${i}`);
      const r = resolveCombat(s, exp, { monsterId: 'rat', threat: 5, hpMult: 1, boss: false, guardian: false, depth: 1 }, sink);
      if (r.outcome === 'won') wins++;
    }
    expect(wins).toBeGreaterThan(45);
  });

  it('an overwhelming encounter is never won', () => {
    for (let i = 0; i < 20; i++) {
      const { s, exp, sink } = setup(`strong-${i}`);
      const r = resolveCombat(s, exp, { monsterId: 'ghoul', threat: 5000, hpMult: 1, boss: false, guardian: false, depth: 1 }, sink);
      expect(r.outcome).not.toBe('won');
    }
  });
});
