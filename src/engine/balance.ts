// Every tunable number in the engine lives here. The balance harness overrides these
// values at runtime with overrideBalance(). Numbers are starting placeholders; tune them
// with `npm run sim`, not by feel.

export const DEFAULT_BALANCE = {
  time: {
    hoursPerDay: 24,
    daysPerSeason: 28,
    seasonsPerYear: 4,
    eveningHour: 18,
    dawnHour: 6,
  },

  start: {
    gold: 150,
    reputation: 10,
    residents: 3, // free starting adventurers on day 1
    stash: [
      ['rations', 1, 2],
      ['potion', 1, 2],
    ] as [string, number, number][], // [kind, tier, count]
  },

  keeper: {
    startDaysMin: 120,
    startDaysMax: 180,
    heirAgeMin: 24,
    heirAgeMax: 50,
    restDecline: 0.5, // days of life lost on a rest day instead of 1
    trainDaysCost: 3,
    trainGain: 2,
    trainLoyalty: 12,
    counselDaysCost: 2,
    counselCompliance: 0.2,
    counselPower: 0.1,
    trainerCost: 40,
    trainerGain: 1,
    trainerVeteranBonus: 1, // extra gain from a retired veteran trainer
    tonicCost: 45,
    tonicDays: 6,
    tonicDiminish: 0.75, // each tonic gives this fraction of the previous
    healerCost: 60,
    estimateWidthStart: 0.6, // estimate spans ±this fraction of the real value
    estimateWidthMin: 0.08,
    healerNarrow: 0.55, // each visit multiplies width by this
    estimateNarrowDaily: 0.998, // width narrows slowly on its own
    estimateBiasFrac: 0.5, // hidden offset of the estimate centre, as a fraction of the width
    shockFavourite: 6,
    shockWipe: 8,
    shockBossFail: 5,
    favouriteLoyalty: 80, // loyalty at which an adventurer counts as a favourite
    stageThresholds: [0.75, 0.5, 0.25], // fraction of start days -> stage 2, 3, 4
  },

  adventurer: {
    statMin: 1,
    statMax: 20,
    baseStatMin: 5,
    baseStatMax: 11,
    classPrimaryBonus: 3,
    ageMin: 18,
    ageMax: 46,
    veteranAgeMin: 45,
    retireAge: 58,
    moraleStart: 65,
    moraleBaseline: 65,
    moraleDrift: 6, // per day toward baseline in the tavern
    loyaltyStart: 40,
    loyaltyLeaveThreshold: 15,
    loyaltyLeaveChance: 0.15, // per day when below threshold
    loyaltyDailyDrift: 0.3, // per day toward 50 while resident
    healPerDay: 0.35, // fraction of max HP healed per day in the tavern
    maxTraits: 3,
    traitCountWeights: [
      [1, 5],
      [2, 4],
      [3, 1],
    ] as [number, number][],
    xpPerLevel: 100, // xp needed = xpPerLevel * level
    xpPerThreat: 0.4,
    xpSurvivalBonus: 20, // for returning alive
    levelStatGain: 1, // stat points per level up
    levelPrimaryChance: 0.5, // chance each stat point goes to the class primary
    maxLevel: 30,
    recruitLevelPerRep: 0.05, // extra recruit levels per reputation point
    recruitStatPerRep: 0.04,
    recruitStayDays: 2,
    maimChance: 0.35, // chance a rescued adventurer is maimed
    maimPowerPenalty: 0.2,
    maimedRetireChance: 0.2, // per evening for a maimed resident
    purseStartMin: 5,
    purseStartMax: 30,
  },

  // attackStats / spellStats: how each class mixes its stats before the class multiplier.
  classes: {
    fighter: {
      hpBase: 30, hpPerVit: 3, primary: 'might', role: 1.6, attackMult: 1.1, spellMult: 0, defenceMult: 1.2, trapBonus: 0,
      attackStats: { might: 1 }, spellStats: {},
    },
    rogue: {
      hpBase: 22, hpPerVit: 2.5, primary: 'agility', role: 1.0, attackMult: 1.0, spellMult: 0, defenceMult: 0.9, trapBonus: 6,
      attackStats: { agility: 0.7, might: 0.3 }, spellStats: {},
    },
    cleric: {
      hpBase: 26, hpPerVit: 2.8, primary: 'resolve', role: 1.2, attackMult: 0.6, spellMult: 0.6, defenceMult: 1.0, trapBonus: 0,
      attackStats: { might: 0.5, resolve: 0.5 }, spellStats: { wits: 0.5, resolve: 0.5 },
    },
    mage: {
      hpBase: 18, hpPerVit: 2.2, primary: 'wits', role: 0.7, attackMult: 0.2, spellMult: 1.3, defenceMult: 0.6, trapBonus: 2,
      attackStats: { might: 0.5 }, spellStats: { wits: 1 },
    },
  } as Record<
    'fighter' | 'rogue' | 'cleric' | 'mage',
    {
      hpBase: number; hpPerVit: number; primary: string; role: number; attackMult: number; spellMult: number;
      defenceMult: number; trapBonus: number; attackStats: Record<string, number>; spellStats: Record<string, number>;
    }
  >,

  derived: {
    hpPerLevel: 4,
    powerLevelScale: 0.12, // power multiplier per level above 1
    defenceScale: 0.5, // how much defence counts toward power
    defenceStats: { agility: 0.4, vitality: 0.4 } as Record<string, number>,
    trapStats: { agility: 0.5, wits: 0.5 } as Record<string, number>,
    armourK: 30, // damage reduction = def / (def + armourK)
    clericHealPerRound: 0.03, // fraction of party max HP healed per round by a cleric with spellpower = ref
    clericHealSpellRef: 10,
  },

  items: {
    weaponAttack: [0, 4, 9, 16, 26], // by tier (index 0 unused)
    armourDefence: [0, 5, 11, 19, 30],
    armourHp: [0, 4, 10, 18, 30],
    trinketBonus: [0, 2, 4, 7, 12],
    affinityBonus: 0.25, // weapon of the class's favourite kind
    tierValue: [0, 30, 110, 350, 1200],
    scrollValue: { portal: 90, healing: 50, light: 25, ward: 60, identify: 30 },
    consumableValue: { potion: 20, rations: 6, torch: 4 },
    sellFraction: 0.4,
    upgradeCostFraction: 0.8, // of the next tier's value
    potionHeal: 0.5,
    healingScrollHeal: 0.5,
    wardReduction: 0.5,
    lightExploreBonus: 0.6,
    lightTrapBonus: 6,
    identifyTierBonus: 1,
  },

  shop: {
    // max tier purchasable per forge tier (index = forge tier)
    forgeMaxTier: [1, 2, 3, 3],
    // scrolls purchasable per library tier (index = library tier)
    libraryScrolls: [
      ['light'],
      ['light', 'healing', 'identify'],
      ['light', 'healing', 'identify', 'portal', 'ward'],
      ['light', 'healing', 'identify', 'portal', 'ward'],
    ] as string[][],
    priceMarkup: 1.0,
    libraryDiscount: [1, 1, 0.9, 0.75], // scroll price multiplier per library tier
  },

  party: {
    maxSize: 4,
    minSize: 1,
  },

  dungeon: {
    levels: 50,
    bandSize: 10,
    threatBase: 30,
    threatGrowth: 1.065, // per level
    bossThreatMult: 1.7,
    bossHpMult: 2.2,
    sourceThreatMult: 2.2,
    sourceHpMult: 3.0,
    guardianThreatMult: 1.4,
    guardianHpMult: 1.6,
    threatRollMin: 0.75,
    threatRollMax: 1.5,
    populationFloor: 0.35, // threat multiplier at zero population
    clearPopulation: 0.1,
    repopulatePerDay: 0.02,
    levelSize: 8, // encounters to fully explore a level
    stairsAtMin: 0.25,
    stairsAtMax: 0.75,
    transitEncounterChance: 0.7, // chance of an encounter when passing through a known level (scaled by population)
    hoursPerEncounterMin: 2,
    hoursPerEncounterMax: 4,
    hoursPerTransit: 2,
    returnHoursPerLevel: 3,
    returnEncounterChance: 0.35, // per level on the way back, scaled by population
    returnThreatMult: 0.7,
    featureChance: 0.35, // per feature slot
    featureSlots: 2,
    scoutExploreMult: 1.5,
    encounterWeights: {
      combat: 46,
      trap: 12,
      treasure: 14,
      event: 10,
      rest: 8,
      grave: 10, // only when a grave is on the level
    },
    lairThreatMult: 1.3,
    lairCombatBonus: 15,
    vaultGoldMult: 6,
    springHeal: 0.5,
    goldPerThreat: 0.9,
    combatGoldPerThreat: 0.08, // coin carried by the things they kill
    goldRollMin: 0.5,
    goldRollMax: 1.6,
    itemChance: 0.3,
    itemTierPerBand: 0.55, // expected item tier rises with band
    bossLootMult: 5,
    regrowthMin: 0.1,
    regrowthMax: 0.15,
    legendaryGraveCount: 3,
    legendaryGraveMinLevel: 5, // adventurer level needed to become a legendary grave
    legendaryGraveItemTierBonus: 1,
  },

  expedition: {
    populationPerWin: 0.04, // population removed per won fight
    restHeal: 0.3,
    restHours: 6,
    restUseBelow: 0.9, // party HP fraction below which they bother resting
    shrineHeal: 0.2,
    trapRollMax: 10,
    trapDamageRollMin: 0.5,
    trapDamageRollMax: 1.5,
    lootScrollChance: 0.25, // found items that are scrolls/consumables instead of gear
    lootTierRollMin: -0.5,
    lootTierRollMax: 0.7,
    graveRecoverWeightMult: 4,
    transitGraveChance: 0.35, // per unit of grave draw, when passing through a level
    graveFriendDraw: 1,
    graveBountyDraw: 1,
    portalUseMinDepth: 3, // retreating parties burn a portal scroll at or below this depth
    desertDeathPerLevel: 0.015,
    potionUseBelow: 0.3,
    healingScrollUseBelow: 0.4,
    descendFear: 0.45, // fear above this makes a member want to turn back at the stairs
    hesitationFear: 0.25, // fear above this is worth a hesitation beat
    pressOnMinHp: 0.5,
    omenGoodChance: 0.5,
    shrineRevisitChance: 0.5,
    strangerChance: 0.5, // of a non-feature event being a stranger (else an omen)
    omenOthersFrac: 0.3, // morale effect of omens on the non-superstitious
    fearMoraleRef: 50,
    loyalDesertMult: 0.3,
    desertLoyaltyLoss: -20,
  },

  combat: {
    maxRounds: 8,
    bossRoundsMult: 2, // bosses and guardians fight longer
    fleeAtRetreatFrac: 0.75, // break off a fight at this fraction of the retreat threshold
    recklessFleeMult: 0.5,
    woundedFrac: 0.35, // below this fraction of max HP a member counts as wounded
    severeFrac: 0.15,
    encHpPerThreat: 2.0,
    dmgFrac: 0.15, // fraction of party max HP dealt per round at ratio 1
    rollMin: 0.6,
    rollMax: 1.4,
    hitsPerRound: 1,
    stance: {
      cautious: { dealt: 0.85, taken: 0.8, explore: 0.8 },
      balanced: { dealt: 1.0, taken: 1.0, explore: 1.0 },
      aggressive: { dealt: 1.15, taken: 1.2, explore: 1.2 },
    },
    fleeChance: 0.7, // chance a flee attempt succeeds
    fleeDamage: 0.5, // fraction of a round's damage taken when fleeing
    insightPower: 0.15,
    undeadSuperstitiousBonus: 0.15,
    xpShareAlive: true,
    trapDifficultyBase: 6,
    trapDifficultyPerLevel: 0.35,
    trapDamageFrac: 0.2, // of victim max HP, scaled by depth ratio
    rescueBaseChance: 0.35,
    rescueKindBonus: 0.3,
    rescueFriendBonus: 0.2,
    rescueDamageFrac: 0.25,
    deathSaveAtRetreat: 0.0,
  },

  morale: {
    winFight: 2,
    bossWin: 12,
    allyDied: -15,
    friendDied: -30,
    rivalDied: -3,
    lowHpPerRound: -2,
    fled: -6,
    omen: 10,
    shrine: 10,
    treasure: 2,
    retreatThreshold: 25,
    desertThreshold: 8,
    desertChance: 0.25,
    friendInParty: 4, // per friend, at departure
    rivalInParty: -4,
    graveRecoveredFriend: 12,
    daysOutPenalty: 3, // per day out without rations
    returnHome: 8,
  },

  loyalty: {
    returnSafe: 3,
    giftBonus: 2,
    friendDied: -8,
    counsel: 4,
    bountyPaid: 6,
    defianceLoss: 0,
  },

  relations: {
    sharedExpedition: 6,
    sharedVictoryBonus: 2,
    quarrelChance: 0.25, // per shared expedition if either is quarrelsome
    quarrelAmount: -18,
    friendThreshold: 40,
    rivalThreshold: -30,
    rescueSaved: 25,
  },

  compliance: {
    base: 0.35,
    perLoyalty: 0.005, // per loyalty point
    perMorale: 0.002, // per morale point above 50
    insightBonus: 0.1, // at full insight coverage of the level's monsters
    unreliableLoyalty: 30, // below this the keeper flags an adventurer as unreliable
    warnRetreatAbove: 0.15, // the keeper warns that a reckless member will ignore retreat orders above this
    warnDepthFrom: 5, // the keeper warns that a coward will balk at depths from here
    min: 0.05,
    max: 0.97,
  },

  economy: {
    roomAndBoard: 4, // per resident per day, paid from purse
    barSpend: 2, // per resident per evening, from purse
    drinkerBarMult: 3,
    barPerResidentHouse: 1, // tavern's own bar income per resident per day
    giftBase: 0.25, // fraction of carried gold given to the tavern
    giftPerLoyalty: 0.005,
    itemKeepChanceGreedy: 0.35,
    daysBrokeLeave: 10,
    signingPerLevel: 15,
    signingRepFree: 25, // recruits are free below this reputation
  },

  reputation: {
    max: 100,
    expeditionSuccess: 2,
    bossKill: 8,
    levelCleared: 1,
    deathPenalty: -2,
    wipePenalty: -5,
    desertPenalty: -1,
    dailyDecay: 0.02,
    commonRoomGain: [1, 1.25, 1.5, 1.8],
  },

  recruitment: {
    perEvening: 2,
    perEveningRoomBonus: 1, // per rooms tier
    baseResidents: 6,
    residentsPerRoomTier: 3,
    qualityPerCommonRoomTier: 3, // reputation-equivalent bonus to recruit quality
    repCountBonusEvery: 40, // +1 recruit per this much reputation
  },

  upgrades: {
    maxTier: 3,
    costs: {
      rooms: [200, 550, 1400],
      forge: [250, 700, 1800],
      library: [200, 600, 1500],
      shrine: [300, 800, 2000],
      noticeBoard: [120, 400, 1000],
      commonRoom: [180, 500, 1300],
    },
    shrineReviveChance: [0, 0.25, 0.45, 0.65],
    shrineReviveDays: 10,
    shrineMoraleDrift: [0, 2, 4, 6],
    libraryInsightMult: [1, 0.8, 0.65, 0.5],
    noticeRumourChance: [0, 0.15, 0.25, 0.35], // per day
  },

  insights: {
    sightingsToUnlock: 20,
  },

  // Per-monster threat multiplier, encounter weight and group size (for flavour text).
  monsters: {
    rat: { threat: 0.7, weight: 4, count: [3, 8] },
    skeleton: { threat: 0.9, weight: 4, count: [2, 5] },
    ghoul: { threat: 1.15, weight: 3, count: [1, 3] },
    cultist: { threat: 1.0, weight: 3, count: [2, 4] },
    mimic: { threat: 1.3, weight: 1, count: [1, 1] },
    warden: { threat: 1.0, weight: 0, count: [1, 1] },
    sporeling: { threat: 0.8, weight: 4, count: [3, 7] },
    spider: { threat: 1.0, weight: 3, count: [2, 5] },
    slime: { threat: 1.1, weight: 2, count: [1, 2] },
    troglodyte: { threat: 1.0, weight: 3, count: [2, 5] },
    myconid: { threat: 1.2, weight: 2, count: [1, 3] },
    bloom: { threat: 1.0, weight: 0, count: [1, 1] },
    drowned: { threat: 0.9, weight: 4, count: [2, 6] },
    eels: { threat: 0.85, weight: 3, count: [1, 1] },
    sahuagin: { threat: 1.05, weight: 3, count: [2, 5] },
    siren: { threat: 1.25, weight: 1, count: [1, 2] },
    weird: { threat: 1.15, weight: 2, count: [1, 2] },
    tidewight: { threat: 1.0, weight: 0, count: [1, 1] },
    golem: { threat: 1.25, weight: 2, count: [1, 2] },
    imp: { threat: 0.85, weight: 4, count: [3, 7] },
    duergar: { threat: 1.0, weight: 3, count: [2, 5] },
    salamander: { threat: 1.1, weight: 3, count: [1, 3] },
    hound: { threat: 0.95, weight: 3, count: [2, 4] },
    anvilking: { threat: 1.0, weight: 0, count: [1, 1] },
    horror: { threat: 1.2, weight: 3, count: [1, 2] },
    wraith: { threat: 1.0, weight: 3, count: [1, 4] },
    curseborn: { threat: 0.9, weight: 4, count: [2, 6] },
    crawler: { threat: 0.85, weight: 3, count: [2, 5] },
    hollowknight: { threat: 1.15, weight: 2, count: [1, 3] },
    source: { threat: 1.0, weight: 0, count: [1, 1] },
    ghost: { threat: 1.0, weight: 0, count: [1, 1] },
  } as Record<string, { threat: number; weight: number; count: [number, number] }>,

  portals: {
    usesStart: 5,
    lifeDays: 30,
    decayedUses: 2,
    decayedCost: 150,
  },

  generation: {
    maxGenerations: 5,
    yearsMin: 15,
    yearsMax: 25,
    upgradeTierLoss: 1,
    reputationCarry: 0.3,
    journalLevelsKept: true,
    portalStoneMinLevel: 20,
    oldFriendsMinRetired: 3,
    oldFriendsCount: 3,
    oldFriendsLevelBonus: 3,
  },

  traits: {
    reckless: { compliance: -0.1, retreatMod: -0.25, damageDealt: 1.12, damageTaken: 1.08, loot: 1, gift: 1, pushDeeper: 0.25 },
    cowardly: { compliance: 0, retreatMod: 0.25, damageDealt: 0.95, damageTaken: 0.85, loot: 0.8, gift: 1, pushDeeper: -0.3 },
    greedy: { compliance: -0.05, retreatMod: 0, damageDealt: 1, damageTaken: 1, loot: 1.15, gift: 0.4, pushDeeper: 0.05 },
    loyal: { compliance: 0.25, retreatMod: 0, damageDealt: 1, damageTaken: 1, loot: 1, gift: 1.6, pushDeeper: 0 },
    glorySeeker: { compliance: -0.05, retreatMod: -0.1, damageDealt: 1.05, damageTaken: 1, loot: 1, gift: 1, pushDeeper: 0.15 },
    superstitious: { compliance: 0, retreatMod: 0.05, damageDealt: 1, damageTaken: 1, loot: 1, gift: 1, pushDeeper: 0 },
    kind: { compliance: 0.05, retreatMod: 0, damageDealt: 1, damageTaken: 1, loot: 1, gift: 1.2, pushDeeper: 0 },
    drinker: { compliance: -0.05, retreatMod: 0, damageDealt: 0.85, damageTaken: 1.1, loot: 1, gift: 1, pushDeeper: 0 }, // day-1 modifiers
    brave: { compliance: 0, retreatMod: -0.1, damageDealt: 1.05, damageTaken: 1, loot: 1, gift: 1, pushDeeper: 0.1 },
    stoic: { compliance: 0.05, retreatMod: 0, damageDealt: 1, damageTaken: 0.95, loot: 1, gift: 1, pushDeeper: 0 },
    quarrelsome: { compliance: -0.05, retreatMod: 0, damageDealt: 1.03, damageTaken: 1, loot: 1, gift: 0.9, pushDeeper: 0 },
    lucky: { compliance: 0, retreatMod: 0, damageDealt: 1, damageTaken: 0.95, loot: 1.25, gift: 1, pushDeeper: 0 },
    scholarly: { compliance: 0.05, retreatMod: 0.05, damageDealt: 1, damageTaken: 1, loot: 1, gift: 1, pushDeeper: 0 },
    tough: { compliance: 0, retreatMod: -0.05, damageDealt: 1, damageTaken: 0.9, loot: 1, gift: 1, pushDeeper: 0 },
  },
  traitExtras: {
    stoicMoraleMult: 0.5, // morale losses multiplied
    braveMoraleMult: 0.75,
    greedyGraveAttraction: 0.3,
    greedyPocketGift: 0.3,
    glorySeekerBossDrive: 0.4,
    kindRescue: 0.3,
    scholarlyExplore: 1.3,
    scholarlyInsight: 1, // extra sightings reported per sighting
    superstitiousOmenMult: 2,
    toughHpMult: 1.15,
    luckyItemChance: 1.4,
    drinkerMoraleBar: 3,
  },
};

export type Balance = typeof DEFAULT_BALANCE;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** The live balance values the engine reads. Mutated only by overrideBalance/resetBalance. */
export const balance: Balance = deepClone(DEFAULT_BALANCE);

export function resetBalance(): void {
  const fresh = deepClone(DEFAULT_BALANCE);
  for (const key of Object.keys(fresh) as (keyof Balance)[]) {
    (balance as Record<string, unknown>)[key] = fresh[key];
  }
}

/** Set a value by dotted path, e.g. overrideBalance('combat.dmgFrac', 0.08). */
export function overrideBalance(path: string, value: unknown): void {
  const parts = path.split('.');
  let obj: Record<string, unknown> = balance as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = obj[parts[i]];
    if (typeof next !== 'object' || next === null) throw new Error(`Unknown balance path: ${path}`);
    obj = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!(last in obj)) throw new Error(`Unknown balance path: ${path}`);
  obj[last] = value;
}
