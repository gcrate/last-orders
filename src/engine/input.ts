// Applying player inputs. Every input is validated here; invalid inputs emit ACTION_REJECTED
// and change nothing.

import { balance } from './balance';
import { createExpedition } from './expedition';
import { exertBlocked, keeperAction, spendEffort } from './keeper';
import type { GameState, PlayerInput } from './types';
import { EventSink } from './util';

export function applyInput(s: GameState, input: PlayerInput, sink: EventSink): void {
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });
  if (s.status !== 'playing' && input.type !== 'BEGIN_GENERATION') return reject('The tavern is closed.');

  switch (input.type) {
    case 'SEND_PARTY':
      return sendParty(s, input, sink);
    case 'KEEPER':
      return keeperAction(s, input.action, sink);
    default:
      return reject(`${input.type} is not available yet.`);
  }
}

function sendParty(s: GameState, input: Extract<PlayerInput, { type: 'SEND_PARTY' }>, sink: EventSink): void {
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });
  const ids = Array.from(new Set(input.memberIds));
  if (ids.length < balance.party.minSize || ids.length > balance.party.maxSize) {
    return reject(`A party needs ${balance.party.minSize} to ${balance.party.maxSize} adventurers.`);
  }
  for (const id of ids) {
    const a = s.adventurers[id];
    if (!a || a.status !== 'resident') return reject('Everyone in the party must be staying at the tavern.');
    if (a.hp <= 0) return reject(`${a.name} is in no state to go.`);
  }
  const o = input.orders.objective;
  if (o.level < 1 || o.level > balance.dungeon.levels) return reject('No such level.');
  if (o.type === 'recover') {
    const g = o.graveId ? s.graves[o.graveId] : undefined;
    if (!g || g.recovered || g.level !== o.level) return reject('There is no grave to recover there.');
  }
  const supplyIds = Array.from(new Set(input.supplyIds));
  for (const id of supplyIds) {
    const item = s.items[id];
    if (!s.stash.includes(id) || !item || (item.slot !== 'scroll' && item.slot !== 'consumable')) {
      return reject('Supplies must come from the stash.');
    }
  }

  let startLevel = 1;
  if (input.startPortalId) {
    const p = s.portals[input.startPortalId];
    if (!p || p.usesLeft <= 0 || p.expiresHour <= s.hour) return reject('That portal has gone dark.');
    if (p.level > o.level) return reject('The portal lies below the objective.');
    if (p.decayed && s.gold < balance.portals.decayedCost) return reject('Not enough gold to wake the old portal.');
    startLevel = p.level;
  }
  if (input.counsel) {
    const blocked = exertBlocked(s);
    if (blocked) return reject(blocked);
  }

  // All checks passed: commit.
  if (input.startPortalId) {
    const p = s.portals[input.startPortalId];
    if (p.decayed) s.gold -= balance.portals.decayedCost;
    p.usesLeft -= 1;
  }
  s.stash = s.stash.filter((id) => !supplyIds.includes(id));
  const exp = createExpedition(
    s,
    { memberIds: ids, orders: input.orders, counsel: input.counsel, supplyIds, startLevel },
    sink,
  );
  if (input.counsel) {
    spendEffort(s, balance.keeper.counselDaysCost, sink);
    sink.emit({ type: 'KEEPER_COUNSELLED', expeditionId: exp.id, daysCost: balance.keeper.counselDaysCost });
  }
}
