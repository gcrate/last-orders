// Advice and compliance: how likely an adventurer is to follow the keeper's orders, and the
// keeper's insights (remembered answers to specific threats).

import { balance } from './balance';
import { bandOf, isBossLevel } from './dungeon';
import { MONSTERS, bandMonsters } from './monsters';
import { has, traitSum } from './traits';
import type { Adventurer, GameState, Orders } from './types';
import { EventSink, clamp } from './util';

/** Fraction of a level's usual monsters the keeper has insights about (0..1). */
export function insightCoverage(s: GameState, depth: number): number {
  const pool = bandMonsters(bandOf(depth));
  if (pool.length === 0) return 0;
  return pool.filter((m) => s.journal.insights.includes(m.id)).length / pool.length;
}

/**
 * Chance that `a` follows an order they disagree with. Loyalty, morale, traits, keeper counsel
 * and relevant insights all help.
 */
export function complianceChance(
  s: GameState,
  a: Adventurer,
  opts: { counsel: boolean; depth: number; firstDay: boolean },
): number {
  const c = balance.compliance;
  let p = c.base + a.loyalty * c.perLoyalty + (a.morale - 50) * c.perMorale;
  p += traitSum(a, 'compliance', { firstDay: opts.firstDay });
  if (opts.counsel) p += balance.keeper.counselCompliance;
  // Advice that names the actual threat carries more weight.
  p += c.insightBonus * insightCoverage(s, Math.max(1, opts.depth));
  return clamp(p, c.min, c.max);
}

export type OrderFriction =
  | { kind: 'ignoresRetreat'; adventurerId: string }
  | { kind: 'fearsDepth'; adventurerId: string }
  | { kind: 'wantsBoss'; adventurerId: string; level: number }
  | { kind: 'wantsMore'; adventurerId: string }
  | { kind: 'drawnToGraves'; adventurerId: string }
  | { kind: 'firstDay'; adventurerId: string }
  | { kind: 'unreliable'; adventurerId: string }
  | { kind: 'rivals'; adventurerId: string; otherId: string }
  | { kind: 'friends'; adventurerId: string; otherId: string };

/**
 * The keeper's read on a proposed party and orders: who is likely to push against which
 * part of the advice. Data only; the UI words it.
 */
export function orderFriction(s: GameState, memberIds: string[], orders: Orders): OrderFriction[] {
  const out: OrderFriction[] = [];
  const ms = memberIds.map((id) => s.adventurers[id]).filter(Boolean);
  const o = orders.objective;
  const bossAhead = s.levels.find((l) => l.depth <= o.level && l.bossAlive && isBossLevel(l.depth));
  const gravesAhead = Object.values(s.graves).some((g) => !g.recovered && g.level <= o.level);
  for (const a of ms) {
    if (has(a, 'reckless') && orders.retreatHp > balance.compliance.warnRetreatAbove) out.push({ kind: 'ignoresRetreat', adventurerId: a.id });
    if (has(a, 'cowardly') && (o.level >= balance.compliance.warnDepthFrom || orders.stance === 'aggressive')) out.push({ kind: 'fearsDepth', adventurerId: a.id });
    if (has(a, 'glorySeeker')) {
      if (bossAhead && o.type !== 'boss') out.push({ kind: 'wantsBoss', adventurerId: a.id, level: bossAhead.depth });
      else if (o.type === 'clear' || o.type === 'scout' || o.type === 'recover') out.push({ kind: 'wantsMore', adventurerId: a.id });
    }
    if (has(a, 'greedy') && gravesAhead) out.push({ kind: 'drawnToGraves', adventurerId: a.id });
    if (has(a, 'drinker')) out.push({ kind: 'firstDay', adventurerId: a.id });
    if (a.loyalty < balance.compliance.unreliableLoyalty) out.push({ kind: 'unreliable', adventurerId: a.id });
  }
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const r = ms[i].relations[ms[j].id] ?? 0;
      if (r <= balance.relations.rivalThreshold) out.push({ kind: 'rivals', adventurerId: ms[i].id, otherId: ms[j].id });
      else if (r >= balance.relations.friendThreshold) out.push({ kind: 'friends', adventurerId: ms[i].id, otherId: ms[j].id });
    }
  }
  return out;
}

/** Sightings needed before the keeper recognises a monster. The library speeds this up. */
export function sightingsNeeded(s: GameState): number {
  return Math.max(1, Math.round(balance.insights.sightingsToUnlock * balance.upgrades.libraryInsightMult[s.upgrades.library]));
}

/** Called when a party reports home: unlock any insights whose sightings are now enough. */
export function checkInsights(s: GameState, sink: EventSink): void {
  const need = sightingsNeeded(s);
  for (const m of MONSTERS) {
    if (s.journal.insights.includes(m.id)) continue;
    if ((s.journal.sightings[m.id] ?? 0) >= need) {
      s.journal.insights.push(m.id);
      sink.emit({ type: 'INSIGHT_UNLOCKED', monsterId: m.id });
    }
  }
}
