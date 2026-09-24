// The tavern: the evening routine, residents, recruitment.

import { balance } from './balance';
import { changeMorale, maxHp, residents } from './adventurers';
import { dayOf } from './time';
import type { GameState } from './types';
import { EventSink } from './util';

/** Evening: residents heal and settle. */
export function tavernEvening(s: GameState, sink: EventSink): void {
  const b = balance.adventurer;
  for (const a of residents(s)) {
    const mhp = maxHp(s, a);
    a.hp = Math.min(mhp, a.hp + Math.round(mhp * b.healPerDay));
    const drift = Math.sign(b.moraleBaseline - a.morale) * Math.min(b.moraleDrift, Math.abs(b.moraleBaseline - a.morale));
    changeMorale(a, drift);
  }
  sink.emit({ type: 'EVENING', day: dayOf(s.hour) });
}
