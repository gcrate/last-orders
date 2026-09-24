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

/** Start the next keeper's life. (Generations arrive in milestone 7.) */
export function beginGeneration(s: GameState, sink: EventSink): void {
  if (s.status !== 'keeperDead') return sink.emit({ type: 'ACTION_REJECTED', reason: 'The keeper still lives.' });
  sink.emit({ type: 'ACTION_REJECTED', reason: 'The line ends here, for now.' });
}
