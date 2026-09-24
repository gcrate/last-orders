// Dungeon levels, bands, threat, persistence and regrowth.

import { balance } from './balance';
import type { FeatureId, GameState, Grave, Level, Portal } from './types';
import { clamp, rollRange, roll, pickOne } from './util';

export const FEATURES: readonly FeatureId[] = ['shrine', 'spring', 'vault', 'lair'];

export function bandOf(depth: number): number {
  return Math.min(5, Math.floor((depth - 1) / balance.dungeon.bandSize) + 1);
}

export function isBossLevel(depth: number): boolean {
  return depth % balance.dungeon.bandSize === 0;
}

export function isSourceLevel(depth: number): boolean {
  return depth === balance.dungeon.levels;
}

export function level(s: GameState, depth: number): Level {
  const l = s.levels[depth - 1];
  if (!l) throw new Error(`No level ${depth}`);
  return l;
}

function rollFeatures(s: GameState): FeatureId[] {
  const out: FeatureId[] = [];
  for (let i = 0; i < balance.dungeon.featureSlots; i++) {
    if (!roll(s, balance.dungeon.featureChance)) continue;
    const f = pickOne(s, FEATURES);
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

export function createLevel(s: GameState, depth: number, dangerMult: number): Level {
  const d = balance.dungeon;
  return {
    depth,
    band: bandOf(depth),
    dangerMult,
    population: 1,
    explored: 0,
    stairsAt: rollRange(s, d.stairsAtMin, d.stairsAtMax),
    stairsKnown: false,
    mapped: false,
    features: rollFeatures(s),
    knownFeatures: [],
    vaultLooted: false,
    bossAlive: isBossLevel(depth),
    clearedTimes: 0,
    visited: false,
  };
}

export function createLevels(s: GameState): Level[] {
  const out: Level[] = [];
  for (let depth = 1; depth <= balance.dungeon.levels; depth++) out.push(createLevel(s, depth, 1));
  return out;
}

/** Base threat of an ordinary encounter on a level (before monster multiplier and roll). */
export function levelThreat(s: GameState, depth: number): number {
  const d = balance.dungeon;
  const l = level(s, depth);
  const pop = d.populationFloor + (1 - d.populationFloor) * l.population;
  const lair = l.features.includes('lair') ? d.lairThreatMult : 1;
  return d.threatBase * Math.pow(d.threatGrowth, depth - 1) * l.dangerMult * pop * lair;
}

/** Threat of the band boss (or the source) on a boss level. Population does not soften bosses. */
export function bossThreat(s: GameState, depth: number): number {
  const d = balance.dungeon;
  const l = level(s, depth);
  const mult = isSourceLevel(depth) ? d.sourceThreatMult : d.bossThreatMult;
  return d.threatBase * Math.pow(d.threatGrowth, depth - 1) * l.dangerMult * mult;
}

export function bossHpMult(depth: number): number {
  return isSourceLevel(depth) ? balance.dungeon.sourceHpMult : balance.dungeon.bossHpMult;
}

/** Plain-language danger rating 1-5 relative to the level's depth, for the UI. */
export function dangerRating(s: GameState, depth: number): number {
  const l = level(s, depth);
  return clamp(Math.round(1 + l.population * 3 + (l.features.includes('lair') ? 1 : 0)), 1, 5);
}

export function gravesOnLevel(s: GameState, depth: number): Grave[] {
  return Object.values(s.graves).filter((g) => g.level === depth && !g.recovered);
}

export function portalsActive(s: GameState): Portal[] {
  return Object.values(s.portals).filter((p) => p.usesLeft > 0 && p.expiresHour > s.hour);
}

export function portalOnLevel(s: GameState, depth: number): Portal | undefined {
  return portalsActive(s).find((p) => p.level === depth);
}

/** Daily: cleared levels slowly repopulate; worn-out portals disappear. */
export function dungeonDaily(s: GameState): void {
  const d = balance.dungeon;
  for (const l of s.levels) {
    l.population = Math.min(1, l.population + d.repopulatePerDay);
  }
  for (const p of Object.values(s.portals)) {
    if (p.usesLeft <= 0 || p.expiresHour <= s.hour) delete s.portals[p.id];
  }
}

/** Deepest level whose stairs down have been found (so parties can pass through it). */
export function knownDepth(s: GameState): number {
  let depth = 0;
  for (const l of s.levels) {
    if (!l.visited) break;
    depth = l.depth;
    if (!l.stairsKnown) break;
  }
  return depth;
}
