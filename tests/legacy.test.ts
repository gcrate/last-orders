import { describe, expect, it } from 'vitest';
import { generateAdventurer } from '../src/engine/adventurers';
import { balance } from '../src/engine/balance';
import { eligibleLegacies } from '../src/engine/legacy';
import { FAMILY_NAME } from '../src/engine/names';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import type { GameState } from '../src/engine/types';

function killKeeper(s: GameState) {
  s.keeper.daysRemaining = 0.1;
  return stepInPlace(s, null, 24);
}

describe('generations', () => {
  it('the keeper dies, time skips, and the heir reopens a regrown dungeon', () => {
    const s = newGame('gen-1');
    s.upgrades.rooms = 2;
    s.upgrades.forge = 1;
    s.levels[0].mapped = true;
    s.levels[0].stairsKnown = true;
    s.levels[9].bossAlive = false;
    const oldIds = Object.keys(s.adventurers);
    const danger = s.levels.map((l) => l.dangerMult);

    const events = killKeeper(s);
    expect(events.some((e) => e.type === 'KEEPER_DIED')).toBe(true);
    expect(s.status).toBe('keeperDead');
    expect(s.transition).not.toBeNull();
    const years = s.transition!.yearsSkipped;
    expect(years).toBeGreaterThanOrEqual(balance.generation.yearsMin);
    expect(years).toBeLessThanOrEqual(balance.generation.yearsMax);

    // Nothing moves until the heir opens up.
    const before = s.hour;
    stepInPlace(s, null, 48);
    expect(s.hour).toBe(before);

    const begin = stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    expect(begin.some((e) => e.type === 'NEW_GENERATION')).toBe(true);
    expect(s.status).toBe('playing');
    expect(s.generation).toBe(2);
    expect(s.keeper.name.endsWith(FAMILY_NAME)).toBe(true);
    expect(s.keeper.portrait).toBe('heir_1');
    expect(s.yearOffset).toBe(years);
    expect(s.history).toHaveLength(1);
    // Harder dungeon, bosses back.
    s.levels.forEach((l, i) => expect(l.dangerMult).toBeGreaterThan(danger[i]));
    expect(s.levels[9].bossAlive).toBe(true);
    // Partial restore.
    expect(s.upgrades.rooms).toBe(1);
    expect(s.upgrades.forge).toBe(0);
    // New faces.
    for (const id of oldIds) expect(s.adventurers[id]?.status ?? 'gone').not.toBe('resident');
    expect(Object.values(s.adventurers).filter((a) => a.status === 'resident').length).toBe(balance.start.residents);
  });

  it('legacy objects follow achievements', () => {
    const s = newGame('gen-2');
    expect(eligibleLegacies(s)).toEqual(['journal']);
    s.record.maxDepth = 12;
    expect(eligibleLegacies(s)[0]).toBe('keepersGear');
    s.record.retiredAlive = 3;
    expect(eligibleLegacies(s)[0]).toBe('oldFriends');
    s.record.deepestPortal = 22;
    expect(eligibleLegacies(s)[0]).toBe('portalStone');
  });

  it('the journal keeps mapped levels and insights', () => {
    const s = newGame('gen-3');
    s.levels[2].mapped = true;
    s.levels[2].explored = 1;
    s.levels[3].explored = 0.5;
    s.levels[3].stairsKnown = true;
    s.journal.insights = ['rat'];
    killKeeper(s);
    expect(s.transition!.legacy).toBe('journal');
    stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    expect(s.levels[2].stairsKnown).toBe(true);
    expect(s.levels[2].mapped).toBe(true);
    expect(s.levels[3].stairsKnown).toBe(false);
    expect(s.journal.insights).toContain('rat');
    expect(s.journal.inherited).toBe(true);
  });

  it('without the journal, insights are lost', () => {
    const s = newGame('gen-4');
    s.record.maxDepth = 15;
    s.journal.insights = ['rat'];
    killKeeper(s);
    expect(s.transition!.legacy).toBe('keepersGear');
    stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    expect(s.journal.insights).toEqual([]);
    expect(s.stash.some((id) => s.items[id].legendary)).toBe(true);
  });

  it('the portal stone leaves a decayed portal at the old depth', () => {
    const s = newGame('gen-5');
    s.record.deepestPortal = 24;
    killKeeper(s);
    stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    const portals = Object.values(s.portals);
    expect(portals).toHaveLength(1);
    expect(portals[0].level).toBe(24);
    expect(portals[0].decayed).toBe(true);
  });

  it('old friends bring veteran trainers and elite recruits', () => {
    const s = newGame('gen-6');
    for (let i = 0; i < 3; i++) {
      const a = generateAdventurer(s, { quality: 10, status: 'retired', level: 8 });
      a.age = 50;
    }
    s.record.retiredAlive = 3;
    killKeeper(s);
    expect(s.transition!.legacy).toBe('oldFriends');
    stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    expect(s.retiredTrainers.length).toBeGreaterThan(0);
    const elite = Object.values(s.adventurers).filter((a) => a.status === 'recruit');
    expect(elite.length).toBe(balance.generation.oldFriendsCount);
    for (const a of elite) {
      expect(a.level).toBeGreaterThan(1);
      expect(a.signingCost).toBe(0);
    }
  });

  it('the greatest fallen leave legendary graves; the rest are lost', () => {
    const s = newGame('gen-7');
    const hero = generateAdventurer(s, { quality: 50, status: 'dead', level: 12 });
    const nobody = generateAdventurer(s, { quality: 0, status: 'dead', level: 1 });
    for (const [a, id] of [
      [hero, 'g-hero'],
      [nobody, 'g-nobody'],
    ] as const) {
      s.graves[id] = { id, adventurerId: a.id, name: a.name, classId: a.classId, level: 7, hour: s.hour, generation: 1, itemIds: [], gold: 10, legendary: false, guardianAlive: false, bounty: 0, recovered: false };
    }
    killKeeper(s);
    stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    expect(s.graves['g-hero']?.legendary).toBe(true);
    expect(s.graves['g-hero']?.guardianAlive).toBe(true);
    expect(s.graves['g-nobody']).toBeUndefined();
  });

  it('the bloodline ends with the last keeper', () => {
    const s = newGame('gen-8');
    for (let g = 1; g < balance.generation.maxGenerations; g++) {
      killKeeper(s);
      stepInPlace(s, { type: 'BEGIN_GENERATION' }, 0);
    }
    expect(s.generation).toBe(balance.generation.maxGenerations);
    const events = killKeeper(s);
    expect(events.some((e) => e.type === 'GAME_LOST')).toBe(true);
    expect(s.status).toBe('lost');
    expect(s.history).toHaveLength(balance.generation.maxGenerations);
  });

  it('killing the source wins the game', () => {
    const s = newGame('gen-9');
    for (const a of Object.values(s.adventurers)) a.status = 'departed';
    const ids = (['fighter', 'cleric', 'rogue', 'mage'] as const).map((classId) => {
      const a = generateAdventurer(s, { quality: 100, level: 30, classId, status: 'resident' });
      a.traits = ['loyal'];
      a.loyalty = 100;
      return a.id;
    });
    const source = s.levels[49];
    source.dangerMult = 0.02;
    source.stairsKnown = true;
    s.portals.p50 = { id: 'p50', level: 50, createdHour: s.hour, usesLeft: 3, expiresHour: s.hour + 1000, decayed: false };
    const events = stepInPlace(
      s,
      {
        type: 'SEND_PARTY',
        memberIds: ids,
        orders: { objective: { type: 'boss', level: 50, graveId: null, setPortal: false }, stance: 'balanced', retreatHp: 0.1, returnByDay: null },
        counsel: false,
        supplyIds: [],
        startPortalId: 'p50',
      },
      0,
    );
    for (let h = 0; h < 24 * 10 && s.status === 'playing'; h++) events.push(...stepInPlace(s, null, 1));
    expect(events.some((e) => e.type === 'GAME_WON')).toBe(true);
    expect(s.status).toBe('won');
    expect(s.history).toHaveLength(1);
  });
});
