// Trait table and behaviour hooks. Numbers live in balance.traits / balance.traitExtras;
// this file names the traits and combines their modifiers for the other systems.

import { balance } from './balance';
import type { Adventurer, TraitId } from './types';

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  opposes: TraitId[]; // traits that can't appear together
}

export const TRAITS: readonly TraitDef[] = [
  { id: 'reckless', name: 'Reckless', description: 'Pushes deeper, ignores retreat thresholds, hits harder.', opposes: ['cowardly'] },
  { id: 'cowardly', name: 'Cowardly', description: 'Retreats early and rarely dies, but brings back less.', opposes: ['reckless', 'brave'] },
  { id: 'greedy', name: 'Greedy', description: 'Keeps more loot, may pocket items, drawn to graves.', opposes: ['kind'] },
  { id: 'loyal', name: 'Loyal', description: 'Follows advice and gives more to the tavern.', opposes: [] },
  { id: 'glorySeeker', name: 'Glory-seeker', description: 'Wants boss kills and ignores orders to hold back.', opposes: ['cowardly'] },
  { id: 'superstitious', name: 'Superstitious', description: 'Swayed by omens. Fights the undead with conviction.', opposes: [] },
  { id: 'kind', name: 'Kind', description: 'Will attempt risky rescues of fallen comrades.', opposes: ['greedy'] },
  { id: 'drinker', name: 'Drinker', description: 'Spends freely at the bar. Poor on the first day out.', opposes: [] },
  { id: 'brave', name: 'Brave', description: 'Holds their nerve when things go badly.', opposes: ['cowardly'] },
  { id: 'stoic', name: 'Stoic', description: 'Morale barely moves, for good or ill.', opposes: [] },
  { id: 'quarrelsome', name: 'Quarrelsome', description: 'Makes rivals easily.', opposes: [] },
  { id: 'lucky', name: 'Lucky', description: 'Finds more, gets hit less.', opposes: [] },
  { id: 'scholarly', name: 'Scholarly', description: 'Maps quickly and remembers what they saw.', opposes: [] },
  { id: 'tough', name: 'Tough', description: 'Hard to put down.', opposes: [] },
];

export const TRAIT_IDS: readonly TraitId[] = TRAITS.map((t) => t.id);

export function traitDef(id: TraitId): TraitDef {
  const t = TRAITS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown trait ${id}`);
  return t;
}

export function has(a: Adventurer, t: TraitId): boolean {
  return a.traits.includes(t);
}

type TraitNumbers = (typeof balance.traits)['reckless'];
type AdditiveKey = 'compliance' | 'retreatMod' | 'pushDeeper';
type MultiplicativeKey = 'damageDealt' | 'damageTaken' | 'loot' | 'gift';

/** Sum an additive trait modifier over the adventurer's traits. */
export function traitSum(a: Adventurer, key: AdditiveKey, opts: { firstDay?: boolean } = {}): number {
  let total = 0;
  for (const t of a.traits) {
    if (t === 'drinker' && !opts.firstDay) continue;
    total += (balance.traits[t] as TraitNumbers)[key];
  }
  return total;
}

/** Multiply a multiplicative trait modifier over the adventurer's traits. */
export function traitMult(a: Adventurer, key: MultiplicativeKey, opts: { firstDay?: boolean } = {}): number {
  let total = 1;
  for (const t of a.traits) {
    if (t === 'drinker' && !opts.firstDay) continue;
    total *= (balance.traits[t] as TraitNumbers)[key];
  }
  return total;
}

/** Scale a morale change by the adventurer's temperament. */
export function moraleScale(a: Adventurer, delta: number): number {
  let d = delta;
  if (has(a, 'stoic')) d *= balance.traitExtras.stoicMoraleMult;
  if (d < 0 && has(a, 'brave')) d *= balance.traitExtras.braveMoraleMult;
  return d;
}
