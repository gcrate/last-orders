import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import type { GameEvent } from '../src/engine/types';
import { pushOrders } from './helpers';

function sendAll(seed: string, depth: number) {
  const s = newGame(seed);
  const ids = Object.values(s.adventurers).filter((a) => a.status === 'resident').map((a) => a.id);
  const events: GameEvent[] = stepInPlace(
    s,
    { type: 'SEND_PARTY', memberIds: ids, orders: pushOrders(depth), counsel: false, supplyIds: [], startPortalId: null },
    0,
  );
  return { s, ids, events };
}

describe('expedition', () => {
  it('departs, resolves and comes home headless', () => {
    const { s, ids, events } = sendAll('exp-1', 2);
    expect(events.some((e) => e.type === 'PARTY_DEPARTED')).toBe(true);
    for (const id of ids) expect(s.adventurers[id].status).toBe('expedition');
    for (let i = 0; i < 24 * 20 && Object.keys(s.expeditions).length > 0; i++) events.push(...stepInPlace(s, null, 1));
    expect(Object.keys(s.expeditions)).toHaveLength(0);
    expect(events.some((e) => e.type === 'PARTY_RETURNED' || e.type === 'PARTY_WIPED')).toBe(true);
    for (const id of ids) expect(['resident', 'dead']).toContain(s.adventurers[id].status);
  });

  it('rejects a party of people who are not at the tavern', () => {
    const s = newGame('exp-2');
    const events = stepInPlace(
      s,
      { type: 'SEND_PARTY', memberIds: ['nobody'], orders: pushOrders(1), counsel: false, supplyIds: [], startPortalId: null },
      0,
    );
    expect(events[0].type).toBe('ACTION_REJECTED');
    expect(Object.keys(s.expeditions)).toHaveLength(0);
  });

  it('dead adventurers leave graves where they fell', () => {
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const { s, events } = sendAll(`grave-${i}`, 30);
      for (let h = 0; h < 24 * 60 && Object.keys(s.expeditions).length > 0; h++) events.push(...stepInPlace(s, null, 1));
      const died = events.find((e) => e.type === 'ADVENTURER_DIED');
      if (died && died.type === 'ADVENTURER_DIED') {
        const grave = Object.values(s.graves).find((g) => g.adventurerId === died.adventurerId);
        expect(grave).toBeDefined();
        expect(grave!.level).toBe(died.level);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});
