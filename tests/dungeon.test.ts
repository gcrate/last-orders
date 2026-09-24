import { describe, expect, it } from 'vitest';
import { generateAdventurer } from '../src/engine/adventurers';
import { balance } from '../src/engine/balance';
import { bandOf, isBossLevel, levelThreat } from '../src/engine/dungeon';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import type { GameEvent, GameState, Orders } from '../src/engine/types';

function strongParty(s: GameState, level = 30): string[] {
  for (const a of Object.values(s.adventurers)) a.status = 'departed';
  const ids: string[] = [];
  for (const classId of ['fighter', 'cleric', 'rogue', 'mage'] as const) {
    const a = generateAdventurer(s, { quality: 100, level, classId, status: 'resident' });
    a.traits = ['loyal'];
    a.loyalty = 100;
    ids.push(a.id);
  }
  return ids;
}

function send(s: GameState, ids: string[], orders: Orders): GameEvent[] {
  const events = stepInPlace(s, { type: 'SEND_PARTY', memberIds: ids, orders, counsel: false, supplyIds: [], startPortalId: null }, 0);
  for (let h = 0; h < 24 * 90 && Object.keys(s.expeditions).length > 0; h++) events.push(...stepInPlace(s, null, 1));
  return events;
}

const orders = (type: Orders['objective']['type'], level: number): Orders => ({
  objective: { type, level, graveId: null, setPortal: false },
  stance: 'balanced',
  retreatHp: 0.1,
  returnByDay: null,
});

describe('dungeon', () => {
  it('has 50 levels in 5 bands with a boss every 10th level', () => {
    const s = newGame('d-1');
    expect(s.levels).toHaveLength(50);
    expect(bandOf(1)).toBe(1);
    expect(bandOf(10)).toBe(1);
    expect(bandOf(11)).toBe(2);
    expect(bandOf(50)).toBe(5);
    expect(s.levels.filter((l) => isBossLevel(l.depth)).map((l) => l.depth)).toEqual([10, 20, 30, 40, 50]);
    expect(s.levels.filter((l) => l.bossAlive).length).toBe(5);
  });

  it('gets more dangerous with depth', () => {
    const s = newGame('d-2');
    for (const l of s.levels) l.features = [];
    for (let d = 2; d <= 50; d++) expect(levelThreat(s, d)).toBeGreaterThan(levelThreat(s, d - 1));
  });

  it('a boss must die before anyone goes below it', () => {
    const s = newGame('d-3');
    const ids = strongParty(s);
    const events = send(s, ids, orders('push', 12));
    const killedAt = events.findIndex((e) => e.type === 'BOSS_KILLED' && e.level === 10);
    const entered11 = events.findIndex((e) => e.type === 'LEVEL_ENTERED' && e.level === 11);
    expect(entered11).toBeGreaterThan(-1);
    expect(killedAt).toBeGreaterThan(-1);
    expect(killedAt).toBeLessThan(entered11);
    expect(s.levels[9].bossAlive).toBe(false);
  });

  it('a multi-level expedition reaches its depth and remembers the way', () => {
    const s = newGame('d-4');
    const ids = strongParty(s);
    const events = send(s, ids, orders('push', 6));
    expect(events.some((e) => e.type === 'OBJECTIVE_DONE')).toBe(true);
    for (let d = 1; d < 6; d++) expect(s.levels[d - 1].stairsKnown).toBe(true);
    expect(s.record.maxDepth).toBeGreaterThanOrEqual(6);
  });

  it('cleared levels are quieter, then slowly repopulate', () => {
    const s = newGame('d-5');
    const ids = strongParty(s);
    const events = send(s, ids, orders('clear', 2));
    expect(events.some((e) => e.type === 'LEVEL_CLEARED' && e.level === 2)).toBe(true);
    const after = s.levels[1].population;
    // A little regrowth may happen on the way home.
    expect(after).toBeLessThan(balance.dungeon.clearPopulation + 0.1);
    stepInPlace(s, null, 24 * 10);
    expect(s.levels[1].population).toBeGreaterThan(after);
  });

  it('a weak party ordered at a boss usually fails or turns back', () => {
    let kills = 0;
    for (let i = 0; i < 10; i++) {
      const s = newGame(`d-6-${i}`);
      const ids = Object.values(s.adventurers).map((a) => a.id);
      // Pretend the way is known so they walk straight to the lair.
      for (let d = 1; d <= 10; d++) s.levels[d - 1].stairsKnown = true;
      const events = send(s, ids, orders('boss', 10));
      if (events.some((e) => e.type === 'BOSS_KILLED')) kills++;
    }
    expect(kills).toBeLessThan(3);
  });
});
