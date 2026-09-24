// The end of a keeper's life and the transition to the next generation: time skip,
// regrowth, the legacy object, the partially restored tavern, legendary graves.

import { balance } from './balance';
import { generateAdventurer } from './adventurers';
import { createLegendary, LEGENDARIES, createItem, upgradeItemTier } from './items';
import { createKeeper } from './keeper';
import { FAMILY_NAME, KEEPER_FIRST_NAMES } from './names';
import { emptyRecord } from './state';
import { dayOf, hoursUntil } from './time';
import type { GameState, ItemKind, LegacyId } from './types';
import { UPGRADES } from './types';
import { EventSink, pickOne, rollInt, rollRange } from './util';

const CAUSES: Record<GameState['keeper']['lastLoss'], string> = {
  illness: 'illness',
  effort: 'exhaustion',
  grief: 'grief',
};

/** Which legacy objects the keeper's achievements have earned, best first. */
export function eligibleLegacies(s: GameState): LegacyId[] {
  const g = balance.generation;
  const out: LegacyId[] = [];
  if (s.record.deepestPortal >= g.portalStoneMinLevel) out.push('portalStone');
  if (s.record.retiredAlive >= g.oldFriendsMinRetired) out.push('oldFriends');
  if (s.record.maxDepth >= balance.dungeon.bandSize) out.push('keepersGear');
  out.push('journal');
  return out;
}

export function keeperDies(s: GameState, sink: EventSink): void {
  s.keeper.alive = false;
  const days = dayOf(s.hour - s.generationStartHour);
  s.record.days = days;
  s.record.causeOfDeath = CAUSES[s.keeper.lastLoss];
  sink.emit({ type: 'KEEPER_DIED', generation: s.generation, days });

  if (s.generation >= balance.generation.maxGenerations) {
    s.record.legacy = null;
    s.history.push(s.record);
    s.status = 'lost';
    sink.emit({ type: 'GAME_LOST' });
    return;
  }

  // The heir finds the most remarkable thing the keeper left behind.
  const legacy = eligibleLegacies(s)[0];
  s.record.legacy = legacy;
  const heirName = `${pickOne(s, KEEPER_FIRST_NAMES.filter((n) => !s.keeper.name.startsWith(n)))} ${FAMILY_NAME}`;
  s.transition = {
    legacy,
    yearsSkipped: rollInt(s, balance.generation.yearsMin, balance.generation.yearsMax),
    heirName,
  };
  s.status = 'keeperDead';
}

/** The source is dead. Close the books on this generation. */
export function recordVictory(s: GameState): void {
  s.record.days = dayOf(s.hour - s.generationStartHour);
  s.record.causeOfDeath = '';
  s.history.push(s.record);
  s.status = 'won';
}

/** The heir reopens the tavern. */
export function beginGeneration(s: GameState, sink: EventSink): void {
  const t = s.transition;
  if (s.status !== 'keeperDead' || !t) return sink.emit({ type: 'ACTION_REJECTED', reason: 'The keeper still lives.' });
  const g = balance.generation;
  const prev = s.record;
  s.history.push(prev);

  // Time passes. Everyone from the old days is gone, or old.
  s.yearOffset += t.yearsSkipped;
  s.hour += hoursUntil(s.hour, balance.time.dawnHour);
  s.generationStartHour = s.hour - balance.time.dawnHour;
  s.generation += 1;
  s.expeditions = {};

  const veterans: string[] = [];
  for (const a of Object.values(s.adventurers)) {
    if (a.status === 'dead') continue;
    a.age += t.yearsSkipped;
    if (a.status === 'retired' && a.age <= g.veteranMaxAge) veterans.push(a.id);
    if (a.status !== 'retired') a.status = 'departed';
    a.equipment = { weapon: null, armour: null, trinket: null };
  }
  // Departed strangers are forgotten entirely; the dead and retired stay for the record.
  for (const a of Object.values(s.adventurers)) if (a.status === 'departed') delete s.adventurers[a.id];

  regrowDungeon(s, t.legacy === 'journal');
  keepLegendaryGraves(s, prev.generation);
  s.portals = {};

  // The tavern, half-remembered.
  for (const u of UPGRADES) s.upgrades[u] = Math.max(0, s.upgrades[u] - g.upgradeTierLoss);
  s.gold = balance.start.gold;
  s.reputation = s.reputation * g.reputationCarry;
  s.stash = [];
  s.retiredTrainers = t.legacy === 'oldFriends' ? veterans : [];
  if (t.legacy !== 'journal') {
    s.journal.insights = [];
    s.journal.sightings = {};
  }
  s.journal.inherited = t.legacy === 'journal';
  pruneItems(s);

  // The new keeper.
  s.keeper = createKeeper(s, t.heirName, `heir_${s.generation - 1}`);
  s.record = emptyRecord(s.generation, t.heirName);
  s.status = 'playing';
  s.transition = null;

  // A few hopefuls on the doorstep, and the basic supplies.
  for (let i = 0; i < balance.start.residents; i++) {
    generateAdventurer(s, { quality: s.reputation, status: 'resident' });
  }
  for (const [kind, tier, count] of balance.start.stash) {
    for (let i = 0; i < count; i++) s.stash.push(createItem(s, kind as ItemKind, tier));
  }

  applyLegacy(s, t.legacy, prev.deepestPortal);
  sink.emit({ type: 'NEW_GENERATION', generation: s.generation, legacy: t.legacy, years: t.yearsSkipped });
}

function applyLegacy(s: GameState, legacy: LegacyId, deepestPortal: number): void {
  const g = balance.generation;
  const p = balance.portals;
  switch (legacy) {
    case 'journal':
      break; // handled by regrowDungeon and the kept insights
    case 'portalStone': {
      const id = `p-stone-${s.generation}`;
      s.portals[id] = {
        id,
        level: deepestPortal,
        createdHour: s.hour,
        usesLeft: p.decayedUses,
        expiresHour: s.hour + p.stoneLifeDays * balance.time.hoursPerDay,
        decayed: true,
      };
      break;
    }
    case 'keepersGear': {
      const owned = new Set(Object.values(s.items).filter((i) => i.legendary).map((i) => i.asset));
      const def = LEGENDARIES.find((l) => !owned.has(`legendary_${l.id}`)) ?? LEGENDARIES[0];
      s.stash.push(createLegendary(s, def.id));
      break;
    }
    case 'oldFriends': {
      // Veterans send word; a few of their best students turn up ready to work.
      for (let i = 0; i < g.oldFriendsCount; i++) {
        const a = generateAdventurer(s, {
          quality: s.reputation + g.oldFriendsQualityBonus,
          level: 1 + g.oldFriendsLevelBonus,
          status: 'recruit',
        });
        a.signingCost = 0;
        a.loyalty = Math.max(a.loyalty, g.oldFriendsLoyalty);
      }
      break;
    }
  }
}

/** Between generations the source regrows the dungeon, harder than before. */
function regrowDungeon(s: GameState, keepMaps: boolean): void {
  const d = balance.dungeon;
  for (const l of s.levels) {
    l.dangerMult *= 1 + rollRange(s, d.regrowthMin, d.regrowthMax);
    l.population = 1;
    l.vaultLooted = false;
    l.bossAlive = l.depth % d.bandSize === 0;
    l.clearedTimes = 0;
    const remembered = keepMaps && l.mapped;
    l.visited = false;
    l.explored = remembered ? 1 : 0;
    l.mapped = remembered;
    l.stairsKnown = remembered;
    l.knownFeatures = remembered ? l.features.slice() : [];
  }
}

/**
 * Most graves are lost to the regrowth. The graves of the greatest fallen (and any legendary
 * graves still unclaimed) remain, guarded by their ghosts, their gear grown stranger.
 */
function keepLegendaryGraves(s: GameState, prevGeneration: number): void {
  const d = balance.dungeon;
  const open = Object.values(s.graves).filter((gr) => !gr.recovered);
  const candidates = open
    .filter((gr) => !gr.legendary && gr.generation === prevGeneration)
    .map((gr) => ({ gr, level: s.adventurers[gr.adventurerId]?.level ?? 1 }))
    .filter((x) => x.level >= d.legendaryGraveMinLevel)
    .sort((a, b) => b.level - a.level)
    .slice(0, d.legendaryGraveCount);
  const keep = new Set([...open.filter((gr) => gr.legendary).map((gr) => gr.id), ...candidates.map((x) => x.gr.id)]);
  for (const { gr } of candidates) {
    gr.legendary = true;
    gr.guardianAlive = true;
    gr.gold = Math.round(gr.gold * d.legendaryGraveGoldMult);
    for (const id of gr.itemIds) {
      const item = s.items[id];
      for (let i = 0; item && i < d.legendaryGraveItemTierBonus; i++) upgradeItemTier(item);
    }
  }
  for (const gr of Object.values(s.graves)) {
    if (!keep.has(gr.id)) delete s.graves[gr.id];
  }
}

/** Drop items nothing refers to any more. */
function pruneItems(s: GameState): void {
  const used = new Set<string>(s.stash);
  for (const gr of Object.values(s.graves)) for (const id of gr.itemIds) used.add(id);
  for (const a of Object.values(s.adventurers)) {
    for (const id of [a.equipment.weapon, a.equipment.armour, a.equipment.trinket]) if (id) used.add(id);
  }
  for (const id of Object.keys(s.items)) if (!used.has(id)) delete s.items[id];
}
