// All game state and event types. State must stay JSON-serializable:
// plain objects, arrays, strings, numbers, booleans, null. Entities refer to each other by ID.

import type { RngState } from './rng';

// ---------------------------------------------------------------------------
// Basics

export type Stat = 'might' | 'agility' | 'wits' | 'resolve' | 'vitality';
export const STATS: readonly Stat[] = ['might', 'agility', 'wits', 'resolve', 'vitality'];

export type ClassId = 'fighter' | 'rogue' | 'cleric' | 'mage';
export const CLASSES: readonly ClassId[] = ['fighter', 'rogue', 'cleric', 'mage'];

export type TraitId =
  | 'reckless'
  | 'cowardly'
  | 'greedy'
  | 'loyal'
  | 'glorySeeker'
  | 'superstitious'
  | 'kind'
  | 'drinker'
  | 'brave'
  | 'stoic'
  | 'quarrelsome'
  | 'lucky'
  | 'scholarly'
  | 'tough';

export type AdventurerStatus =
  | 'recruit' // at the bar, not yet hired
  | 'resident' // lives at the tavern
  | 'expedition' // in the dungeon
  | 'dead'
  | 'retired'
  | 'departed'; // left the tavern (low loyalty, recruit not taken, etc.)

export interface Equipment {
  weapon: string | null;
  armour: string | null;
  trinket: string | null;
}

export interface Adventurer {
  id: string;
  name: string;
  age: number;
  portrait: string; // asset id, e.g. adv_fighter_07
  classId: ClassId;
  stats: Record<Stat, number>;
  level: number;
  xp: number;
  hp: number; // current HP; max is derived
  traits: TraitId[];
  morale: number; // 0-100
  loyalty: number; // 0-100
  relations: Record<string, number>; // adventurerId -> -100 (rival) .. 100 (friend)
  status: AdventurerStatus;
  equipment: Equipment;
  purse: number; // personal gold
  maimed: boolean;
  expeditions: number; // expeditions survived
  kills: number;
  keeperTrained: number; // times personally trained by the keeper
  signingCost: number; // gold to hire (recruits)
  arrivedDay: number;
  generation: number;
  death: { level: number; hour: number; cause: string } | null;
  daysBroke: number;
}

// ---------------------------------------------------------------------------
// Items

export type ItemSlot = 'weapon' | 'armour' | 'trinket' | 'scroll' | 'consumable';
export type EquipSlot = 'weapon' | 'armour' | 'trinket';

export type ItemKind =
  // weapons
  | 'sword'
  | 'axe'
  | 'mace'
  | 'dagger'
  | 'staff'
  | 'bow'
  // armour
  | 'cloth'
  | 'leather'
  | 'plate'
  // trinkets
  | 'ring'
  | 'amulet'
  | 'charm'
  // scrolls
  | 'portal'
  | 'healing'
  | 'light'
  | 'ward'
  | 'identify'
  // consumables
  | 'potion'
  | 'rations'
  | 'torch';

export interface Item {
  id: string;
  kind: ItemKind;
  slot: ItemSlot;
  name: string;
  tier: number; // 1-3 normal, 4 legendary
  attack: number;
  defence: number;
  spell: number;
  trapSense: number;
  hpBonus: number;
  value: number; // base gold value
  legendary: boolean;
  asset: string; // asset id
}

// ---------------------------------------------------------------------------
// Dungeon

export type FeatureId = 'shrine' | 'spring' | 'vault' | 'lair';

export interface Level {
  depth: number; // 1-50
  band: number; // 1-5
  dangerMult: number; // regrowth multiplier (grows each generation)
  population: number; // 0 (cleared) .. 1 (fully populated)
  explored: number; // 0..1
  stairsAt: number; // explored fraction at which the stairs are found
  stairsKnown: boolean;
  mapped: boolean;
  features: FeatureId[];
  knownFeatures: FeatureId[];
  vaultLooted: boolean;
  bossAlive: boolean; // only meaningful on boss levels
  clearedTimes: number;
  visited: boolean;
}

export interface Grave {
  id: string;
  adventurerId: string;
  name: string;
  classId: ClassId;
  level: number;
  hour: number;
  generation: number;
  itemIds: string[];
  gold: number;
  legendary: boolean;
  guardianAlive: boolean;
  bounty: number;
  recovered: boolean;
}

export interface Portal {
  id: string;
  level: number;
  createdHour: number;
  usesLeft: number;
  expiresHour: number;
  decayed: boolean; // inherited via portal stone: costly to use
}

// ---------------------------------------------------------------------------
// Expeditions

export type ObjectiveType = 'clear' | 'push' | 'recover' | 'boss' | 'scout';
export type Stance = 'cautious' | 'balanced' | 'aggressive';

export interface Objective {
  type: ObjectiveType;
  level: number;
  graveId: string | null;
  setPortal: boolean;
}

export interface Orders {
  objective: Objective;
  stance: Stance;
  retreatHp: number; // 0..1 fraction of party max HP
  returnByDay: number | null;
}

export type ExpeditionPhase = 'exploring' | 'returning' | 'done';

export interface Expedition {
  id: string;
  memberIds: string[];
  originalMemberIds: string[];
  orders: Orders;
  counsel: boolean;
  departedHour: number;
  startLevel: number;
  phase: ExpeditionPhase;
  level: number; // current level
  deepest: number;
  hoursToNext: number;
  lootGold: number;
  lootItemIds: string[];
  supplyIds: string[];
  objectiveDone: boolean;
  wardActive: boolean;
  lightLevel: number; // level on which a light source is burning (0 = none)
  daysOut: number;
  sightings: Record<string, number>; // monsterId -> times encountered (the report home)
  returnReason: string | null;
  deaths: number;
  rescueTargetGraveId: string | null;
  lastKillerId: string | null;
  targetLevel: number; // how deep the party means to go (defiance can push it deeper)
  recoveredGraveIds: string[];
  bossDeclined: boolean; // declined an optional boss fight on the current level
}

// ---------------------------------------------------------------------------
// Keeper, tavern, journal

export interface Keeper {
  name: string;
  portrait: string; // asset base, e.g. "keeper" or "heir_1"
  generation: number;
  daysRemaining: number; // hidden
  startDays: number;
  tonicsTaken: number;
  healerVisits: number;
  estimateWidth: number; // fraction of daysRemaining shown as uncertainty
  estimateBias: number; // hidden offset so the estimate's midpoint isn't the truth
  restingUntilHour: number | null;
  lastEffortDay: number;
  restDays: number;
  effortDaysSpent: number;
  alive: boolean;
}

export type UpgradeId = 'rooms' | 'forge' | 'library' | 'shrine' | 'noticeBoard' | 'commonRoom';
export const UPGRADES: readonly UpgradeId[] = ['rooms', 'forge', 'library', 'shrine', 'noticeBoard', 'commonRoom'];

export interface FallenEntry {
  adventurerId: string;
  name: string;
  classId: ClassId;
  level: number;
  day: number;
  generation: number;
  cause: string;
  adventurerLevel: number;
}

export interface Journal {
  insights: string[]; // monster ids with unlocked insights
  sightings: Record<string, number>; // monster id -> reported encounters
  fallen: FallenEntry[];
  inherited: boolean;
}

export type LegacyId = 'journal' | 'portalStone' | 'keepersGear' | 'oldFriends';

export interface GenerationRecord {
  generation: number;
  keeperName: string;
  days: number;
  causeOfDeath: string;
  maxDepth: number;
  levelsCleared: number;
  bossesKilled: number;
  expeditions: number;
  deaths: number;
  deathsByBand: number[];
  expeditionsByBand: number[];
  retiredAlive: number;
  deepestPortal: number;
  goldEarned: number;
  gravesRecovered: number;
  portalsOpened: number;
  revived: number;
  legacy: LegacyId | null;
}

export interface Transition {
  legacy: LegacyId;
  yearsSkipped: number;
  heirName: string;
}

export type GameStatus = 'playing' | 'keeperDead' | 'won' | 'lost';

export interface GameState {
  version: number;
  seed: string;
  rng: RngState;
  nextId: number;
  hour: number; // absolute hours since the first generation began
  generationStartHour: number;
  yearOffset: number; // years added by time skips
  status: GameStatus;
  generation: number;
  keeper: Keeper;
  gold: number;
  reputation: number; // 0-100
  upgrades: Record<UpgradeId, number>;
  stash: string[]; // item ids
  items: Record<string, Item>;
  adventurers: Record<string, Adventurer>;
  expeditions: Record<string, Expedition>;
  levels: Level[]; // index 0 = level 1
  graves: Record<string, Grave>;
  portals: Record<string, Portal>;
  journal: Journal;
  retiredTrainers: string[]; // adventurer ids of retired veterans available as trainers
  record: GenerationRecord; // current generation's running stats
  history: GenerationRecord[];
  transition: Transition | null;
}

// ---------------------------------------------------------------------------
// Player inputs

export type KeeperActionInput =
  | { type: 'TRAIN'; adventurerId: string; stat: Stat }
  | { type: 'HIRE_TRAINER'; adventurerId: string; stat: Stat }
  | { type: 'TONIC' }
  | { type: 'HEALER' }
  | { type: 'REST' };

export type PlayerInput =
  | { type: 'RECRUIT'; adventurerId: string }
  | { type: 'DISMISS'; adventurerId: string }
  | { type: 'EQUIP'; adventurerId: string; itemId: string }
  | { type: 'UNEQUIP'; adventurerId: string; slot: EquipSlot }
  | { type: 'BUY'; kind: ItemKind; tier: number }
  | { type: 'SELL'; itemId: string }
  | { type: 'UPGRADE_ITEM'; itemId: string }
  | {
      type: 'SEND_PARTY';
      memberIds: string[];
      orders: Orders;
      counsel: boolean;
      supplyIds: string[];
      startPortalId: string | null;
    }
  | { type: 'KEEPER'; action: KeeperActionInput }
  | { type: 'BUY_UPGRADE'; upgrade: UpgradeId }
  | { type: 'POST_BOUNTY'; graveId: string; gold: number }
  | { type: 'BEGIN_GENERATION' };

// ---------------------------------------------------------------------------
// Events (data, not text). `hour` is stamped by the engine.

interface Ev {
  hour: number;
}
interface PartyEv extends Ev {
  expeditionId: string;
}

export type GameEvent =
  // time
  | (Ev & { type: 'DAWN'; day: number })
  | (Ev & { type: 'EVENING'; day: number })
  // tavern
  | (Ev & { type: 'RECRUITS_ARRIVED'; adventurerIds: string[] })
  | (Ev & { type: 'RECRUIT_HIRED'; adventurerId: string; cost: number })
  | (Ev & { type: 'RECRUIT_LEFT'; adventurerId: string })
  | (Ev & { type: 'ADVENTURER_DISMISSED'; adventurerId: string })
  | (Ev & { type: 'ADVENTURER_LEFT'; adventurerId: string; reason: 'loyalty' | 'broke' })
  | (Ev & { type: 'ADVENTURER_RETIRED'; adventurerId: string; reason: 'age' | 'maimed' })
  | (Ev & { type: 'INCOME'; roomAndBoard: number; bar: number })
  | (Ev & { type: 'ITEM_BOUGHT'; itemId: string; cost: number })
  | (Ev & { type: 'ITEM_SOLD'; itemId: string; gold: number })
  | (Ev & { type: 'ITEM_UPGRADED'; itemId: string; cost: number })
  | (Ev & { type: 'ITEM_EQUIPPED'; adventurerId: string; itemId: string })
  | (Ev & { type: 'UPGRADE_BOUGHT'; upgrade: UpgradeId; tier: number; cost: number })
  | (Ev & { type: 'BOUNTY_POSTED'; graveId: string; gold: number })
  | (Ev & { type: 'RUMOUR'; level: number; feature: FeatureId })
  | (Ev & { type: 'ACTION_REJECTED'; reason: string })
  | (Ev & { type: 'RELATIONSHIP_CHANGED'; aId: string; bId: string; kind: 'friends' | 'rivals' })
  // keeper
  | (Ev & { type: 'KEEPER_TRAINED'; adventurerId: string; stat: Stat; gain: number; daysCost: number })
  | (Ev & { type: 'TRAINER_HIRED'; adventurerId: string; stat: Stat; gain: number; cost: number; veteranId: string | null })
  | (Ev & { type: 'TONIC_TAKEN'; cost: number })
  | (Ev & { type: 'HEALER_VISIT'; cost: number; estimate: [number, number] })
  | (Ev & { type: 'KEEPER_RESTED' })
  | (Ev & { type: 'KEEPER_COUNSELLED'; expeditionId: string; daysCost: number })
  | (Ev & { type: 'KEEPER_SHOCK'; cause: 'favourite' | 'wipe' | 'bossFail'; adventurerId: string | null })
  | (Ev & { type: 'KEEPER_STAGE'; stage: number })
  | (Ev & { type: 'INSIGHT_UNLOCKED'; monsterId: string })
  | (Ev & { type: 'KEEPER_DIED'; generation: number; days: number })
  | (Ev & { type: 'NEW_GENERATION'; generation: number; legacy: LegacyId; years: number })
  | (Ev & { type: 'GAME_WON'; adventurerId: string; generation: number })
  | (Ev & { type: 'GAME_LOST' })
  // expedition
  | (PartyEv & { type: 'PARTY_DEPARTED'; memberIds: string[]; objective: Objective; startLevel: number })
  | (PartyEv & { type: 'LEVEL_ENTERED'; level: number; firstTime: boolean })
  | (PartyEv & { type: 'STAIRS_FOUND'; level: number })
  | (PartyEv & { type: 'STAIRS_HESITATION'; level: number; adventurerId: string; wentDown: boolean })
  | (PartyEv & { type: 'COMBAT_STARTED'; level: number; monsterId: string; count: number; boss: boolean; guardian: boolean })
  | (PartyEv & { type: 'COMBAT_WON'; level: number; monsterId: string; rounds: number; boss: boolean })
  | (PartyEv & { type: 'COMBAT_FLED'; level: number; monsterId: string })
  | (PartyEv & { type: 'ADVENTURER_WOUNDED'; adventurerId: string; level: number; severe: boolean })
  | (PartyEv & { type: 'ADVENTURER_DIED'; adventurerId: string; level: number; cause: string })
  | (PartyEv & { type: 'RESCUE_ATTEMPT'; rescuerId: string; targetId: string; success: boolean })
  | (PartyEv & { type: 'ADVENTURER_MAIMED'; adventurerId: string })
  | (PartyEv & { type: 'TRAP'; level: number; adventurerId: string; spotted: boolean; damage: number })
  | (PartyEv & { type: 'TREASURE'; level: number; gold: number; itemId: string | null; vault: boolean })
  | (PartyEv & { type: 'FEATURE_FOUND'; level: number; feature: FeatureId })
  | (PartyEv & { type: 'SHRINE'; level: number })
  | (PartyEv & { type: 'STRANGER'; level: number; revealedLevel: number })
  | (PartyEv & { type: 'OMEN'; level: number; good: boolean; adventurerId: string })
  | (PartyEv & { type: 'RESTED'; level: number; healed: number })
  | (PartyEv & { type: 'SUPPLY_USED'; kind: ItemKind; adventurerId: string | null })
  | (PartyEv & { type: 'GRAVE_FOUND'; level: number; graveId: string; finderId: string })
  | (PartyEv & { type: 'GRAVE_RECOVERED'; graveId: string; finderId: string; friend: boolean; keptItemId: string | null })
  | (PartyEv & { type: 'GRAVE_LEFT'; graveId: string })
  | (PartyEv & { type: 'REVIVED'; adventurerId: string })
  | (PartyEv & { type: 'DEFIANCE'; adventurerId: string; decision: Decision })
  | (PartyEv & { type: 'COMPLIED'; adventurerId: string; decision: Decision })
  | (PartyEv & { type: 'DESERTED'; adventurerId: string; level: number })
  | (PartyEv & { type: 'LEVEL_CLEARED'; level: number })
  | (PartyEv & { type: 'LEVEL_MAPPED'; level: number })
  | (PartyEv & { type: 'BOSS_KILLED'; level: number; monsterId: string; killerId: string })
  | (PartyEv & { type: 'OBJECTIVE_DONE'; objective: Objective })
  | (PartyEv & { type: 'TURNED_BACK'; level: number; reason: ReturnReason })
  | (PartyEv & { type: 'PORTAL_OPENED'; level: number })
  | (PartyEv & { type: 'PARTY_RETURNED'; survivors: string[]; lost: number; gold: number; itemIds: string[]; gifts: number; days: number })
  | (PartyEv & { type: 'PARTY_WIPED'; level: number })
  | (PartyEv & { type: 'LEVEL_UP'; adventurerId: string; level: number })
  | (PartyEv & { type: 'LOOT_POCKETED'; adventurerId: string; itemName: string });

export type Decision = 'retreat' | 'pressOn' | 'descend' | 'lootGrave' | 'fightBoss' | 'skipBoss' | 'rest';

export type ReturnReason = 'objective' | 'hp' | 'morale' | 'returnBy' | 'supplies' | 'boss' | 'fear';

export type GameEventType = GameEvent['type'];

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
