// Expedition simulation: encounter sequencing, decisions and compliance, the walk home.

import { balance } from './balance';
import {
  applyLevelUps,
  changeLoyalty,
  changeMorale,
  changeRelation,
  isFriend,
  isRival,
  maxHp,
  trapSenseOf,
} from './adventurers';
import { type CombatOutcome, type Encounter, damageMember, isFirstDay, members, partyHp, resolveCombat } from './combat';
import { killAdventurer } from './death';
import {
  bandOf,
  bossHpMult,
  bossThreat,
  gravesOnLevel,
  isBossLevel,
  isSourceLevel,
  level,
  levelThreat,
  portalOnLevel,
} from './dungeon';
import { CONSUMABLE_KINDS, GEAR_KINDS, SCROLL_KINDS, createItem, sellPrice } from './items';
import { keeperShock } from './keeper';
import { bandMonsters, bossForBand, monster, monsterStats } from './monsters';
import { changeReputation } from './reputation';
import { dayOf } from './time';
import { has, traitMult, traitSum } from './traits';
import type { Adventurer, Decision, Expedition, FeatureId, GameState, Grave, ItemKind, ReturnReason } from './types';
import { EventSink, clamp, newId, pickOne, pickWeighted, rollInt, rollRange, roll } from './util';

// ---------------------------------------------------------------------------
// Helpers

function hasSupply(s: GameState, exp: Expedition, kind: ItemKind): boolean {
  return exp.supplyIds.some((id) => s.items[id]?.kind === kind);
}

function useSupply(s: GameState, exp: Expedition, kind: ItemKind, userId: string | null, sink: EventSink): boolean {
  const idx = exp.supplyIds.findIndex((id) => s.items[id]?.kind === kind);
  if (idx < 0) return false;
  const [id] = exp.supplyIds.splice(idx, 1);
  delete s.items[id];
  sink.emit({ type: 'SUPPLY_USED', expeditionId: exp.id, kind, adventurerId: userId });
  return true;
}

function encounterHours(s: GameState): number {
  const d = balance.dungeon;
  return rollInt(s, d.hoursPerEncounterMin, d.hoursPerEncounterMax);
}

function lootMult(s: GameState, exp: Expedition): number {
  const ms = members(s, exp);
  if (ms.length === 0) return 1;
  return ms.reduce((t, a) => t + traitMult(a, 'loot'), 0) / ms.length;
}

function complianceChance(s: GameState, exp: Expedition, a: Adventurer): number {
  const c = balance.compliance;
  let p = c.base + a.loyalty * c.perLoyalty + (a.morale - 50) * c.perMorale;
  p += traitSum(a, 'compliance', { firstDay: isFirstDay(s, exp) });
  if (exp.counsel) p += balance.keeper.counselCompliance;
  return clamp(p, c.min, c.max);
}

/**
 * A decision point. `ordered` is what the orders say; `wants(a)` is each member's own
 * inclination. The most wilful dissenter rolls compliance; if they refuse, the party
 * goes their way. Returns the choice actually made.
 */
function decide(
  s: GameState,
  exp: Expedition,
  decision: Decision,
  ordered: boolean,
  wants: (a: Adventurer) => boolean,
  sink: EventSink,
): boolean {
  const dissenters = members(s, exp).filter((a) => wants(a) !== ordered);
  if (dissenters.length === 0) return ordered;
  const leader = dissenters.reduce((w, a) => (complianceChance(s, exp, a) < complianceChance(s, exp, w) ? a : w), dissenters[0]);
  if (roll(s, complianceChance(s, exp, leader))) {
    sink.emit({ type: 'COMPLIED', expeditionId: exp.id, adventurerId: leader.id, decision });
    return ordered;
  }
  sink.emit({ type: 'DEFIANCE', expeditionId: exp.id, adventurerId: leader.id, decision });
  return !ordered;
}

/** How frightened a member is right now: higher means more eager to turn back. */
function fear(s: GameState, exp: Expedition, a: Adventurer): number {
  const e = balance.expedition;
  const hpFrac = a.hp / maxHp(s, a);
  return (1 - hpFrac) + (e.fearMoraleRef - a.morale) / 100 - traitSum(a, 'pushDeeper', { firstDay: isFirstDay(s, exp) });
}

function retreatThresholdFor(s: GameState, exp: Expedition, a: Adventurer): number {
  return exp.orders.retreatHp + traitSum(a, 'retreatMod', { firstDay: isFirstDay(s, exp) });
}

function estimatedReturnDays(exp: Expedition): number {
  return (exp.level * balance.dungeon.returnHoursPerLevel) / balance.time.hoursPerDay;
}

// ---------------------------------------------------------------------------
// Creating an expedition

export interface ExpeditionSetup {
  memberIds: string[];
  orders: Expedition['orders'];
  counsel: boolean;
  supplyIds: string[];
  startLevel: number;
}

export function createExpedition(s: GameState, setup: ExpeditionSetup, sink: EventSink): Expedition {
  const exp: Expedition = {
    id: newId(s, 'e'),
    memberIds: setup.memberIds.slice(),
    originalMemberIds: setup.memberIds.slice(),
    orders: setup.orders,
    counsel: setup.counsel,
    departedHour: s.hour,
    startLevel: setup.startLevel,
    phase: 'exploring',
    level: setup.startLevel,
    deepest: setup.startLevel,
    hoursToNext: encounterHours(s),
    lootGold: 0,
    lootItemIds: [],
    supplyIds: setup.supplyIds.slice(),
    objectiveDone: false,
    wardActive: false,
    lightLevel: 0,
    daysOut: 0,
    sightings: {},
    returnReason: null,
    deaths: 0,
    rescueTargetGraveId: null,
    lastKillerId: null,
    targetLevel: setup.orders.objective.level,
    recoveredGraveIds: [],
    bossDeclined: false,
  };
  s.expeditions[exp.id] = exp;
  const ms = setup.memberIds.map((id) => s.adventurers[id]);
  for (const a of ms) a.status = 'expedition';

  // Friends lift a party; rivals sour it.
  const m = balance.morale;
  for (const a of ms) {
    for (const b of ms) {
      if (a.id === b.id) continue;
      if (isFriend(a, b.id)) changeMorale(a, m.friendInParty);
      else if (isRival(a, b.id)) changeMorale(a, m.rivalInParty);
    }
  }

  sink.emit({
    type: 'PARTY_DEPARTED',
    expeditionId: exp.id,
    memberIds: exp.memberIds.slice(),
    objective: exp.orders.objective,
    startLevel: exp.startLevel,
  });
  enterLevel(s, exp, setup.startLevel, sink);
  return exp;
}

// ---------------------------------------------------------------------------
// The hourly tick

export function expeditionHour(s: GameState, exp: Expedition, sink: EventSink): void {
  if (exp.phase === 'done') return;
  exp.hoursToNext -= 1;
  if (exp.hoursToNext > 0) return;
  if (exp.phase === 'exploring') exploreTick(s, exp, sink);
  else returnTick(s, exp, sink);
  if (members(s, exp).length === 0 && (exp.phase as string) !== 'done') wipe(s, exp, sink);
}

/** Midnight bookkeeping for parties in the dungeon: days out and rations. */
export function expeditionMidnight(s: GameState, exp: Expedition, sink: EventSink): void {
  if (exp.phase === 'done') return;
  exp.daysOut += 1;
  if (!useSupply(s, exp, 'rations', null, sink)) {
    for (const a of members(s, exp)) changeMorale(a, -balance.morale.daysOutPenalty);
  }
}

function enterLevel(s: GameState, exp: Expedition, depth: number, sink: EventSink): void {
  const l = level(s, depth);
  exp.level = depth;
  if (depth > exp.deepest) exp.deepest = depth;
  if (depth > s.record.maxDepth) s.record.maxDepth = depth;
  sink.emit({ type: 'LEVEL_ENTERED', expeditionId: exp.id, level: depth, firstTime: !l.visited });
  l.visited = true;
  exp.bossDeclined = false;
  exp.wardActive = false;
  // Light the way through unknown ground.
  if (!l.stairsKnown && exp.lightLevel !== depth) {
    const lead = members(s, exp)[0];
    if (useSupply(s, exp, 'light', lead?.id ?? null, sink) || useSupply(s, exp, 'torch', lead?.id ?? null, sink)) {
      exp.lightLevel = depth;
    }
  }
}

function exploreTick(s: GameState, exp: Expedition, sink: EventSink): void {
  const l = level(s, exp.level);
  const headingDeeper = exp.level < exp.targetLevel;

  // Boss lair: the band boss guards the stairs down. Parties that need to pass (or were sent
  // for it) must decide to fight; others only face it if a glory-seeker insists, once per visit.
  if (isBossLevel(exp.level) && l.bossAlive && l.stairsKnown) {
    const wantsBoss = exp.orders.objective.type === 'boss' && exp.orders.objective.level === exp.level;
    const ordered = wantsBoss || headingDeeper;
    if (ordered || !exp.bossDeclined) {
      const fightIt = decide(
        s,
        exp,
        'fightBoss',
        ordered,
        (a) => (has(a, 'glorySeeker') ? true : has(a, 'cowardly') ? false : ordered),
        sink,
      );
      if (fightIt) bossFight(s, exp, sink);
      else if (ordered) turnBack(s, exp, 'boss', sink);
      else exp.bossDeclined = true;
      if (exp.phase === 'exploring') exp.hoursToNext = encounterHours(s);
      if (fightIt || ordered) return;
    }
  }

  // Passing through known ground toward a deeper target.
  if (headingDeeper && l.stairsKnown) {
    exp.hoursToNext = balance.dungeon.hoursPerTransit;
    const chance = balance.dungeon.transitEncounterChance * l.population;
    if (roll(s, chance)) {
      fight(s, exp, ordinaryEncounter(s, exp.level, 1), sink);
      if (members(s, exp).length === 0) return;
    }
    afterEncounter(s, exp, sink);
    if (exp.phase === 'exploring') tryDescend(s, exp, sink);
    return;
  }

  // Exploring the current level.
  exp.hoursToNext = encounterHours(s);
  runEncounter(s, exp, sink);
  if (members(s, exp).length === 0 || exp.phase !== 'exploring') return;
  advanceExploration(s, exp, sink);
  afterEncounter(s, exp, sink);
  if (exp.phase !== 'exploring') return;
  checkObjective(s, exp, sink);
  if (exp.phase !== 'exploring') return;
  if (l.stairsKnown && exp.level < exp.targetLevel && !(isBossLevel(exp.level) && l.bossAlive)) tryDescend(s, exp, sink);
}

function advanceExploration(s: GameState, exp: Expedition, sink: EventSink): void {
  const d = balance.dungeon;
  const l = level(s, exp.level);
  const ms = members(s, exp);
  let step = (1 / d.levelSize) * balance.combat.stance[exp.orders.stance].explore;
  if (ms.some((a) => has(a, 'scholarly'))) step *= balance.traitExtras.scholarlyExplore;
  if (exp.orders.objective.type === 'scout' && exp.orders.objective.level === exp.level) step *= d.scoutExploreMult;
  if (exp.lightLevel === exp.level) step *= 1 + balance.items.lightExploreBonus;
  const before = l.explored;
  l.explored = Math.min(1, l.explored + step);
  if (!l.stairsKnown && l.explored >= l.stairsAt) {
    l.stairsKnown = true;
    if (!isSourceLevel(exp.level)) sink.emit({ type: 'STAIRS_FOUND', expeditionId: exp.id, level: exp.level });
  }
  if (before < 1 && l.explored >= 1 && !l.mapped) {
    l.mapped = true;
    for (const f of l.features) if (!l.knownFeatures.includes(f)) l.knownFeatures.push(f);
    sink.emit({ type: 'LEVEL_MAPPED', expeditionId: exp.id, level: exp.level });
  }
}

function checkObjective(s: GameState, exp: Expedition, sink: EventSink): void {
  const o = exp.orders.objective;
  const l = level(s, exp.level);
  if (exp.objectiveDone || exp.level !== o.level) {
    if (exp.objectiveDone && exp.level >= exp.targetLevel) finishObjective(s, exp, sink);
    return;
  }
  let done = false;
  switch (o.type) {
    case 'push':
      done = true;
      break;
    case 'clear':
      if (l.explored >= 1) {
        l.population = balance.dungeon.clearPopulation;
        l.clearedTimes += 1;
        s.record.levelsCleared += 1;
        changeReputation(s, balance.reputation.levelCleared);
        sink.emit({ type: 'LEVEL_CLEARED', expeditionId: exp.id, level: exp.level });
        done = true;
      }
      break;
    case 'scout':
      done = l.mapped;
      break;
    case 'recover': {
      const g = o.graveId ? s.graves[o.graveId] : undefined;
      done = !g || g.recovered || exp.recoveredGraveIds.includes(g.id);
      break;
    }
    case 'boss':
      done = !l.bossAlive;
      break;
  }
  if (done) {
    exp.objectiveDone = true;
    sink.emit({ type: 'OBJECTIVE_DONE', expeditionId: exp.id, objective: o });
    finishObjective(s, exp, sink);
  }
}

/** Objective met: head home, unless someone insists on going deeper. */
function finishObjective(s: GameState, exp: Expedition, sink: EventSink): void {
  const e = balance.expedition;
  const o = exp.orders.objective;
  if (o.type === 'push' && o.setPortal && exp.level >= o.level && hasSupply(s, exp, 'portal')) {
    openPortalHome(s, exp, sink);
    return;
  }
  const hp = partyHp(s, exp).frac;
  const pressOn = decide(
    s,
    exp,
    'pressOn',
    false,
    (a) => hp > e.pressOnMinHp && traitSum(a, 'pushDeeper') > 0 && roll(s, traitSum(a, 'pushDeeper')),
    sink,
  );
  if (pressOn && exp.targetLevel < balance.dungeon.levels) {
    exp.targetLevel = exp.level + 1;
    return;
  }
  turnBack(s, exp, 'objective', sink);
}

function tryDescend(s: GameState, exp: Expedition, sink: EventSink): void {
  const e = balance.expedition;
  const ms = members(s, exp);
  const fears = new Map(ms.map((a) => [a.id, fear(s, exp, a)]));
  const go = decide(s, exp, 'descend', true, (a) => (fears.get(a.id) ?? 0) < e.descendFear, sink);
  if (!go) {
    turnBack(s, exp, 'fear', sink);
    return;
  }
  // A hesitation beat for whoever was most afraid.
  const worried = ms.filter((a) => (fears.get(a.id) ?? 0) > e.hesitationFear);
  if (worried.length > 0) {
    const a = worried.reduce((w, x) => ((fears.get(x.id) ?? 0) > (fears.get(w.id) ?? 0) ? x : w), worried[0]);
    sink.emit({ type: 'STAIRS_HESITATION', expeditionId: exp.id, level: exp.level + 1, adventurerId: a.id, wentDown: true });
  }
  enterLevel(s, exp, exp.level + 1, sink);
  exp.hoursToNext = encounterHours(s);
}

/** After every encounter: supplies, desertion, retreat check. */
function afterEncounter(s: GameState, exp: Expedition, sink: EventSink): void {
  useHealing(s, exp, sink);
  checkDesertion(s, exp, sink);
  if (members(s, exp).length === 0 || exp.phase !== 'exploring') return;

  const hp = partyHp(s, exp).frac;
  let reason: ReturnReason | null = null;
  if (hp < exp.orders.retreatHp) reason = 'hp';
  else if (exp.orders.returnByDay !== null && dayOf(s.hour) + estimatedReturnDays(exp) >= exp.orders.returnByDay) reason = 'returnBy';
  const ordered = reason !== null;
  const retreat = decide(
    s,
    exp,
    'retreat',
    ordered,
    (a) => {
      if (hp < retreatThresholdFor(s, exp, a)) return true;
      if (a.morale < balance.morale.retreatThreshold && !has(a, 'reckless')) return true;
      if (ordered && reason === 'returnBy') return !has(a, 'reckless') || roll(s, 1 - traitSum(a, 'pushDeeper'));
      return false;
    },
    sink,
  );
  if (retreat) turnBack(s, exp, reason ?? 'fear', sink);
}

function useHealing(s: GameState, exp: Expedition, sink: EventSink): void {
  const e = balance.expedition;
  for (const a of members(s, exp)) {
    const mhp = maxHp(s, a);
    if (a.hp < mhp * e.potionUseBelow && useSupply(s, exp, 'potion', a.id, sink)) {
      a.hp = Math.min(mhp, a.hp + Math.round(mhp * balance.items.potionHeal));
    }
  }
  if (partyHp(s, exp).frac < e.healingScrollUseBelow && hasSupply(s, exp, 'healing')) {
    const cleric = members(s, exp).find((a) => a.classId === 'cleric') ?? members(s, exp)[0];
    useSupply(s, exp, 'healing', cleric?.id ?? null, sink);
    for (const a of members(s, exp)) {
      const mhp = maxHp(s, a);
      a.hp = Math.min(mhp, a.hp + Math.round(mhp * balance.items.healingScrollHeal));
    }
  }
}

function checkDesertion(s: GameState, exp: Expedition, sink: EventSink): void {
  const m = balance.morale;
  const e = balance.expedition;
  for (const a of members(s, exp)) {
    if (members(s, exp).length <= 1) return;
    if (a.morale >= m.desertThreshold) continue;
    const p = m.desertChance * (has(a, 'loyal') ? e.loyalDesertMult : 1);
    if (!roll(s, p)) continue;
    exp.memberIds = exp.memberIds.filter((id) => id !== a.id);
    sink.emit({ type: 'DESERTED', expeditionId: exp.id, adventurerId: a.id, level: exp.level });
    changeReputation(s, balance.reputation.desertPenalty);
    if (roll(s, exp.level * e.desertDeathPerLevel)) {
      // They never make it out.
      a.status = 'expedition';
      const tmp: Expedition = { ...exp, memberIds: [a.id], lootGold: 0 };
      killAdventurer(s, tmp, a.id, exp.level, 'alone in the dark', sink);
      exp.deaths += 1;
    } else {
      a.status = 'resident';
      changeLoyalty(a, e.desertLoyaltyLoss);
    }
  }
}

// ---------------------------------------------------------------------------
// Encounters

function ordinaryEncounter(s: GameState, depth: number, mult: number): Encounter {
  const d = balance.dungeon;
  const band = bandOf(depth);
  const pool = bandMonsters(band);
  const def = pickWeighted(
    s,
    pool.map((m) => [m, monsterStats(m.id).weight] as const),
  );
  const threat = levelThreat(s, depth) * monsterStats(def.id).threat * rollRange(s, d.threatRollMin, d.threatRollMax) * mult;
  return { monsterId: def.id, threat, hpMult: 1, boss: false, guardian: false, depth };
}

type EncounterKind = 'combat' | 'trap' | 'treasure' | 'event' | 'rest' | 'grave';

function runEncounter(s: GameState, exp: Expedition, sink: EventSink): void {
  const d = balance.dungeon;
  const e = balance.expedition;
  const l = level(s, exp.level);
  const w = d.encounterWeights;
  const graves = gravesOnLevel(s, exp.level);
  const o = exp.orders.objective;
  const seekingGrave = o.type === 'recover' && o.level === exp.level && !!o.graveId && graves.some((g) => g.id === o.graveId);
  let graveWeight = graves.length > 0 ? w.grave : 0;
  if (seekingGrave) graveWeight *= e.graveRecoverWeightMult;
  const combatWeight = w.combat * l.population + (l.features.includes('lair') ? d.lairCombatBonus : 0);

  let kind: EncounterKind;
  if (seekingGrave && l.explored >= 1) kind = 'grave';
  else {
    kind = pickWeighted<EncounterKind>(s, [
      ['combat', combatWeight],
      ['trap', w.trap],
      ['treasure', w.treasure],
      ['event', w.event],
      ['rest', w.rest],
      ['grave', graveWeight],
    ]);
  }

  switch (kind) {
    case 'combat':
      fight(s, exp, ordinaryEncounter(s, exp.level, 1), sink);
      break;
    case 'trap':
      trap(s, exp, sink);
      break;
    case 'treasure':
      treasure(s, exp, 1, false, sink);
      break;
    case 'event':
      dungeonEvent(s, exp, sink);
      break;
    case 'rest':
      rest(s, exp, balance.expedition.restHeal, sink);
      break;
    case 'grave': {
      const g = seekingGrave ? graves.find((x) => x.id === o.graveId)! : pickOne(s, graves);
      graveFound(s, exp, g, sink);
      break;
    }
  }
}

function fight(s: GameState, exp: Expedition, enc: Encounter, sink: EventSink): CombatOutcome {
  const [lo, hi] = monsterStats(enc.monsterId).count;
  exp.sightings[enc.monsterId] = (exp.sightings[enc.monsterId] ?? 0) + 1;
  sink.emit({
    type: 'COMBAT_STARTED',
    expeditionId: exp.id,
    level: enc.depth,
    monsterId: enc.monsterId,
    count: rollInt(s, lo, hi),
    boss: enc.boss,
    guardian: enc.guardian,
  });
  const result = resolveCombat(s, exp, enc, sink);
  if (result.outcome === 'won') {
    sink.emit({ type: 'COMBAT_WON', expeditionId: exp.id, level: enc.depth, monsterId: enc.monsterId, rounds: result.rounds, boss: enc.boss });
    const l = level(s, enc.depth);
    l.population = Math.max(0, l.population - balance.expedition.populationPerWin);
  }
  exp.wardActive = false;
  return result.outcome;
}

function bossFight(s: GameState, exp: Expedition, sink: EventSink): void {
  const l = level(s, exp.level);
  const boss = bossForBand(bandOf(exp.level));
  if (!exp.wardActive && useSupply(s, exp, 'ward', members(s, exp)[0]?.id ?? null, sink)) exp.wardActive = true;
  const enc: Encounter = {
    monsterId: boss.id,
    threat: bossThreat(s, exp.level),
    hpMult: bossHpMult(exp.level),
    boss: true,
    guardian: false,
    depth: exp.level,
  };
  const deathsBefore = exp.deaths;
  const [lo, hi] = monsterStats(enc.monsterId).count;
  exp.sightings[boss.id] = (exp.sightings[boss.id] ?? 0) + 1;
  sink.emit({ type: 'COMBAT_STARTED', expeditionId: exp.id, level: exp.level, monsterId: boss.id, count: rollInt(s, lo, hi), boss: true, guardian: false });
  const result = resolveCombat(s, exp, enc, sink);
  exp.wardActive = false;
  if (result.outcome === 'won') {
    l.bossAlive = false;
    sink.emit({ type: 'COMBAT_WON', expeditionId: exp.id, level: exp.level, monsterId: boss.id, rounds: result.rounds, boss: true });
    const killerId = exp.lastKillerId ?? members(s, exp)[0].id;
    sink.emit({ type: 'BOSS_KILLED', expeditionId: exp.id, level: exp.level, monsterId: boss.id, killerId });
    s.record.bossesKilled += 1;
    changeReputation(s, balance.reputation.bossKill);
    treasure(s, exp, balance.dungeon.bossLootMult, false, sink);
    if (isSourceLevel(exp.level)) {
      s.status = 'won';
      sink.emit({ type: 'GAME_WON', adventurerId: killerId, generation: s.generation });
      return;
    }
    checkObjective(s, exp, sink);
    return;
  }
  // A boss fight gone wrong weighs on the keeper.
  if (result.outcome === 'wiped' || exp.deaths > deathsBefore) keeperShock(s, 'bossFail', null, sink);
  if (result.outcome !== 'wiped') turnBack(s, exp, 'boss', sink);
}

function trap(s: GameState, exp: Expedition, sink: EventSink): void {
  const c = balance.combat;
  const e = balance.expedition;
  const ms = members(s, exp);
  const light = exp.lightLevel === exp.level ? balance.items.lightTrapBonus : 0;
  const best = Math.max(...ms.map((a) => trapSenseOf(s, a))) + light;
  const difficulty = c.trapDifficultyBase + exp.level * c.trapDifficultyPerLevel + rollRange(s, 0, e.trapRollMax);
  const victim = pickOne(s, ms);
  if (best >= difficulty) {
    sink.emit({ type: 'TRAP', expeditionId: exp.id, level: exp.level, adventurerId: victim.id, spotted: true, damage: 0 });
    return;
  }
  const dmg = Math.round(maxHp(s, victim) * c.trapDamageFrac * rollRange(s, e.trapDamageRollMin, e.trapDamageRollMax) * traitMult(victim, 'damageTaken'));
  sink.emit({ type: 'TRAP', expeditionId: exp.id, level: exp.level, adventurerId: victim.id, spotted: false, damage: dmg });
  damageMember(s, exp, victim, dmg, exp.level, 'a trap', sink);
}

function rollLootKind(s: GameState): ItemKind {
  if (roll(s, balance.expedition.lootScrollChance)) return pickOne(s, [...SCROLL_KINDS, ...CONSUMABLE_KINDS]);
  return pickOne(s, GEAR_KINDS);
}

function treasure(s: GameState, exp: Expedition, mult: number, vault: boolean, sink: EventSink): void {
  const d = balance.dungeon;
  const e = balance.expedition;
  const lm = lootMult(s, exp);
  const gold = Math.round(levelThreat(s, exp.level) * d.goldPerThreat * rollRange(s, d.goldRollMin, d.goldRollMax) * lm * mult);
  exp.lootGold += gold;
  let itemId: string | null = null;
  const lucky = members(s, exp).some((a) => has(a, 'lucky')) ? balance.traitExtras.luckyItemChance : 1;
  if (roll(s, Math.min(1, d.itemChance * lucky * mult))) {
    const identify = useSupplyQuietly(s, exp, 'identify') ? balance.items.identifyTierBonus : 0;
    const tier = clamp(
      Math.round(1 + (bandOf(exp.level) - 1) * d.itemTierPerBand + rollRange(s, e.lootTierRollMin, e.lootTierRollMax) + identify),
      1,
      3,
    );
    itemId = createItem(s, rollLootKind(s), tier);
    exp.lootItemIds.push(itemId);
  }
  for (const a of members(s, exp)) changeMorale(a, balance.morale.treasure);
  sink.emit({ type: 'TREASURE', expeditionId: exp.id, level: exp.level, gold, itemId, vault });
}

function useSupplyQuietly(s: GameState, exp: Expedition, kind: ItemKind): boolean {
  const idx = exp.supplyIds.findIndex((id) => s.items[id]?.kind === kind);
  if (idx < 0) return false;
  const [id] = exp.supplyIds.splice(idx, 1);
  delete s.items[id];
  return true;
}

function rest(s: GameState, exp: Expedition, heal: number, sink: EventSink): void {
  const e = balance.expedition;
  if (partyHp(s, exp).frac >= e.restUseBelow) return;
  let healed = 0;
  for (const a of members(s, exp)) {
    const mhp = maxHp(s, a);
    const before = a.hp;
    a.hp = Math.min(mhp, a.hp + Math.round(mhp * heal));
    healed += a.hp - before;
  }
  exp.hoursToNext += e.restHours;
  sink.emit({ type: 'RESTED', expeditionId: exp.id, level: exp.level, healed });
}

function dungeonEvent(s: GameState, exp: Expedition, sink: EventSink): void {
  const e = balance.expedition;
  const l = level(s, exp.level);
  const unknown = l.features.filter((f) => !l.knownFeatures.includes(f));
  if (unknown.length > 0) {
    const f = pickOne(s, unknown);
    l.knownFeatures.push(f);
    sink.emit({ type: 'FEATURE_FOUND', expeditionId: exp.id, level: exp.level, feature: f });
    useFeature(s, exp, f, sink);
    return;
  }
  // Known features can be revisited.
  if (l.knownFeatures.includes('spring') && partyHp(s, exp).frac < e.restUseBelow) {
    rest(s, exp, balance.dungeon.springHeal, sink);
    return;
  }
  if (l.knownFeatures.includes('shrine') && roll(s, e.shrineRevisitChance)) {
    useFeature(s, exp, 'shrine', sink);
    return;
  }
  const ms = members(s, exp);
  if (roll(s, e.strangerChance) && exp.level < balance.dungeon.levels) {
    // The stranger tells them what lies below: the way through and what's there.
    const next = level(s, exp.level + 1);
    next.stairsKnown = true;
    for (const f of next.features) if (!next.knownFeatures.includes(f)) next.knownFeatures.push(f);
    sink.emit({ type: 'STRANGER', expeditionId: exp.id, level: exp.level, revealedLevel: exp.level + 1 });
    return;
  }
  const good = roll(s, e.omenGoodChance);
  const witness = pickOne(s, ms);
  for (const a of ms) {
    const mult = has(a, 'superstitious') ? balance.traitExtras.superstitiousOmenMult : e.omenOthersFrac;
    changeMorale(a, (good ? 1 : -1) * balance.morale.omen * mult);
  }
  sink.emit({ type: 'OMEN', expeditionId: exp.id, level: exp.level, good, adventurerId: witness.id });
}

function useFeature(s: GameState, exp: Expedition, f: FeatureId, sink: EventSink): void {
  const l = level(s, exp.level);
  switch (f) {
    case 'shrine': {
      for (const a of members(s, exp)) {
        const mhp = maxHp(s, a);
        a.hp = Math.min(mhp, a.hp + Math.round(mhp * balance.expedition.shrineHeal));
        changeMorale(a, balance.morale.shrine);
      }
      sink.emit({ type: 'SHRINE', expeditionId: exp.id, level: exp.level });
      break;
    }
    case 'spring':
      rest(s, exp, balance.dungeon.springHeal, sink);
      break;
    case 'vault':
      if (!l.vaultLooted) {
        l.vaultLooted = true;
        treasure(s, exp, balance.dungeon.vaultGoldMult, true, sink);
      }
      break;
    case 'lair':
      fight(s, exp, ordinaryEncounter(s, exp.level, balance.dungeon.lairThreatMult), sink);
      break;
  }
}

// ---------------------------------------------------------------------------
// Graves

function graveFound(s: GameState, exp: Expedition, g: Grave, sink: EventSink): void {
  const ms = members(s, exp);
  const finder = ms.find((a) => isFriend(a, g.adventurerId)) ?? ms.find((a) => has(a, 'greedy')) ?? pickOne(s, ms);
  sink.emit({ type: 'GRAVE_FOUND', expeditionId: exp.id, level: exp.level, graveId: g.id, finderId: finder.id });

  if (g.legendary && g.guardianAlive) {
    const o = exp.orders.objective;
    const ordered = o.type === 'recover' && o.graveId === g.id;
    const disturb = decide(s, exp, 'lootGrave', ordered, (a) => has(a, 'greedy') || has(a, 'glorySeeker') || ordered, sink);
    if (!disturb) {
      sink.emit({ type: 'GRAVE_LEFT', expeditionId: exp.id, graveId: g.id });
      return;
    }
    const enc: Encounter = {
      monsterId: 'ghost',
      threat: levelThreat(s, exp.level) * balance.dungeon.guardianThreatMult,
      hpMult: balance.dungeon.guardianHpMult,
      boss: false,
      guardian: true,
      depth: exp.level,
    };
    if (fight(s, exp, enc, sink) !== 'won') return;
    g.guardianAlive = false;
  }
  recoverGrave(s, exp, g, finder, sink);
}

function recoverGrave(s: GameState, exp: Expedition, g: Grave, finder: Adventurer, sink: EventSink): void {
  g.recovered = true;
  exp.recoveredGraveIds.push(g.id);
  exp.lootGold += g.gold;
  let keptItemId: string | null = null;
  const items = g.itemIds.slice();
  if (has(finder, 'greedy') && items.length > 0 && roll(s, balance.economy.itemKeepChanceGreedy)) {
    keptItemId = items.shift()!;
    finder.purse += sellPrice(s.items[keptItemId]);
  }
  exp.lootItemIds.push(...items);
  const friend = isFriend(finder, g.adventurerId);
  for (const a of members(s, exp)) {
    if (isFriend(a, g.adventurerId)) changeMorale(a, balance.morale.graveRecoveredFriend);
  }
  if (g.bounty > 0) {
    finder.purse += g.bounty;
    changeLoyalty(finder, balance.loyalty.bountyPaid);
  }
  sink.emit({ type: 'GRAVE_RECOVERED', expeditionId: exp.id, graveId: g.id, finderId: finder.id, friend, keptItemId });
}

// ---------------------------------------------------------------------------
// Going home

function turnBack(s: GameState, exp: Expedition, reason: ReturnReason, sink: EventSink): void {
  if (exp.phase !== 'exploring') return;
  exp.phase = 'returning';
  exp.returnReason = reason;
  sink.emit({ type: 'TURNED_BACK', expeditionId: exp.id, level: exp.level, reason });
  // Deep and hurting: burn a portal scroll rather than walk.
  if (exp.level >= balance.expedition.portalUseMinDepth && hasSupply(s, exp, 'portal')) {
    openPortalHome(s, exp, sink);
    return;
  }
  exp.hoursToNext = balance.dungeon.returnHoursPerLevel;
}

function openPortalHome(s: GameState, exp: Expedition, sink: EventSink): void {
  const lead = members(s, exp)[0];
  useSupply(s, exp, 'portal', lead?.id ?? null, sink);
  const p = balance.portals;
  const existing = portalOnLevel(s, exp.level);
  if (existing) {
    existing.usesLeft = Math.max(existing.usesLeft, p.usesStart);
    existing.expiresHour = s.hour + p.lifeDays * balance.time.hoursPerDay;
    existing.decayed = false;
  } else {
    const id = newId(s, 'p');
    s.portals[id] = {
      id,
      level: exp.level,
      createdHour: s.hour,
      usesLeft: p.usesStart,
      expiresHour: s.hour + p.lifeDays * balance.time.hoursPerDay,
      decayed: false,
    };
  }
  if (exp.level > s.record.deepestPortal) s.record.deepestPortal = exp.level;
  sink.emit({ type: 'PORTAL_OPENED', expeditionId: exp.id, level: exp.level });
  returnHome(s, exp, sink);
}

function returnTick(s: GameState, exp: Expedition, sink: EventSink): void {
  const d = balance.dungeon;
  // A standing portal on this level is the quick way home.
  const portal = portalOnLevel(s, exp.level);
  if (portal && !portal.decayed) {
    portal.usesLeft -= 1;
    returnHome(s, exp, sink);
    return;
  }
  exp.level -= 1;
  if (exp.level <= 0) {
    returnHome(s, exp, sink);
    return;
  }
  exp.hoursToNext = d.returnHoursPerLevel;
  const l = level(s, exp.level);
  if (roll(s, d.returnEncounterChance * l.population)) {
    fight(s, exp, ordinaryEncounter(s, exp.level, d.returnThreatMult), sink);
    useHealing(s, exp, sink);
  }
}

function wipe(s: GameState, exp: Expedition, sink: EventSink): void {
  // Whatever they carried stays with the last of them.
  const lastGrave = Object.values(s.graves)
    .filter((g) => exp.originalMemberIds.includes(g.adventurerId) && g.level === exp.level)
    .sort((a, b) => b.hour - a.hour)[0];
  if (lastGrave) {
    lastGrave.itemIds.push(...exp.lootItemIds, ...exp.supplyIds);
    lastGrave.gold += exp.lootGold;
  } else {
    for (const id of [...exp.lootItemIds, ...exp.supplyIds]) delete s.items[id];
  }
  exp.lootItemIds = [];
  exp.supplyIds = [];
  exp.lootGold = 0;
  exp.phase = 'done';
  sink.emit({ type: 'PARTY_WIPED', expeditionId: exp.id, level: exp.level });
  changeReputation(s, balance.reputation.wipePenalty);
  keeperShock(s, 'wipe', null, sink);
  recordExpedition(s, exp);
  delete s.expeditions[exp.id];
}

function recordExpedition(s: GameState, exp: Expedition): void {
  s.record.expeditions += 1;
  s.record.expeditionsByBand[bandOf(Math.max(1, exp.deepest)) - 1] += 1;
}

function returnHome(s: GameState, exp: Expedition, sink: EventSink): void {
  const econ = balance.economy;
  const ms = members(s, exp);
  exp.phase = 'done';
  exp.level = 0;

  // Split the gold; each survivor gifts a share to the tavern.
  let gifts = 0;
  const share = ms.length > 0 ? Math.floor(exp.lootGold / ms.length) : 0;
  for (const a of ms) {
    let giftFrac = clamp(econ.giftBase + a.loyalty * econ.giftPerLoyalty, 0, 1) * traitMult(a, 'gift');
    giftFrac = clamp(giftFrac, 0, 1);
    const gift = Math.round(share * giftFrac);
    gifts += gift;
    a.purse += share - gift;
    if (gift > 0) changeLoyalty(a, balance.loyalty.giftBonus);
  }
  s.gold += gifts;
  s.record.goldEarned += gifts;

  // Items and unused supplies go to the stash.
  s.stash.push(...exp.lootItemIds, ...exp.supplyIds);

  // Experience, levels, morale, loyalty.
  for (const a of ms) {
    a.status = 'resident';
    a.expeditions += 1;
    a.xp += balance.adventurer.xpSurvivalBonus;
    const gained = applyLevelUps(s, a);
    if (gained > 0) sink.emit({ type: 'LEVEL_UP', expeditionId: exp.id, adventurerId: a.id, level: a.level });
    a.hp = Math.min(a.hp, maxHp(s, a));
    changeMorale(a, balance.morale.returnHome);
    changeLoyalty(a, balance.loyalty.returnSafe);
  }

  // Shared danger makes friends (and, for some, rivals).
  const r = balance.relations;
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i];
      const b = ms[j];
      const wasFriend = isFriend(a, b.id);
      const wasRival = isRival(a, b.id);
      let delta = r.sharedExpedition + (exp.objectiveDone ? r.sharedVictoryBonus : 0);
      if ((has(a, 'quarrelsome') || has(b, 'quarrelsome')) && roll(s, r.quarrelChance)) delta = r.quarrelAmount;
      changeRelation(a, b, delta);
      if (!wasFriend && isFriend(a, b.id)) sink.emit({ type: 'RELATIONSHIP_CHANGED', aId: a.id, bId: b.id, kind: 'friends' });
      if (!wasRival && isRival(a, b.id)) sink.emit({ type: 'RELATIONSHIP_CHANGED', aId: a.id, bId: b.id, kind: 'rivals' });
    }
  }

  // The report home feeds the keeper's memory.
  const scholars = ms.filter((a) => has(a, 'scholarly')).length;
  for (const [monsterId, n] of Object.entries(exp.sightings)) {
    s.journal.sightings[monsterId] = (s.journal.sightings[monsterId] ?? 0) + n + scholars * balance.traitExtras.scholarlyInsight;
  }

  if (exp.objectiveDone) changeReputation(s, balance.reputation.expeditionSuccess);

  sink.emit({
    type: 'PARTY_RETURNED',
    expeditionId: exp.id,
    survivors: ms.map((a) => a.id),
    gold: exp.lootGold,
    itemIds: [...exp.lootItemIds],
    gifts,
    days: Math.max(1, Math.ceil((s.hour - exp.departedHour) / balance.time.hoursPerDay)),
  });
  recordExpedition(s, exp);
  delete s.expeditions[exp.id];
}

export function monsterName(id: string): string {
  return monster(id).name;
}
