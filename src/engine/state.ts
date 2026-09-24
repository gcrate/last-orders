// Creating a new game.

import { balance } from './balance';
import { generateAdventurer } from './adventurers';
import { createLevels } from './dungeon';
import { createItem } from './items';
import { createKeeper } from './keeper';
import { FAMILY_NAME, KEEPER_FIRST_NAMES } from './names';
import { seedRng } from './rng';
import type { GameState, GenerationRecord, ItemKind } from './types';
import { pickOne } from './util';

export const STATE_VERSION = 2;

export function emptyRecord(generation: number, keeperName: string): GenerationRecord {
  return {
    generation,
    keeperName,
    days: 0,
    causeOfDeath: '',
    maxDepth: 0,
    levelsCleared: 0,
    bossesKilled: 0,
    expeditions: 0,
    deaths: 0,
    deathsByBand: [0, 0, 0, 0, 0],
    expeditionsByBand: [0, 0, 0, 0, 0],
    retiredAlive: 0,
    deepestPortal: 0,
    goldEarned: 0,
    gravesRecovered: 0,
    portalsOpened: 0,
    revived: 0,
    legacy: null,
  };
}

export function newGame(seed: string | number): GameState {
  const s: GameState = {
    version: STATE_VERSION,
    seed: String(seed),
    rng: seedRng(seed),
    nextId: 1,
    hour: 0,
    generationStartHour: 0,
    yearOffset: 0,
    status: 'playing',
    generation: 1,
    // Filled in below once the RNG is available.
    keeper: null as unknown as GameState['keeper'],
    gold: balance.start.gold,
    reputation: balance.start.reputation,
    upgrades: { rooms: 0, forge: 0, library: 0, shrine: 0, noticeBoard: 0, commonRoom: 0 },
    stash: [],
    items: {},
    adventurers: {},
    expeditions: {},
    levels: [],
    graves: {},
    portals: {},
    journal: { insights: [], sightings: {}, fallen: [], inherited: false },
    retiredTrainers: [],
    record: emptyRecord(1, ''),
    history: [],
    transition: null,
  };
  const name = `${pickOne(s, KEEPER_FIRST_NAMES)} ${FAMILY_NAME}`;
  s.keeper = createKeeper(s, name, 'keeper');
  s.record.keeperName = name;
  s.levels = createLevels(s);
  // The game opens in the morning of day 1.
  s.hour = balance.time.dawnHour;
  s.generationStartHour = 0;
  for (let i = 0; i < balance.start.residents; i++) {
    generateAdventurer(s, { quality: s.reputation, status: 'resident' });
  }
  for (const [kind, tier, count] of balance.start.stash) {
    for (let i = 0; i < count; i++) s.stash.push(createItem(s, kind as ItemKind, tier));
  }
  return s;
}
