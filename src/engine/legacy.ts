// The end of a keeper's life and the transition to the next generation.

import { dayOf } from './time';
import type { GameState } from './types';
import { EventSink } from './util';

export function keeperDies(s: GameState, sink: EventSink): void {
  s.keeper.alive = false;
  s.status = 'keeperDead';
  const days = dayOf(s.hour - s.generationStartHour);
  s.record.days = days;
  s.record.causeOfDeath = 'illness';
  sink.emit({ type: 'KEEPER_DIED', generation: s.generation, days });
}
