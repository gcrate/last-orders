// What happens when an adventurer dies in the dungeon: grave, memorial, grief, shocks.

import { balance } from './balance';
import { changeLoyalty, changeMorale, isFavourite, isFriend, isRival } from './adventurers';
import { bandOf } from './dungeon';
import { keeperShock } from './keeper';
import { dayOf } from './time';
import type { Expedition, GameState } from './types';
import { EventSink, newId } from './util';
import { changeReputation } from './reputation';

export function killAdventurer(
  s: GameState,
  exp: Expedition,
  adventurerId: string,
  depth: number,
  cause: string,
  sink: EventSink,
): void {
  const a = s.adventurers[adventurerId];
  if (!a || a.status === 'dead') return;
  a.status = 'dead';
  a.hp = 0;
  a.death = { level: depth, hour: s.hour, cause };
  exp.memberIds = exp.memberIds.filter((id) => id !== adventurerId);
  exp.deaths += 1;

  // The grave keeps their gear, their purse and their share of the party's gold.
  const share = exp.memberIds.length > 0 ? Math.floor(exp.lootGold / (exp.memberIds.length + 1)) : exp.lootGold;
  exp.lootGold -= share;
  const itemIds = [a.equipment.weapon, a.equipment.armour, a.equipment.trinket].filter((x): x is string => !!x);
  a.equipment = { weapon: null, armour: null, trinket: null };
  const graveId = newId(s, 'g');
  s.graves[graveId] = {
    id: graveId,
    adventurerId: a.id,
    name: a.name,
    classId: a.classId,
    level: depth,
    hour: s.hour,
    generation: s.generation,
    itemIds,
    gold: share + a.purse,
    legendary: false,
    guardianAlive: false,
    bounty: 0,
    recovered: false,
  };
  a.purse = 0;

  s.journal.fallen.push({
    adventurerId: a.id,
    name: a.name,
    classId: a.classId,
    level: depth,
    day: dayOf(s.hour - s.generationStartHour),
    generation: s.generation,
    cause,
    adventurerLevel: a.level,
  });

  sink.emit({ type: 'ADVENTURER_DIED', expeditionId: exp.id, adventurerId: a.id, level: depth, cause });

  // Grief in the party and at the tavern.
  const m = balance.morale;
  for (const other of Object.values(s.adventurers)) {
    if (other.status !== 'expedition' && other.status !== 'resident') continue;
    const inParty = exp.memberIds.includes(other.id);
    if (isFriend(other, a.id)) {
      changeMorale(other, m.friendDied);
      changeLoyalty(other, balance.loyalty.friendDied);
    } else if (isRival(other, a.id)) {
      changeMorale(other, m.rivalDied);
    } else if (inParty) {
      changeMorale(other, m.allyDied);
    }
  }

  const band = bandOf(depth);
  s.record.deaths += 1;
  s.record.deathsByBand[band - 1] += 1;
  changeReputation(s, balance.reputation.deathPenalty);

  if (isFavourite(a)) keeperShock(s, 'favourite', a.id, sink);
}
