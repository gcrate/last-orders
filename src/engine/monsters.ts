// Monster catalogue. Names and tags are content; threat multipliers and weights live in
// balance.monsters so the harness can tune them.

import { balance } from './balance';

export type MonsterTag = 'undead' | 'beast' | 'human' | 'aberration' | 'construct' | 'elemental' | 'fungus';

export interface MonsterDef {
  id: string;
  name: string;
  plural: string;
  band: number;
  tags: MonsterTag[];
  boss: boolean;
}

export const MONSTERS: readonly MonsterDef[] = [
  // Band 1: old cellars and crypts
  { id: 'rat', name: 'giant rat', plural: 'giant rats', band: 1, tags: ['beast'], boss: false },
  { id: 'skeleton', name: 'skeleton', plural: 'skeletons', band: 1, tags: ['undead'], boss: false },
  { id: 'ghoul', name: 'ghoul', plural: 'ghouls', band: 1, tags: ['undead'], boss: false },
  { id: 'cultist', name: 'cultist', plural: 'cultists', band: 1, tags: ['human'], boss: false },
  { id: 'mimic', name: 'mimic', plural: 'mimics', band: 1, tags: ['aberration'], boss: false },
  { id: 'warden', name: 'the Crypt Warden', plural: 'the Crypt Warden', band: 1, tags: ['undead'], boss: true },
  // Band 2: fungal caverns
  { id: 'sporeling', name: 'sporeling', plural: 'sporelings', band: 2, tags: ['fungus'], boss: false },
  { id: 'spider', name: 'cave spider', plural: 'cave spiders', band: 2, tags: ['beast'], boss: false },
  { id: 'slime', name: 'grey slime', plural: 'grey slimes', band: 2, tags: ['aberration'], boss: false },
  { id: 'troglodyte', name: 'troglodyte', plural: 'troglodytes', band: 2, tags: ['human'], boss: false },
  { id: 'myconid', name: 'myconid', plural: 'myconids', band: 2, tags: ['fungus'], boss: false },
  { id: 'bloom', name: 'the Mother Bloom', plural: 'the Mother Bloom', band: 2, tags: ['fungus'], boss: true },
  // Band 3: drowned ruins
  { id: 'drowned', name: 'drowned dead', plural: 'drowned dead', band: 3, tags: ['undead'], boss: false },
  { id: 'eels', name: 'eel swarm', plural: 'eel swarms', band: 3, tags: ['beast'], boss: false },
  { id: 'sahuagin', name: 'sahuagin', plural: 'sahuagin', band: 3, tags: ['human'], boss: false },
  { id: 'siren', name: 'siren', plural: 'sirens', band: 3, tags: ['aberration'], boss: false },
  { id: 'weird', name: 'water weird', plural: 'water weirds', band: 3, tags: ['elemental'], boss: false },
  { id: 'tidewight', name: 'the Tidewight', plural: 'the Tidewight', band: 3, tags: ['undead'], boss: true },
  // Band 4: the forge deeps
  { id: 'golem', name: 'iron golem', plural: 'iron golems', band: 4, tags: ['construct'], boss: false },
  { id: 'imp', name: 'fire imp', plural: 'fire imps', band: 4, tags: ['elemental'], boss: false },
  { id: 'duergar', name: 'duergar', plural: 'duergar', band: 4, tags: ['human'], boss: false },
  { id: 'salamander', name: 'salamander', plural: 'salamanders', band: 4, tags: ['elemental'], boss: false },
  { id: 'hound', name: 'clockwork hound', plural: 'clockwork hounds', band: 4, tags: ['construct'], boss: false },
  { id: 'anvilking', name: 'the Anvil King', plural: 'the Anvil King', band: 4, tags: ['construct'], boss: true },
  // Band 5: the Heart
  { id: 'horror', name: 'flesh horror', plural: 'flesh horrors', band: 5, tags: ['aberration'], boss: false },
  { id: 'wraith', name: 'wraith', plural: 'wraiths', band: 5, tags: ['undead'], boss: false },
  { id: 'curseborn', name: 'curse-born', plural: 'curse-born', band: 5, tags: ['aberration'], boss: false },
  { id: 'crawler', name: 'vein crawler', plural: 'vein crawlers', band: 5, tags: ['beast'], boss: false },
  { id: 'hollowknight', name: 'hollow knight', plural: 'hollow knights', band: 5, tags: ['undead'], boss: false },
  { id: 'source', name: 'the Source', plural: 'the Source', band: 5, tags: ['aberration'], boss: true },
  // Grave guardians
  { id: 'ghost', name: 'grave ghost', plural: 'grave ghosts', band: 0, tags: ['undead'], boss: false },
];

const BY_ID: Record<string, MonsterDef> = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

export function monster(id: string): MonsterDef {
  const m = BY_ID[id];
  if (!m) throw new Error(`Unknown monster ${id}`);
  return m;
}

export function bandMonsters(band: number): MonsterDef[] {
  return MONSTERS.filter((m) => m.band === band && !m.boss);
}

export function bossForBand(band: number): MonsterDef {
  const m = MONSTERS.find((x) => x.band === band && x.boss);
  if (!m) throw new Error(`No boss for band ${band}`);
  return m;
}

export function monsterStats(id: string): { threat: number; weight: number; count: [number, number] } {
  return balance.monsters[id] ?? { threat: 1, weight: 1, count: [1, 1] };
}
