// The tavern: the evening routine, residents, recruitment and upgrades.

import { balance } from './balance';
import { changeLoyalty, changeMorale, generateAdventurer, maxHp, recruits, residents } from './adventurers';
import { level } from './dungeon';
import { changeReputation } from './reputation';
import { has } from './traits';
import { dayOf } from './time';
import type { Adventurer, GameState, UpgradeId } from './types';
import { EventSink, pickOne, roll } from './util';

// ---------------------------------------------------------------------------
// Capacity and recruitment

export function roomCapacity(s: GameState): number {
  const r = balance.recruitment;
  return r.baseResidents + s.upgrades.rooms * r.residentsPerRoomTier;
}

/** Adventurers who count against rooms: residents plus those out in the dungeon. */
export function housedCount(s: GameState): number {
  return Object.values(s.adventurers).filter((a) => a.status === 'resident' || a.status === 'expedition').length;
}

export function recruitsPerEvening(s: GameState): number {
  const r = balance.recruitment;
  return r.perEvening + s.upgrades.rooms * r.perEveningRoomBonus + Math.floor(s.reputation / r.repCountBonusEvery);
}

export function recruitQuality(s: GameState): number {
  return s.reputation + s.upgrades.commonRoom * balance.recruitment.qualityPerCommonRoomTier;
}

function signingCost(s: GameState, a: Adventurer): number {
  const e = balance.economy;
  if (s.reputation < e.signingRepFree) return 0;
  return a.level * e.signingPerLevel;
}

export function recruit(s: GameState, adventurerId: string, sink: EventSink): void {
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });
  const a = s.adventurers[adventurerId];
  if (!a || a.status !== 'recruit') return reject('That recruit has gone.');
  if (housedCount(s) >= roomCapacity(s)) return reject('No rooms left.');
  if (s.gold < a.signingCost) return reject(`Not enough gold to sign ${a.name}.`);
  s.gold -= a.signingCost;
  a.status = 'resident';
  a.arrivedDay = dayOf(s.hour);
  sink.emit({ type: 'RECRUIT_HIRED', adventurerId: a.id, cost: a.signingCost });
}

export function dismiss(s: GameState, adventurerId: string, sink: EventSink): void {
  const a = s.adventurers[adventurerId];
  if (!a || a.status !== 'resident') return sink.emit({ type: 'ACTION_REJECTED', reason: 'They are not staying here.' });
  unequipAll(s, a);
  a.status = 'departed';
  sink.emit({ type: 'ADVENTURER_DISMISSED', adventurerId: a.id });
}

/** Gear goes back to the stash when someone leaves the tavern. */
export function unequipAll(s: GameState, a: Adventurer): void {
  for (const slot of ['weapon', 'armour', 'trinket'] as const) {
    const id = a.equipment[slot];
    if (id) s.stash.push(id);
    a.equipment[slot] = null;
  }
  a.hp = Math.min(a.hp, maxHp(s, a));
}

// ---------------------------------------------------------------------------
// The evening routine

export function tavernEvening(s: GameState, sink: EventSink): void {
  const day = dayOf(s.hour);
  collectIncome(s, sink);
  residentsSettle(s, sink);
  refreshRecruits(s, day, sink);
  rumours(s, sink);
  s.reputation = Math.max(0, s.reputation - balance.reputation.dailyDecay);
  sink.emit({ type: 'EVENING', day });
}

function collectIncome(s: GameState, sink: EventSink): void {
  const e = balance.economy;
  let roomAndBoard = 0;
  let bar = 0;
  for (const a of residents(s)) {
    if (a.purse >= e.roomAndBoard) {
      a.purse -= e.roomAndBoard;
      roomAndBoard += e.roomAndBoard;
      a.daysBroke = 0;
    } else {
      roomAndBoard += a.purse;
      a.purse = 0;
      a.daysBroke += 1;
    }
    const spend = Math.min(a.purse, e.barSpend * (has(a, 'drinker') ? e.drinkerBarMult : 1));
    a.purse -= spend;
    bar += spend + e.barPerResidentHouse;
    if (has(a, 'drinker') && spend > 0) changeMorale(a, balance.traitExtras.drinkerMoraleBar);
  }
  s.gold += roomAndBoard + bar;
  s.record.goldEarned += roomAndBoard + bar;
  if (roomAndBoard + bar > 0) sink.emit({ type: 'INCOME', roomAndBoard, bar });
}

function residentsSettle(s: GameState, sink: EventSink): void {
  const b = balance.adventurer;
  const shrineDrift = balance.upgrades.shrineMoraleDrift[s.upgrades.shrine];
  for (const a of residents(s)) {
    const mhp = maxHp(s, a);
    a.hp = Math.min(mhp, a.hp + Math.round(mhp * b.healPerDay));
    const target = b.moraleBaseline;
    const moraleStep = b.moraleDrift + shrineDrift;
    a.morale += Math.sign(target - a.morale) * Math.min(moraleStep, Math.abs(target - a.morale));
    const loyaltyTarget = b.loyaltyStart;
    a.loyalty += Math.sign(loyaltyTarget - a.loyalty) * Math.min(b.loyaltyDailyDrift, Math.abs(loyaltyTarget - a.loyalty));

    // Leaving: broke, or no longer loyal.
    if (a.daysBroke >= balance.economy.daysBrokeLeave) {
      unequipAll(s, a);
      a.status = 'departed';
      sink.emit({ type: 'ADVENTURER_LEFT', adventurerId: a.id, reason: 'broke' });
      changeReputation(s, balance.reputation.desertPenalty);
      continue;
    }
    if (a.loyalty < b.loyaltyLeaveThreshold && roll(s, b.loyaltyLeaveChance)) {
      unequipAll(s, a);
      a.status = 'departed';
      sink.emit({ type: 'ADVENTURER_LEFT', adventurerId: a.id, reason: 'loyalty' });
      changeReputation(s, balance.reputation.desertPenalty);
      continue;
    }
    // Retiring: old age, or a maiming that never healed right.
    if (a.age >= b.retireAge || (a.maimed && roll(s, b.maimedRetireChance))) {
      retire(s, a, a.age >= b.retireAge ? 'age' : 'maimed', sink);
    }
  }
}

export function retire(s: GameState, a: Adventurer, reason: 'age' | 'maimed', sink: EventSink): void {
  unequipAll(s, a);
  a.status = 'retired';
  s.retiredTrainers.push(a.id);
  s.record.retiredAlive += 1;
  sink.emit({ type: 'ADVENTURER_RETIRED', adventurerId: a.id, reason });
}

function refreshRecruits(s: GameState, day: number, sink: EventSink): void {
  for (const a of recruits(s)) {
    if (day - a.arrivedDay >= balance.adventurer.recruitStayDays) {
      a.status = 'departed';
      sink.emit({ type: 'RECRUIT_LEFT', adventurerId: a.id });
      // Never hired: forget them, so the state doesn't fill up with strangers.
      delete s.adventurers[a.id];
    }
  }
  const ids: string[] = [];
  const n = recruitsPerEvening(s);
  for (let i = 0; i < n; i++) {
    const a = generateAdventurer(s, { quality: recruitQuality(s) });
    a.signingCost = signingCost(s, a);
    ids.push(a.id);
  }
  if (ids.length > 0) sink.emit({ type: 'RECRUITS_ARRIVED', adventurerIds: ids });
}

/** The notice board brings rumours of what lies below. */
function rumours(s: GameState, sink: EventSink): void {
  const p = balance.upgrades.noticeRumourChance[s.upgrades.noticeBoard];
  if (!roll(s, p)) return;
  const candidates = s.levels.filter((l) => l.features.some((f) => !l.knownFeatures.includes(f)));
  if (candidates.length === 0) return;
  const l = pickOne(s, candidates);
  const f = pickOne(s, l.features.filter((x) => !l.knownFeatures.includes(x)));
  level(s, l.depth).knownFeatures.push(f);
  sink.emit({ type: 'RUMOUR', level: l.depth, feature: f });
}

/** Once a year everyone gets older. Called at midnight. */
export function ageEveryone(s: GameState): void {
  const t = balance.time;
  const day = dayOf(s.hour) - 1;
  if (day === 0 || day % (t.daysPerSeason * t.seasonsPerYear) !== 0) return;
  for (const a of Object.values(s.adventurers)) {
    if (a.status === 'dead' || a.status === 'departed') continue;
    a.age += 1;
  }
}

// ---------------------------------------------------------------------------
// Upgrades

export function upgradeCost(s: GameState, u: UpgradeId): number | null {
  const tier = s.upgrades[u];
  if (tier >= balance.upgrades.maxTier) return null;
  return Math.round(balance.upgrades.costs[u][tier] * balance.upgrades.costMult);
}

export function buyUpgrade(s: GameState, u: UpgradeId, sink: EventSink): void {
  const cost = upgradeCost(s, u);
  if (cost === null) return sink.emit({ type: 'ACTION_REJECTED', reason: 'That is as good as it gets.' });
  if (s.gold < cost) return sink.emit({ type: 'ACTION_REJECTED', reason: 'Not enough gold.' });
  s.gold -= cost;
  s.upgrades[u] += 1;
  sink.emit({ type: 'UPGRADE_BOUGHT', upgrade: u, tier: s.upgrades[u], cost });
}

export function counselLoyalty(s: GameState, memberIds: string[]): void {
  for (const id of memberIds) changeLoyalty(s.adventurers[id], balance.loyalty.counsel);
}
