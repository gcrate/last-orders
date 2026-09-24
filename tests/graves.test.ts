import { afterEach, describe, expect, it } from 'vitest';
import { generateAdventurer } from '../src/engine/adventurers';
import { balance, overrideBalance, resetBalance } from '../src/engine/balance';
import { createItem } from '../src/engine/items';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import type { GameEvent, GameState, Orders } from '../src/engine/types';

function strongParty(s: GameState): string[] {
  for (const a of Object.values(s.adventurers)) a.status = 'departed';
  return (['fighter', 'cleric', 'rogue', 'mage'] as const).map((classId) => {
    const a = generateAdventurer(s, { quality: 100, level: 25, classId, status: 'resident' });
    a.traits = ['loyal'];
    a.loyalty = 100;
    return a.id;
  });
}

function run(s: GameState, input: Parameters<typeof stepInPlace>[1], maxDays = 60): GameEvent[] {
  const events = stepInPlace(s, input, 0);
  for (let h = 0; h < 24 * maxDays && Object.keys(s.expeditions).length > 0; h++) events.push(...stepInPlace(s, null, 1));
  return events;
}

const orders = (o: Partial<Orders['objective']> & { type: Orders['objective']['type']; level: number }): Orders => ({
  objective: { graveId: null, setPortal: false, ...o },
  stance: 'balanced',
  retreatHp: 0.1,
  returnByDay: null,
});

/** Put a dead adventurer's grave, with a sword, on a level. */
function plantGrave(s: GameState, depth: number): { graveId: string; deadId: string; swordId: string } {
  const dead = generateAdventurer(s, { quality: 10, status: 'dead' });
  dead.death = { level: depth, hour: s.hour, cause: 'a ghoul' };
  const swordId = createItem(s, 'sword', 2);
  const graveId = 'g-test';
  s.graves[graveId] = {
    id: graveId,
    adventurerId: dead.id,
    name: dead.name,
    classId: dead.classId,
    level: depth,
    hour: s.hour,
    generation: 1,
    itemIds: [swordId],
    gold: 40,
    legendary: false,
    guardianAlive: false,
    bounty: 0,
    recovered: false,
  };
  return { graveId, deadId: dead.id, swordId };
}

afterEach(() => resetBalance());

describe('graves', () => {
  it('a recovery party brings the grave goods home', () => {
    const s = newGame('graves-1');
    const ids = strongParty(s);
    const { graveId, swordId } = plantGrave(s, 3);
    const events = run(s, { type: 'SEND_PARTY', memberIds: ids, orders: orders({ type: 'recover', level: 3, graveId }), counsel: false, supplyIds: [], startPortalId: null });
    expect(events.some((e) => e.type === 'GRAVE_RECOVERED' && e.graveId === graveId)).toBe(true);
    expect(s.graves[graveId].recovered).toBe(true);
    // Unless a greedy finder pocketed it, the sword is in the stash.
    expect(s.stash.includes(swordId) || events.some((e) => e.type === 'GRAVE_RECOVERED' && e.keptItemId === swordId)).toBe(true);
    expect(s.record.gravesRecovered).toBe(1);
  });

  it('bounties need a notice board and are paid to the finder', () => {
    const s = newGame('graves-2');
    const ids = strongParty(s);
    const { graveId } = plantGrave(s, 2);
    s.gold = 1000;
    expect(stepInPlace(s, { type: 'POST_BOUNTY', graveId, gold: 100 }, 0)[0].type).toBe('ACTION_REJECTED');
    stepInPlace(s, { type: 'BUY_UPGRADE', upgrade: 'noticeBoard' }, 0);
    stepInPlace(s, { type: 'POST_BOUNTY', graveId, gold: 100 }, 0);
    expect(s.graves[graveId].bounty).toBe(100);
    const purses = Object.fromEntries(ids.map((id) => [id, s.adventurers[id].purse]));
    const events = run(s, { type: 'SEND_PARTY', memberIds: ids, orders: orders({ type: 'recover', level: 2, graveId }), counsel: false, supplyIds: [], startPortalId: null });
    const rec = events.find((e) => e.type === 'GRAVE_RECOVERED');
    expect(rec).toBeDefined();
    const finder = rec!.type === 'GRAVE_RECOVERED' ? rec!.finderId : '';
    expect(s.adventurers[finder].purse).toBeGreaterThanOrEqual(purses[finder] + 100);
  });

  it('the shrine can revive the recently dead when the body comes home', () => {
    const s = newGame('graves-3');
    const ids = strongParty(s);
    const { graveId, deadId } = plantGrave(s, 2);
    s.upgrades.shrine = 3;
    overrideBalance('upgrades.shrineReviveChance', [1, 1, 1, 1]);
    const events = run(s, { type: 'SEND_PARTY', memberIds: ids, orders: orders({ type: 'recover', level: 2, graveId }), counsel: false, supplyIds: [], startPortalId: null });
    expect(events.some((e) => e.type === 'REVIVED' && e.adventurerId === deadId)).toBe(true);
    expect(s.adventurers[deadId].status).toBe('resident');
  });
});

describe('portals', () => {
  it('a portal scroll sets a portal that later parties can start from', () => {
    const s = newGame('portal-1');
    const ids = strongParty(s);
    const scroll = createItem(s, 'portal', 1);
    s.stash.push(scroll);
    const events = run(s, {
      type: 'SEND_PARTY',
      memberIds: ids,
      orders: orders({ type: 'push', level: 5, setPortal: true }),
      counsel: false,
      supplyIds: [scroll],
      startPortalId: null,
    });
    expect(events.some((e) => e.type === 'PORTAL_OPENED' && e.level === 5)).toBe(true);
    const portal = Object.values(s.portals).find((p) => p.level === 5);
    expect(portal).toBeDefined();
    const uses = portal!.usesLeft;

    const again = run(s, {
      type: 'SEND_PARTY',
      memberIds: ids,
      orders: orders({ type: 'push', level: 7 }),
      counsel: false,
      supplyIds: [],
      startPortalId: portal!.id,
    });
    const departed = again.find((e) => e.type === 'PARTY_DEPARTED');
    expect(departed && departed.type === 'PARTY_DEPARTED' && departed.startLevel).toBe(5);
    expect(again.some((e) => e.type === 'LEVEL_ENTERED' && e.level === 1)).toBe(false);
    expect(s.portals[portal!.id]?.usesLeft ?? 0).toBeLessThan(uses);
  });

  it('portals fade after their lifetime', () => {
    const s = newGame('portal-2');
    s.portals.p1 = { id: 'p1', level: 4, createdHour: s.hour, usesLeft: 3, expiresHour: s.hour + 48, decayed: false };
    stepInPlace(s, null, 24 * 3);
    expect(s.portals.p1).toBeUndefined();
    expect(balance.portals.lifeDays).toBeGreaterThan(0);
  });
});
