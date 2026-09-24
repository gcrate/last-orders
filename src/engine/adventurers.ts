// Adventurer generation, derived stats and lifecycle helpers.

import { balance } from './balance';
import { CLASS_WEAPONS } from './items';
import { FIRST_NAMES, SURNAMES } from './names';
import { TRAITS, has, moraleScale } from './traits';
import type { Adventurer, ClassId, GameState, Item, Stat, TraitId } from './types';
import { CLASSES, STATS } from './types';
import { clamp, newId, pickOne, pickWeighted, rollInt, rollRange, shuffled } from './util';
import { dayOf } from './time';

export const PORTRAITS_PER_CLASS = 20;

export function classPrimary(c: ClassId): Stat {
  return balance.classes[c].primary as Stat;
}

/** How many years `age` falls outside the portrait's believable range (0 = a good fit). */
function portraitAgeGap(c: ClassId, index: number, age: number): number {
  const [min, max] = balance.portraitAges[c][index];
  return age < min ? min - age : age > max ? age - max : 0;
}

/** Prefers an unused portrait that looks the adventurer's age, then the closest-looking one. */
function pickPortrait(s: GameState, c: ClassId, age: number): string {
  const used = new Set(
    Object.values(s.adventurers)
      .filter((a) => a.status !== 'dead' && a.status !== 'departed')
      .map((a) => a.portrait),
  );
  const all: { id: string; gap: number }[] = [];
  for (let i = 0; i < PORTRAITS_PER_CLASS; i++) {
    all.push({ id: `adv_${c}_${String(i + 1).padStart(2, '0')}`, gap: portraitAgeGap(c, i, age) });
  }
  const free = all.filter((p) => !used.has(p.id));
  const pool = free.length > 0 ? free : all;
  const bestGap = Math.min(...pool.map((p) => p.gap));
  return pickOne(s, pool.filter((p) => p.gap === bestGap)).id;
}

function pickName(s: GameState): string {
  const living = new Set(
    Object.values(s.adventurers)
      .filter((a) => a.status !== 'dead' && a.status !== 'departed')
      .map((a) => a.name.split(' ')[0]),
  );
  const free = FIRST_NAMES.filter((n) => !living.has(n));
  const first = pickOne(s, free.length > 0 ? free : FIRST_NAMES);
  return `${first} ${pickOne(s, SURNAMES)}`;
}

export function rollTraits(s: GameState): TraitId[] {
  const count = pickWeighted(s, balance.adventurer.traitCountWeights);
  const out: TraitId[] = [];
  for (const t of shuffled(s, TRAITS)) {
    if (out.length >= count) break;
    if (out.some((o) => t.opposes.includes(o) || TRAITS.find((x) => x.id === o)!.opposes.includes(t.id))) continue;
    out.push(t.id);
  }
  return out;
}

export interface GenerateOptions {
  quality: number; // reputation-equivalent
  classId?: ClassId;
  level?: number;
  veteran?: boolean;
  status?: Adventurer['status'];
}

export function generateAdventurer(s: GameState, opts: GenerateOptions): Adventurer {
  const b = balance.adventurer;
  const classId = opts.classId ?? pickOne(s, CLASSES);
  const statBonus = opts.quality * b.recruitStatPerRep;
  const stats = {} as Record<Stat, number>;
  for (const st of STATS) {
    stats[st] = clamp(Math.round(rollRange(s, b.baseStatMin, b.baseStatMax + 1) + statBonus), b.statMin, b.statMax);
  }
  const prim = classPrimary(classId);
  stats[prim] = clamp(stats[prim] + b.classPrimaryBonus, b.statMin, b.statMax);

  const extraLevels = opts.level !== undefined ? opts.level - 1 : Math.floor(rollRange(s, 0, 1) * opts.quality * b.recruitLevelPerRep);
  const age = opts.veteran ? rollInt(s, b.veteranAgeMin, b.veteranAgeMin + 10) : rollInt(s, b.ageMin, b.ageMax);

  const a: Adventurer = {
    id: newId(s, 'a'),
    name: pickName(s),
    age,
    portrait: pickPortrait(s, classId, age),
    classId,
    stats,
    level: 1,
    xp: 0,
    hp: 0,
    traits: rollTraits(s),
    morale: b.moraleStart,
    loyalty: b.loyaltyStart,
    relations: {},
    status: opts.status ?? 'recruit',
    equipment: { weapon: null, armour: null, trinket: null },
    purse: rollInt(s, b.purseStartMin, b.purseStartMax),
    maimed: false,
    expeditions: 0,
    kills: 0,
    keeperTrained: 0,
    signingCost: 0,
    arrivedDay: dayOf(s.hour),
    generation: s.generation,
    death: null,
    daysBroke: 0,
  };
  for (let i = 0; i < extraLevels; i++) levelUp(s, a);
  if (a.traits.includes('loyal')) a.loyalty += 10;
  s.adventurers[a.id] = a;
  a.hp = maxHp(s, a);
  return a;
}

// ---------------------------------------------------------------------------
// Derived stats

function equipped(s: GameState, a: Adventurer): Item[] {
  const out: Item[] = [];
  for (const id of [a.equipment.weapon, a.equipment.armour, a.equipment.trinket]) {
    if (id && s.items[id]) out.push(s.items[id]);
  }
  return out;
}

function gearSum(s: GameState, a: Adventurer, key: 'attack' | 'defence' | 'spell' | 'trapSense' | 'hpBonus'): number {
  let total = 0;
  for (const item of equipped(s, a)) {
    let v = item[key];
    // Class affinity: a weapon of the class's favourite kind is worth more.
    if (item.slot === 'weapon' && CLASS_WEAPONS[a.classId].includes(item.kind)) v *= 1 + balance.items.affinityBonus;
    total += v;
  }
  return total;
}

function statMix(a: Adventurer, weights: Record<string, number>): number {
  let total = 0;
  for (const [st, w] of Object.entries(weights)) total += a.stats[st as Stat] * w;
  return total;
}

export function maxHp(s: GameState, a: Adventurer): number {
  const c = balance.classes[a.classId];
  let hp = c.hpBase + a.stats.vitality * c.hpPerVit + (a.level - 1) * balance.derived.hpPerLevel + gearSum(s, a, 'hpBonus');
  if (has(a, 'tough')) hp *= balance.traitExtras.toughHpMult;
  return Math.round(hp);
}

export function attackOf(s: GameState, a: Adventurer): number {
  const c = balance.classes[a.classId];
  return statMix(a, c.attackStats) * c.attackMult + gearSum(s, a, 'attack');
}

export function spellOf(s: GameState, a: Adventurer): number {
  const c = balance.classes[a.classId];
  return statMix(a, c.spellStats) * c.spellMult + gearSum(s, a, 'spell');
}

export function defenceOf(s: GameState, a: Adventurer): number {
  return statMix(a, balance.derived.defenceStats) * balance.classes[a.classId].defenceMult + gearSum(s, a, 'defence');
}

export function trapSenseOf(s: GameState, a: Adventurer): number {
  return statMix(a, balance.derived.trapStats) + balance.classes[a.classId].trapBonus + gearSum(s, a, 'trapSense');
}

/** Abstract combat power of one adventurer, before stance/trait/situational modifiers. */
export function powerOf(s: GameState, a: Adventurer): number {
  const d = balance.derived;
  let p = attackOf(s, a) + spellOf(s, a) + defenceOf(s, a) * d.defenceScale;
  p *= 1 + (a.level - 1) * d.powerLevelScale;
  if (a.maimed) p *= 1 - balance.adventurer.maimPowerPenalty;
  return p;
}

// ---------------------------------------------------------------------------
// Progression

export function xpToNext(a: Adventurer): number {
  return balance.adventurer.xpPerLevel * a.level;
}

export function levelUp(s: GameState, a: Adventurer): void {
  const b = balance.adventurer;
  if (a.level >= b.maxLevel) return;
  a.level += 1;
  // Stat gains favour the class's primary stat.
  const prim = classPrimary(a.classId);
  for (let i = 0; i < b.levelStatGain; i++) {
    const st = rollRange(s, 0, 1) < b.levelPrimaryChance ? prim : pickOne(s, STATS);
    a.stats[st] = clamp(a.stats[st] + 1, b.statMin, b.statMax);
  }
}

/** Apply pending level-ups. Returns the number of levels gained. */
export function applyLevelUps(s: GameState, a: Adventurer): number {
  let gained = 0;
  while (a.xp >= xpToNext(a) && a.level < balance.adventurer.maxLevel) {
    a.xp -= xpToNext(a);
    levelUp(s, a);
    gained++;
  }
  return gained;
}

export function changeMorale(a: Adventurer, delta: number): void {
  a.morale = clamp(a.morale + moraleScale(a, delta), 0, 100);
}

export function changeLoyalty(a: Adventurer, delta: number): void {
  a.loyalty = clamp(a.loyalty + delta, 0, 100);
}

export function relation(a: Adventurer, otherId: string): number {
  return a.relations[otherId] ?? 0;
}

export function changeRelation(a: Adventurer, b: Adventurer, delta: number): void {
  a.relations[b.id] = clamp(relation(a, b.id) + delta, -100, 100);
  b.relations[a.id] = clamp(relation(b, a.id) + delta, -100, 100);
}

export function isFriend(a: Adventurer, otherId: string): boolean {
  return relation(a, otherId) >= balance.relations.friendThreshold;
}

export function isRival(a: Adventurer, otherId: string): boolean {
  return relation(a, otherId) <= balance.relations.rivalThreshold;
}

export function isFavourite(a: Adventurer): boolean {
  return a.keeperTrained > 0 || a.loyalty >= balance.keeper.favouriteLoyalty;
}

export function residents(s: GameState): Adventurer[] {
  return Object.values(s.adventurers).filter((a) => a.status === 'resident');
}

export function recruits(s: GameState): Adventurer[] {
  return Object.values(s.adventurers).filter((a) => a.status === 'recruit');
}
