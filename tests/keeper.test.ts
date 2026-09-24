import { describe, expect, it } from 'vitest';
import { balance } from '../src/engine/balance';
import { killAdventurer } from '../src/engine/death';
import { createExpedition } from '../src/engine/expedition';
import { EventSink } from '../src/engine/util';
import { estimate, portraitStage } from '../src/engine/keeper';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import { hoursUntil } from '../src/engine/time';
import type { GameState } from '../src/engine/types';

function toMidnight(s: GameState) {
  return stepInPlace(s, null, hoursUntil(s.hour, 0));
}

describe('the keeper', () => {
  it('starts with a rolled number of days and loses one a night', () => {
    const s = newGame('k-1');
    const k = balance.keeper;
    expect(s.keeper.daysRemaining).toBeGreaterThanOrEqual(k.startDaysMin);
    expect(s.keeper.daysRemaining).toBeLessThanOrEqual(k.startDaysMax);
    const before = s.keeper.daysRemaining;
    toMidnight(s);
    expect(s.keeper.daysRemaining).toBeCloseTo(before - 1);
  });

  it('a rest day slows the decline and blocks effort', () => {
    const s = newGame('k-2');
    const before = s.keeper.daysRemaining;
    stepInPlace(s, { type: 'KEEPER', action: { type: 'REST' } }, 0);
    const trainee = Object.values(s.adventurers)[0];
    const ev = stepInPlace(s, { type: 'KEEPER', action: { type: 'TRAIN', adventurerId: trainee.id, stat: 'might' } }, 0);
    expect(ev[0].type).toBe('ACTION_REJECTED');
    toMidnight(s);
    expect(s.keeper.daysRemaining).toBeCloseTo(before - balance.keeper.restDecline);
    expect(s.keeper.restDays).toBe(1);
  });

  it('cannot rest on a day it already spent effort', () => {
    const s = newGame('k-3');
    const a = Object.values(s.adventurers)[0];
    stepInPlace(s, { type: 'KEEPER', action: { type: 'TRAIN', adventurerId: a.id, stat: 'might' } }, 0);
    const ev = stepInPlace(s, { type: 'KEEPER', action: { type: 'REST' } }, 0);
    expect(ev[0].type).toBe('ACTION_REJECTED');
  });

  it('personal training costs days and builds stats and loyalty', () => {
    const s = newGame('k-4');
    const a = Object.values(s.adventurers)[0];
    a.stats.might = 10;
    const days = s.keeper.daysRemaining;
    const loyalty = a.loyalty;
    stepInPlace(s, { type: 'KEEPER', action: { type: 'TRAIN', adventurerId: a.id, stat: 'might' } }, 0);
    expect(a.stats.might).toBe(10 + balance.keeper.trainGain);
    expect(a.loyalty).toBeGreaterThan(loyalty);
    expect(s.keeper.daysRemaining).toBeCloseTo(days - balance.keeper.trainDaysCost);
    expect(a.keeperTrained).toBe(1);
  });

  it('a hired trainer costs gold, not life, and teaches less', () => {
    const s = newGame('k-5');
    const a = Object.values(s.adventurers)[0];
    a.stats.wits = 10;
    const days = s.keeper.daysRemaining;
    const gold = s.gold;
    stepInPlace(s, { type: 'KEEPER', action: { type: 'HIRE_TRAINER', adventurerId: a.id, stat: 'wits' } }, 0);
    expect(a.stats.wits).toBe(10 + balance.keeper.trainerGain);
    expect(s.gold).toBe(gold - balance.keeper.trainerCost);
    expect(s.keeper.daysRemaining).toBe(days);
  });

  it('tonics add days with diminishing returns', () => {
    const s = newGame('k-6');
    s.gold = 10000;
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = s.keeper.daysRemaining;
      stepInPlace(s, { type: 'KEEPER', action: { type: 'TONIC' } }, 0);
      gains.push(s.keeper.daysRemaining - before);
    }
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]);
    expect(gains[0]).toBeCloseTo(balance.keeper.tonicDays);
  });

  it('the healer narrows the estimate, which always contains the truth', () => {
    const s = newGame('k-7');
    s.gold = 10000;
    const wide = estimate(s.keeper);
    stepInPlace(s, { type: 'KEEPER', action: { type: 'HEALER' } }, 0);
    stepInPlace(s, { type: 'KEEPER', action: { type: 'HEALER' } }, 0);
    const narrow = estimate(s.keeper);
    expect(narrow[1] - narrow[0]).toBeLessThan(wide[1] - wide[0]);
    for (let i = 0; i < 50; i++) {
      const [lo, hi] = estimate(s.keeper);
      expect(lo).toBeLessThanOrEqual(s.keeper.daysRemaining);
      expect(hi).toBeGreaterThanOrEqual(s.keeper.daysRemaining);
      stepInPlace(s, null, 24);
    }
  });

  it('counsel costs days and is refused while resting', () => {
    const s = newGame('k-8');
    const ids = Object.values(s.adventurers).map((a) => a.id);
    const days = s.keeper.daysRemaining;
    const orders = { objective: { type: 'push' as const, level: 1, graveId: null, setPortal: false }, stance: 'balanced' as const, retreatHp: 0.4, returnByDay: null };
    const ev = stepInPlace(s, { type: 'SEND_PARTY', memberIds: ids, orders, counsel: true, supplyIds: [], startPortalId: null }, 0);
    expect(ev.some((e) => e.type === 'KEEPER_COUNSELLED')).toBe(true);
    expect(s.keeper.daysRemaining).toBeCloseTo(days - balance.keeper.counselDaysCost);
    const exp = Object.values(s.expeditions)[0];
    expect(exp.counsel).toBe(true);
  });

  it('the portrait worsens in four stages and the keeper eventually dies', () => {
    const s = newGame('k-9');
    const stages = new Set<number>();
    let died = false;
    for (let d = 0; d < 400 && !died; d++) {
      stages.add(portraitStage(s.keeper));
      const ev = stepInPlace(s, null, 24);
      died = ev.some((e) => e.type === 'KEEPER_DIED');
    }
    expect(died).toBe(true);
    expect(s.status).toBe('keeperDead');
    expect([...stages].sort()).toEqual([1, 2, 3, 4]);
  });

  it('losing a favourite is a shock', () => {
    const s = newGame('k-10');
    const ids = Object.values(s.adventurers).map((a) => a.id);
    const a = s.adventurers[ids[0]];
    a.keeperTrained = 1;
    const sink = new EventSink(s);
    const orders = { objective: { type: 'push' as const, level: 1, graveId: null, setPortal: false }, stance: 'balanced' as const, retreatHp: 0.4, returnByDay: null };
    const exp = createExpedition(s, { memberIds: ids, orders, counsel: false, supplyIds: [], startLevel: 1 }, sink);
    const days = s.keeper.daysRemaining;
    killAdventurer(s, exp, a.id, 1, 'a ghoul', sink);
    expect(sink.events.some((e) => e.type === 'KEEPER_SHOCK' && e.cause === 'favourite')).toBe(true);
    expect(s.keeper.daysRemaining).toBeCloseTo(days - balance.keeper.shockFavourite);
  });
});
