// The top-level pure step function: step(state, input, hours) => { state, events }.

import { balance } from './balance';
import { dungeonDaily } from './dungeon';
import { expeditionHour, expeditionMidnight } from './expedition';
import { keeperMidnight, keeperShouldDie } from './keeper';
import { applyInput } from './input';
import { hourOfDay } from './time';
import { tavernEvening } from './tavern';
import { keeperDies } from './legacy';
import type { GameState, PlayerInput, StepResult } from './types';
import { EventSink } from './util';

/**
 * Apply an optional player input, then advance the simulation `hours` hours.
 * Pure: the input state is not modified.
 */
export function step(state: GameState, input: PlayerInput | null, hours: number): StepResult {
  const s = structuredClone(state);
  const events = stepInPlace(s, input, hours);
  return { state: s, events };
}

/**
 * Same as step() but mutates `s`. For the balance harness and tests, where cloning every
 * call would be wasteful. UI code must use step().
 */
export function stepInPlace(s: GameState, input: PlayerInput | null, hours: number): StepResult['events'] {
  const sink = new EventSink(s);
  if (input) applyInput(s, input, sink);
  for (let h = 0; h < hours; h++) {
    if (s.status !== 'playing') break;
    advanceHour(s, sink);
  }
  return sink.events;
}

function advanceHour(s: GameState, sink: EventSink): void {
  s.hour += 1;
  const hod = hourOfDay(s.hour);

  // Expeditions move every hour. Sorted by id so the order is stable.
  for (const id of Object.keys(s.expeditions).sort()) {
    const exp = s.expeditions[id];
    if (exp) expeditionHour(s, exp, sink);
    if (s.status !== 'playing') return;
  }

  if (hod === 0) {
    keeperMidnight(s, sink);
    dungeonDaily(s);
    for (const id of Object.keys(s.expeditions).sort()) expeditionMidnight(s, s.expeditions[id], sink);
  }

  if (hod === balance.time.eveningHour) tavernEvening(s, sink);

  if (keeperShouldDie(s)) keeperDies(s, sink);
}
