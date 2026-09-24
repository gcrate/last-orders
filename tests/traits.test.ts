import { describe, expect, it } from 'vitest';
import { checkInsights, complianceChance, orderFriction } from '../src/engine/advice';
import { generateAdventurer, rollTraits } from '../src/engine/adventurers';
import { balance } from '../src/engine/balance';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import { TRAITS } from '../src/engine/traits';
import type { GameEvent, GameState, Orders, TraitId } from '../src/engine/types';
import { EventSink } from '../src/engine/util';

function partyWith(s: GameState, traits: TraitId[], level = 6): string[] {
  for (const a of Object.values(s.adventurers)) a.status = 'departed';
  return (['fighter', 'cleric', 'rogue', 'mage'] as const).map((classId) => {
    const a = generateAdventurer(s, { quality: 20, level, classId, status: 'resident' });
    a.traits = traits.slice();
    return a.id;
  });
}

function expedition(s: GameState, ids: string[], orders: Orders): GameEvent[] {
  const events = stepInPlace(s, { type: 'SEND_PARTY', memberIds: ids, orders, counsel: false, supplyIds: [], startPortalId: null }, 0);
  for (let h = 0; h < 24 * 40 && Object.keys(s.expeditions).length > 0; h++) events.push(...stepInPlace(s, null, 1));
  return events;
}

const push = (level: number, retreatHp: number): Orders => ({
  objective: { type: 'push', level, graveId: null, setPortal: false },
  stance: 'balanced',
  retreatHp,
  returnByDay: null,
});

describe('traits', () => {
  it('rolled traits never contradict each other', () => {
    const s = newGame('traits-roll');
    for (let i = 0; i < 2000; i++) {
      const t = rollTraits(s);
      expect(t.length).toBeGreaterThanOrEqual(1);
      expect(t.length).toBeLessThanOrEqual(balance.adventurer.maxTraits);
      for (const id of t) {
        const def = TRAITS.find((x) => x.id === id)!;
        for (const other of t) expect(def.opposes).not.toContain(other);
      }
    }
  });

  it('compliance rises with loyalty, counsel and the loyal trait', () => {
    const s = newGame('traits-comply');
    const a = generateAdventurer(s, { quality: 10, status: 'resident' });
    a.traits = [];
    a.morale = 50;
    const opts = { counsel: false, depth: 1, firstDay: false };
    a.loyalty = 20;
    const low = complianceChance(s, a, opts);
    a.loyalty = 80;
    const high = complianceChance(s, a, opts);
    expect(high).toBeGreaterThan(low);
    expect(complianceChance(s, a, { ...opts, counsel: true })).toBeGreaterThan(high);
    a.traits = ['loyal'];
    expect(complianceChance(s, a, opts)).toBeGreaterThan(high);
    a.traits = ['reckless'];
    expect(complianceChance(s, a, opts)).toBeLessThan(high);
  });

  it('reckless parties push deeper and die more than cowardly ones', () => {
    let recklessDeaths = 0;
    let cowardDeaths = 0;
    let recklessDepth = 0;
    let cowardDepth = 0;
    for (let i = 0; i < 40; i++) {
      const a = newGame(`rc-${i}`);
      const ev1 = expedition(a, partyWith(a, ['reckless']), push(14, 0.5));
      recklessDeaths += ev1.filter((e) => e.type === 'ADVENTURER_DIED').length;
      recklessDepth += a.record.maxDepth;
      const b = newGame(`rc-${i}`);
      const ev2 = expedition(b, partyWith(b, ['cowardly']), push(14, 0.5));
      cowardDeaths += ev2.filter((e) => e.type === 'ADVENTURER_DIED').length;
      cowardDepth += b.record.maxDepth;
    }
    expect(recklessDepth).toBeGreaterThan(cowardDepth);
    expect(recklessDeaths).toBeGreaterThan(cowardDeaths);
  });

  it('only kind adventurers or friends attempt rescues', () => {
    for (let i = 0; i < 15; i++) {
      const s = newGame(`rescue-${i}`);
      const events = expedition(s, partyWith(s, ['brave'], 2), push(12, 0.1));
      expect(events.some((e) => e.type === 'RESCUE_ATTEMPT')).toBe(false);
    }
    let attempts = 0;
    for (let i = 0; i < 15; i++) {
      const s = newGame(`rescue-${i}`);
      const events = expedition(s, partyWith(s, ['kind'], 2), push(12, 0.1));
      attempts += events.filter((e) => e.type === 'RESCUE_ATTEMPT').length;
    }
    expect(attempts).toBeGreaterThan(0);
  });

  it('shared expeditions build relationships', () => {
    const s = newGame('friends');
    const ids = partyWith(s, ['loyal'], 10);
    expedition(s, ids, push(2, 0.3));
    const a = s.adventurers[ids[0]];
    const alive = ids.slice(1).filter((id) => s.adventurers[id].status === 'resident');
    expect(alive.length).toBeGreaterThan(0);
    for (const id of alive) expect(a.relations[id]).toBeGreaterThan(0);
  });

  it('reported sightings unlock insights', () => {
    const s = newGame('insights');
    s.journal.sightings.ghoul = 100;
    const sink = new EventSink(s);
    checkInsights(s, sink);
    expect(s.journal.insights).toContain('ghoul');
    expect(sink.events.some((e) => e.type === 'INSIGHT_UNLOCKED')).toBe(true);
  });

  it('the keeper can read friction in a party before it goes', () => {
    const s = newGame('friction');
    const ids = partyWith(s, ['reckless']);
    s.adventurers[ids[1]].traits = ['cowardly'];
    const f = orderFriction(s, ids, push(12, 0.5));
    expect(f.some((x) => x.kind === 'ignoresRetreat')).toBe(true);
    expect(f.some((x) => x.kind === 'fearsDepth')).toBe(true);
  });
});
