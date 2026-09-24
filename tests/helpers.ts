import { hashString } from '../src/engine/rng';
import { stepInPlace } from '../src/engine/step';
import type { GameEvent, GameState, Orders, PlayerInput } from '../src/engine/types';

export function stateHash(s: GameState): string {
  return hashString(JSON.stringify(s)).toString(16);
}

export function pushOrders(level: number): Orders {
  return {
    objective: { type: 'push', level, graveId: null, setPortal: false },
    stance: 'balanced',
    retreatHp: 0.4,
    returnByDay: null,
  };
}

/** A tiny scripted player: send idle residents to push a few levels down. */
export function scriptedInput(s: GameState): PlayerInput | null {
  const idle = Object.values(s.adventurers).filter((a) => a.status === 'resident' && a.hp > 0);
  if (idle.length === 0) return null;
  return {
    type: 'SEND_PARTY',
    memberIds: idle.slice(0, 4).map((a) => a.id),
    orders: pushOrders(3),
    counsel: false,
    supplyIds: [],
    startPortalId: null,
  };
}

/** Run `days` days with the scripted player acting once a day. */
export function runDays(s: GameState, days: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let d = 0; d < days; d++) events.push(...stepInPlace(s, scriptedInput(s), 24));
  return events;
}
