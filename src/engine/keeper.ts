// The keeper: illness clock, healer estimate, shocks and keeper actions.

import { balance } from './balance';
import { changeLoyalty, maxHp } from './adventurers';
import { dayOf, hoursUntil } from './time';
import type { GameState, Keeper, KeeperActionInput, Stat } from './types';
import { EventSink, clamp, rollRange } from './util';

export function createKeeper(s: GameState, name: string, portrait: string): Keeper {
  const k = balance.keeper;
  const days = Math.round(rollRange(s, k.startDaysMin, k.startDaysMax + 1));
  return {
    name,
    portrait,
    generation: s.generation,
    daysRemaining: days,
    startDays: days,
    tonicsTaken: 0,
    healerVisits: 0,
    estimateWidth: k.estimateWidthStart,
    estimateBias: rollBias(s, k.estimateWidthStart),
    restingUntilHour: null,
    lastEffortDay: -1,
    restDays: 0,
    effortDaysSpent: 0,
    alive: true,
  };
}

function rollBias(s: GameState, width: number): number {
  const f = balance.keeper.estimateBiasFrac;
  return rollRange(s, -width * f, width * f);
}

/** The healer's estimate of days remaining, as a [low, high] range. */
export function estimate(k: Keeper): [number, number] {
  const centre = k.daysRemaining * (1 + k.estimateBias);
  const lo = Math.max(0, Math.round(centre * (1 - k.estimateWidth)));
  const hi = Math.max(lo + 1, Math.round(centre * (1 + k.estimateWidth)));
  return [lo, hi];
}

/** Portrait stage 1 (well-ish) to 4 (near death). */
export function portraitStage(k: Keeper): number {
  const frac = k.daysRemaining / k.startDays;
  const t = balance.keeper.stageThresholds;
  if (frac > t[0]) return 1;
  if (frac > t[1]) return 2;
  if (frac > t[2]) return 3;
  return 4;
}

export function isResting(s: GameState): boolean {
  return s.keeper.restingUntilHour !== null && s.hour < s.keeper.restingUntilHour;
}

/** Can the keeper spend effort (life) right now? Returns a reason if not. */
export function exertBlocked(s: GameState): string | null {
  if (!s.keeper.alive || s.status !== 'playing') return 'The keeper cannot act.';
  if (isResting(s)) return 'The keeper is resting today.';
  return null;
}

function loseDays(s: GameState, days: number, sink: EventSink): void {
  const before = portraitStage(s.keeper);
  s.keeper.daysRemaining -= days;
  const after = portraitStage(s.keeper);
  if (after !== before) sink.emit({ type: 'KEEPER_STAGE', stage: after });
}

export function spendEffort(s: GameState, days: number, sink: EventSink): void {
  s.keeper.effortDaysSpent += days;
  s.keeper.lastEffortDay = dayOf(s.hour);
  loseDays(s, days, sink);
}

export function keeperShock(s: GameState, cause: 'favourite' | 'wipe' | 'bossFail', adventurerId: string | null, sink: EventSink): void {
  const k = balance.keeper;
  const days = cause === 'favourite' ? k.shockFavourite : cause === 'wipe' ? k.shockWipe : k.shockBossFail;
  sink.emit({ type: 'KEEPER_SHOCK', cause, adventurerId });
  loseDays(s, days, sink);
}

/** Midnight: the illness advances. */
export function keeperMidnight(s: GameState, sink: EventSink): void {
  const k = s.keeper;
  let decline = 1;
  if (k.restingUntilHour !== null && s.hour >= k.restingUntilHour) {
    decline = balance.keeper.restDecline;
    k.restDays += 1;
    k.restingUntilHour = null;
  }
  k.estimateWidth = Math.max(balance.keeper.estimateWidthMin, k.estimateWidth * balance.keeper.estimateNarrowDaily);
  loseDays(s, decline, sink);
}

export function keeperShouldDie(s: GameState): boolean {
  return s.keeper.alive && s.keeper.daysRemaining <= 0;
}

// ---------------------------------------------------------------------------
// Actions

export function keeperAction(s: GameState, action: KeeperActionInput, sink: EventSink): void {
  const k = balance.keeper;
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });

  switch (action.type) {
    case 'TRAIN': {
      const blocked = exertBlocked(s);
      if (blocked) return reject(blocked);
      const a = s.adventurers[action.adventurerId];
      if (!a || a.status !== 'resident') return reject('They are not at the tavern.');
      const gain = trainStat(s, a.id, action.stat, k.trainGain);
      if (gain <= 0) return reject(`${a.name} can't get any better at that.`);
      a.keeperTrained += 1;
      changeLoyalty(a, k.trainLoyalty);
      spendEffort(s, k.trainDaysCost, sink);
      sink.emit({ type: 'KEEPER_TRAINED', adventurerId: a.id, stat: action.stat, gain, daysCost: k.trainDaysCost });
      return;
    }
    case 'HIRE_TRAINER': {
      const a = s.adventurers[action.adventurerId];
      if (!a || a.status !== 'resident') return reject('They are not at the tavern.');
      if (s.gold < k.trainerCost) return reject('Not enough gold for a trainer.');
      const veteranId = s.retiredTrainers.find((id) => s.adventurers[id]) ?? null;
      const gain = trainStat(s, a.id, action.stat, k.trainerGain + (veteranId ? k.trainerVeteranBonus : 0));
      if (gain <= 0) return reject(`${a.name} can't get any better at that.`);
      s.gold -= k.trainerCost;
      sink.emit({ type: 'TRAINER_HIRED', adventurerId: a.id, stat: action.stat, gain, cost: k.trainerCost, veteranId });
      return;
    }
    case 'TONIC': {
      if (s.gold < k.tonicCost) return reject('Not enough gold for a tonic.');
      s.gold -= k.tonicCost;
      s.keeper.daysRemaining += k.tonicDays * Math.pow(k.tonicDiminish, s.keeper.tonicsTaken);
      s.keeper.tonicsTaken += 1;
      sink.emit({ type: 'TONIC_TAKEN', cost: k.tonicCost });
      return;
    }
    case 'HEALER': {
      if (s.gold < k.healerCost) return reject('Not enough gold for the healer.');
      s.gold -= k.healerCost;
      const kp = s.keeper;
      kp.healerVisits += 1;
      kp.estimateWidth = Math.max(k.estimateWidthMin, kp.estimateWidth * k.healerNarrow);
      kp.estimateBias = rollBias(s, kp.estimateWidth);
      sink.emit({ type: 'HEALER_VISIT', cost: k.healerCost, estimate: estimate(kp) });
      return;
    }
    case 'REST': {
      if (isResting(s)) return reject('The keeper is already resting.');
      if (s.keeper.lastEffortDay === dayOf(s.hour)) return reject('Too late to rest today. You have already exerted yourself.');
      s.keeper.restingUntilHour = s.hour + hoursUntil(s.hour, 0);
      sink.emit({ type: 'KEEPER_RESTED' });
      return;
    }
  }
}

function trainStat(s: GameState, adventurerId: string, stat: Stat, amount: number): number {
  const a = s.adventurers[adventurerId];
  const before = a.stats[stat];
  a.stats[stat] = clamp(before + amount, balance.adventurer.statMin, balance.adventurer.statMax);
  const gain = a.stats[stat] - before;
  if (stat === 'vitality') a.hp = Math.min(maxHp(s, a), a.hp + gain * balance.classes[a.classId].hpPerVit);
  return gain;
}
