// Turns engine events into log lines. Each event type has several variants; the variant is
// picked by a hash of the event so the same event always reads the same way, but different
// events of the same type don't all read identically. Short, understated, specific.

import { monster } from '../engine/monsters';
import { hashString } from '../engine/rng';
import { traitDef } from '../engine/traits';
import type { Decision, GameEvent, GameState, Objective, ReturnReason } from '../engine/types';

export type Tone = 'death' | 'bad' | 'good' | 'info' | 'keeper' | 'quiet';

export interface LogLine {
  hour: number;
  text: string;
  tone: Tone;
  expeditionId: string | null;
}

type Vars = Record<string, string | number>;

function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

function choose(e: GameEvent, variants: string[], salt = ''): string {
  const key = `${e.type}|${e.hour}|${JSON.stringify(e)}|${salt}`;
  return variants[hashString(key) % variants.length];
}

function first(s: GameState, id: string | null | undefined): string {
  if (!id) return 'someone';
  const a = s.adventurers[id];
  return a ? a.name.split(' ')[0] : 'someone';
}

function list(names: string[]): string {
  if (names.length === 0) return 'nobody';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function monsterPhrase(id: string, count: number): string {
  const m = monster(id);
  if (m.boss) return m.name;
  if (count <= 1) return /^[aeiou]/i.test(m.name) ? `an ${m.name}` : `a ${m.name}`;
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  return `${words[count] ?? 'a pack of'} ${m.plural}`;
}

export function objectiveText(o: Objective): string {
  switch (o.type) {
    case 'clear':
      return `clear level ${o.level}`;
    case 'push':
      return o.setPortal ? `push to level ${o.level} and set a portal` : `push to level ${o.level}`;
    case 'recover':
      return `recover a grave on level ${o.level}`;
    case 'boss':
      return `hunt the boss of level ${o.level}`;
    case 'scout':
      return `scout level ${o.level}`;
  }
}

const DEFIANCE: Record<Decision, string[]> = {
  retreat: [
    '{name} refused to go on. The others followed.',
    '{name} had seen enough. They turned for home.',
    '"We go back now," said {name}, and nobody argued.',
  ],
  pressOn: [
    '{name} laughed at the idea of turning back.',
    '{name} would not hear of going home yet.',
    'The job was done, but {name} wanted more.',
  ],
  descend: [
    '{name} would not take the stairs. The party turned back.',
    '{name} sat down at the top of the stairs and would not move.',
  ],
  lootGrave: [
    '{name} would not leave the grave alone.',
    '{name} went for the grave, orders or not.',
  ],
  fightBoss: [
    '{name} charged before anyone could stop them.',
    '{name} had not come this far to walk away.',
  ],
  skipBoss: ['{name} would not face it.'],
  rest: ['{name} insisted they rest.'],
};

const COMPLIED: Partial<Record<Decision, string[]>> = {
  retreat: ['{name} grumbled about turning back, but did as they were told.', '{name} wanted to press on. They went home instead.'],
  pressOn: ['{name} looked at the stairs a long time, then turned for home.'],
  fightBoss: ['{name} went pale, but drew their weapon with the others.'],
  lootGrave: ['{name} left the grave undisturbed, as told.'],
};

const RETURN_REASON: Record<ReturnReason, string> = {
  objective: 'Job done, they turned for home.',
  hp: 'Too badly hurt to go on, they turned back.',
  morale: 'Their nerve was gone. They turned back.',
  returnBy: 'Mindful of the day, they started back.',
  supplies: 'Supplies ran low. They started back.',
  boss: 'They fell back from the lair.',
  fear: 'They turned back.',
};

const STAT_NAMES: Record<string, string> = {
  might: 'strength',
  agility: 'footwork',
  wits: 'wits',
  resolve: 'resolve',
  vitality: 'stamina',
};

export function describeEvent(e: GameEvent, s: GameState): LogLine | null {
  const line = (text: string, tone: Tone): LogLine => ({
    hour: e.hour,
    text,
    tone,
    expeditionId: 'expeditionId' in e ? e.expeditionId : null,
  });

  switch (e.type) {
    case 'EVENING':
      return null;
    case 'RECRUITS_ARRIVED': {
      if (e.adventurerIds.length === 0) return null;
      const names = e.adventurerIds.map((id) => first(s, id));
      return line(
        fill(
          choose(e, ['New faces at the bar: {names}.', '{names} came in out of the dusk, looking for work.', 'Tonight at the bar: {names}.']),
          { names: list(names) },
        ),
        'quiet',
      );
    }
    case 'RECRUIT_HIRED':
      return line(fill(choose(e, ['{name} took a room.', '{name} signed on.', 'You gave {name} a key and a warm meal.']), { name: first(s, e.adventurerId) }), 'info');
    case 'RECRUIT_LEFT':
      return null;
    case 'ADVENTURER_DISMISSED':
      return line(`${first(s, e.adventurerId)} packed their things and left.`, 'info');
    case 'ADVENTURER_LEFT':
      return line(
        e.reason === 'broke'
          ? fill(choose(e, ['{name} could not pay for the room and slipped away before dawn.', '{name} left owing you a week of board.']), { name: first(s, e.adventurerId) })
          : fill(choose(e, ['{name} left without saying goodbye.', '{name} found another tavern, and another cause.']), { name: first(s, e.adventurerId) }),
        'bad',
      );
    case 'ADVENTURER_RETIRED':
      return line(
        e.reason === 'age'
          ? fill(choose(e, ['{name} hung up their sword. They will still drink here.', '{name} is too old for the dark now. They said so themselves.']), { name: first(s, e.adventurerId) })
          : fill(choose(e, ['{name} can\'t fight any more. They\'ll stay on and teach.', '{name}\'s hand never healed right. They retired.']), { name: first(s, e.adventurerId) }),
        'info',
      );
    case 'INCOME':
      return null;
    case 'ITEM_BOUGHT':
      return line(`Bought ${s.items[e.itemId]?.name ?? 'something'} for ${e.cost} gold.`, 'quiet');
    case 'ITEM_SOLD':
      return line(`Sold for ${e.gold} gold.`, 'quiet');
    case 'ITEM_UPGRADED':
      return line(`The smith reworked it into ${s.items[e.itemId]?.name ?? 'something better'}.`, 'quiet');
    case 'ITEM_EQUIPPED':
      return null;
    case 'UPGRADE_BOUGHT':
      return line(`The ${upgradeName(e.upgrade)} is improved (tier ${e.tier}).`, 'good');
    case 'BOUNTY_POSTED':
      return line(`You pinned a bounty of ${e.gold} gold to the board for ${s.graves[e.graveId]?.name.split(' ')[0] ?? 'a lost friend'}.`, 'info');
    case 'RUMOUR':
      return line(fill(choose(e, ['Word on the board: there is a {f} on level {level}.', 'A traveller swore there\'s a {f} on level {level}.']), { f: featureName(e.feature), level: e.level }), 'quiet');
    case 'ACTION_REJECTED':
      return line(e.reason, 'quiet');
    case 'RELATIONSHIP_CHANGED':
      return line(
        e.kind === 'friends'
          ? fill(choose(e, ['{a} and {b} have become friends.', '{a} and {b} share a table now.', '{a} saved {b} a seat. They are friends.']), { a: first(s, e.aId), b: first(s, e.bId) })
          : fill(choose(e, ['{a} and {b} can\'t stand each other.', '{a} and {b} have stopped speaking.']), { a: first(s, e.aId), b: first(s, e.bId) }),
        e.kind === 'friends' ? 'good' : 'bad',
      );

    // Keeper
    case 'KEEPER_TRAINED':
      return line(
        fill(choose(e, ['You worked with {name} until your hands shook. Their {stat} improved.', 'You showed {name} what you used to know. It cost you.']), { name: first(s, e.adventurerId), stat: STAT_NAMES[e.stat] }),
        'keeper',
      );
    case 'TRAINER_HIRED':
      return line(
        e.veteranId
          ? `${first(s, e.veteranId)} spent the day drilling ${first(s, e.adventurerId)}.`
          : `A trainer from town drilled ${first(s, e.adventurerId)} for ${e.cost} gold.`,
        'info',
      );
    case 'TONIC_TAKEN':
      return line(choose(e, ['The tonic is bitter. You feel a little better.', 'You drink the tonic. It buys a little time.', 'Another tonic. It helps less than it used to.']), 'keeper');
    case 'HEALER_VISIT':
      return line(`The healer says ${estimateText(e.estimate)}. ${choose(e, ['You pour yourself a drink anyway.', 'You thank them and pay.', 'You don\'t argue.'])}`, 'keeper');
    case 'KEEPER_RESTED':
      return line(choose(e, ['You rest today. The tavern runs itself.', 'You stay by the fire and let the day go.', 'A quiet day. You sleep through most of it.']), 'keeper');
    case 'KEEPER_COUNSELLED':
      return line(choose(e, ['You sat with them until late, telling them what you know.', 'You counselled the party. Your voice gave out before the candle did.']), 'keeper');
    case 'KEEPER_SHOCK':
      if (e.cause === 'favourite') return line(`The news about ${first(s, e.adventurerId)} took something out of you.`, 'keeper');
      if (e.cause === 'wipe') return line(choose(e, ['None of them came back. You did not sleep.', 'A whole party, gone. The cough is worse tonight.']), 'keeper');
      return line('The boss still lives. You feel it in your chest.', 'keeper');
    case 'KEEPER_STAGE':
      return line(
        ['', '', 'You look thinner in the mirror these days.', 'The cough has settled in for good.', 'You can barely climb the stairs now.'][e.stage] ?? '',
        'keeper',
      );
    case 'INSIGHT_UNLOCKED':
      return line(`That sounds like ${monsterPhrase(e.monsterId, 1)}. You remember how to deal with those. (Insight)`, 'good');
    case 'KEEPER_DIED':
      return line('The keeper died in the night.', 'death');
    case 'NEW_GENERATION':
      return line(`${e.years} years later, the tavern opens again.`, 'keeper');
    case 'GAME_WON':
      return line(`${first(s, e.adventurerId)} struck the last blow. The source is dead. The curse is lifted.`, 'good');
    case 'GAME_LOST':
      return line('The last of the line is gone. The tavern stays dark.', 'death');

    // Expeditions
    case 'PARTY_DEPARTED':
      return line(
        fill(
          choose(e, ['{names} set out to {obj}.', '{names} went down the old steps to {obj}.', 'At first light {names} left to {obj}.']),
          { names: list(e.memberIds.map((id) => first(s, id))), obj: objectiveText(e.objective) },
        ) + (e.startLevel > 1 ? ` They stepped through the portal to level ${e.startLevel}.` : ''),
        'info',
      );
    case 'LEVEL_ENTERED':
      if (!e.firstTime) return null;
      return line(fill(choose(e, ['They reached level {level}. Nobody has been this deep in a while.', 'Level {level}. New ground.', 'They came down onto level {level} for the first time.']), { level: e.level }), 'info');
    case 'STAIRS_FOUND':
      return line(fill(choose(e, ['They found the stairs down from level {level}.', 'The way down from level {level} is marked now.']), { level: e.level }), 'quiet');
    case 'STAIRS_HESITATION':
      return line(fill(choose(e, ['{name} hesitated at the stairs to level {level}. Then went down anyway.', '{name} stood at the top of the stairs to level {level} for a long moment.']), { name: first(s, e.adventurerId), level: e.level }), 'quiet');
    case 'COMBAT_STARTED': {
      if (e.boss) return line(fill(choose(e, ['{name} rose to meet them on level {level}.', 'They found {name} waiting on level {level}.']), { name: capital(monster(e.monsterId).name), level: e.level }), 'bad');
      if (e.guardian) return line('A ghost rose from the grave to guard it.', 'bad');
      return null;
    }
    case 'COMBAT_WON':
      if (e.boss) return null;
      if (e.rounds >= 4) return line(fill(choose(e, ['A long, ugly fight with {m} on level {level}. They won it.', 'The {mm} did not go down easily.']), { m: monsterPhrase(e.monsterId, 2), mm: monster(e.monsterId).plural, level: e.level }), 'quiet');
      return null;
    case 'COMBAT_FLED':
      return line(fill(choose(e, ['They broke and ran from the {m}.', 'The {m} drove them back.', 'They got away from the {m}, barely.']), { m: monster(e.monsterId).plural }), 'bad');
    case 'ADVENTURER_WOUNDED':
      return line(
        fill(e.severe ? choose(e, ['{name} is badly hurt.', '{name} went down and got back up, slowly.']) : choose(e, ['{name} took a nasty wound.', '{name} is bleeding.']), { name: first(s, e.adventurerId) }),
        'bad',
      );
    case 'ADVENTURER_DIED':
      return line(
        fill(
          choose(e, ['{name} died on level {level}. {cause}.', '{name} fell on level {level}. {cause}.', 'They lost {name} on level {level}. {cause}.']),
          { name: s.adventurers[e.adventurerId]?.name ?? 'Someone', level: e.level, cause: capital(causeText(e.cause)) },
        ),
        'death',
      );
    case 'RESCUE_ATTEMPT':
      return line(
        fill(
          e.success
            ? choose(e, ['{r} dragged {t} out of the fight.', '{r} threw themselves over {t} and got them clear.'])
            : choose(e, ['{r} went back for {t}, too late.', '{r} tried to reach {t} and was cut down short of them.']),
          { r: first(s, e.rescuerId), t: first(s, e.targetId) },
        ),
        e.success ? 'good' : 'bad',
      );
    case 'ADVENTURER_MAIMED':
      return line(`${first(s, e.adventurerId)} will live, but they won't be the same.`, 'bad');
    case 'TRAP':
      if (e.spotted) return line(fill(choose(e, ['{name} spotted a tripwire and stepped over it.', '{name} found the trap before it found them.']), { name: first(s, e.adventurerId) }), 'quiet');
      return line(fill(choose(e, ['A trap caught {name}.', 'The floor gave way under {name}.', 'Darts from the wall. {name} took the worst of it.']), { name: first(s, e.adventurerId) }), 'bad');
    case 'TREASURE': {
      const item = e.itemId ? s.items[e.itemId] : null;
      if (e.vault) return line(`They broke open a sealed vault: ${e.gold} gold${item ? ` and ${item.name}` : ''}.`, 'good');
      if (item) return line(fill(choose(e, ['They found {item} and {gold} gold.', 'Among the bones: {item}.']), { item: item.name, gold: e.gold }), 'good');
      return null;
    }
    case 'FEATURE_FOUND':
      return line(`They found ${featureName(e.feature, true)} on level ${e.level}.`, 'info');
    case 'SHRINE':
      return line(choose(e, ['They prayed at the old shrine and felt steadier.', 'The shrine was cold, but they left it warmer.']), 'good');
    case 'STRANGER':
      return line(fill(choose(e, ['A stranger in the dark told them the way down through level {level}.', 'They met a hollow-eyed stranger who described level {level} in detail, then was gone.']), { level: e.revealedLevel }), 'info');
    case 'OMEN':
      return line(
        fill(e.good ? choose(e, ['{name} saw a white moth and took it as a good sign.', 'A candle lit itself. {name} smiled.']) : choose(e, ['{name} heard their name whispered from the walls.', 'A crow in the deep. {name} didn\'t like it.']), { name: first(s, e.adventurerId) }),
        'quiet',
      );
    case 'RESTED':
      return null;
    case 'SUPPLY_USED':
      if (e.kind === 'portal' || e.kind === 'rations' || e.kind === 'light' || e.kind === 'torch') return null;
      return line(`${e.adventurerId ? first(s, e.adventurerId) : 'They'} used a ${e.kind === 'potion' ? 'potion' : `${e.kind} scroll`}.`, 'quiet');
    case 'GRAVE_FOUND':
      return null;
    case 'GRAVE_RECOVERED': {
      const g = s.graves[e.graveId];
      const dead = g ? g.name.split(' ')[0] : 'the fallen';
      const finder = first(s, e.finderId);
      if (e.friend) return line(fill(choose(e, ['{f} found {d}\'s grave. They sat with them a while before taking what was left.', '{f} knelt by {d}\'s grave and said something nobody else heard.']), { f: finder, d: dead }), 'good');
      if (e.keptItemId) return line(`${finder} found ${dead}'s grave, and quietly kept something from it.`, 'bad');
      return line(fill(choose(e, ['{f} found {d}\'s grave and gathered what was left.', 'They found {d}\'s grave on the way. {f} took the gear.']), { f: finder, d: dead }), 'info');
    }
    case 'GRAVE_LEFT':
      return line('They left the haunted grave alone.', 'quiet');
    case 'REVIVED':
      return line(`At the shrine, ${first(s, e.adventurerId)} drew breath again.`, 'good');
    case 'DEFIANCE':
      return line(fill(choose(e, DEFIANCE[e.decision]), { name: first(s, e.adventurerId) }), 'bad');
    case 'COMPLIED': {
      const v = COMPLIED[e.decision];
      if (!v || hashString(`${e.hour}${e.adventurerId}`) % 3 !== 0) return null;
      return line(fill(choose(e, v), { name: first(s, e.adventurerId) }), 'quiet');
    }
    case 'DESERTED':
      return line(fill(choose(e, ['{name} slipped away in the night on level {level}.', '{name} left the party on level {level} and went home alone.']), { name: first(s, e.adventurerId), level: e.level }), 'bad');
    case 'LEVEL_CLEARED':
      return line(`Level ${e.level} is clear. For now.`, 'good');
    case 'LEVEL_MAPPED':
      return line(`Level ${e.level} is fully mapped.`, 'good');
    case 'BOSS_KILLED':
      return line(fill(choose(e, ['{killer} killed {boss}.', '{Boss} is dead. {killer} struck the blow.']), { killer: first(s, e.killerId), boss: monster(e.monsterId).name, Boss: capital(monster(e.monsterId).name) }), 'good');
    case 'OBJECTIVE_DONE':
      return null;
    case 'TURNED_BACK':
      return line(`${RETURN_REASON[e.reason]} (level ${e.level})`, e.reason === 'objective' ? 'info' : 'bad');
    case 'PORTAL_OPENED':
      return line(`They read the portal scroll on level ${e.level} and stepped home through the light.`, 'info');
    case 'PARTY_RETURNED': {
      const names = list(e.survivors.map((id) => first(s, id)));
      const loot = e.gold > 0 || e.itemIds.length > 0 ? ` They brought back ${e.gold} gold${e.itemIds.length ? ` and ${e.itemIds.length} item${e.itemIds.length > 1 ? 's' : ''}` : ''}.` : '';
      const gifts = e.gifts > 0 ? ` ${e.gifts} gold for the tavern.` : '';
      return line(`${names} came home after ${e.days} day${e.days > 1 ? 's' : ''}.${loot}${gifts}`, 'info');
    }
    case 'PARTY_WIPED':
      return line(fill(choose(e, ['None of them came back from level {level}.', 'The whole party was lost on level {level}.']), { level: e.level }), 'death');
    case 'LEVEL_UP':
      return line(`${first(s, e.adventurerId)} is level ${e.level} now.`, 'quiet');
  }
  return null;
}

function causeText(cause: string): string {
  if (cause === 'a trap') return 'a trap';
  if (cause === 'alone in the dark') return 'alone in the dark';
  return /^the /.test(cause) ? cause : `${/^[aeiou]/i.test(cause) ? 'an' : 'a'} ${cause}`;
}

export function featureName(f: string, article = false): string {
  const names: Record<string, [string, string]> = {
    shrine: ['shrine', 'an old shrine'],
    spring: ['clean spring', 'a clean spring'],
    vault: ['sealed vault', 'a sealed vault'],
    lair: ['lair', 'a lair'],
  };
  const n = names[f] ?? [f, f];
  return article ? n[1] : n[0];
}

export function upgradeName(u: string): string {
  const names: Record<string, string> = {
    rooms: 'rooms',
    forge: 'forge',
    library: 'library',
    shrine: 'shrine',
    noticeBoard: 'notice board',
    commonRoom: 'common room',
  };
  return names[u] ?? u;
}

/** The healer's phrasing of a day range. */
export function estimateText([lo, hi]: [number, number]): string {
  const phrase = (d: number): string => {
    if (d <= 3) return 'days';
    if (d <= 10) return 'a week or so';
    if (d <= 20) return 'a couple of weeks';
    if (d <= 35) return 'a season';
    if (d <= 60) return 'two seasons';
    if (d <= 90) return 'three seasons';
    return 'a year';
  };
  const a = phrase(lo);
  const b = phrase(hi);
  if (a === b) return `${a}, no more`;
  return `${a}, perhaps ${b === 'days' ? 'less' : b}`;
}

export function traitName(t: Parameters<typeof traitDef>[0]): string {
  return traitDef(t).name;
}
