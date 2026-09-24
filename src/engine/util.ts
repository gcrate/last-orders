import type { GameEvent, GameState } from './types';
import { chance, nextFloat, pick, randInt, randRange, shuffle, weighted } from './rng';

// Thin wrappers so engine code can say rand(s) instead of nextFloat(s.rng).

export const rand = (s: GameState): number => nextFloat(s.rng);
export const rollRange = (s: GameState, lo: number, hi: number): number => randRange(s.rng, lo, hi);
export const rollInt = (s: GameState, lo: number, hi: number): number => randInt(s.rng, lo, hi);
export const roll = (s: GameState, p: number): boolean => chance(s.rng, p);
export const pickOne = <T>(s: GameState, items: readonly T[]): T => pick(s.rng, items);
export const pickWeighted = <T>(s: GameState, entries: readonly (readonly [T, number])[]): T =>
  weighted(s.rng, entries);
export const shuffled = <T>(s: GameState, items: readonly T[]): T[] => shuffle(s.rng, items);

export function newId(s: GameState, prefix: string): string {
  const id = `${prefix}${s.nextId}`;
  s.nextId += 1;
  return id;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Distributive Omit so it works across the GameEvent union. */
export type EventInput = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'hour'> : never) : never;

/** Collects events during a step and stamps them with the current hour. */
export class EventSink {
  readonly events: GameEvent[] = [];
  constructor(private readonly s: GameState) {}
  emit(e: EventInput): void {
    this.events.push({ ...e, hour: this.s.hour } as GameEvent);
  }
}
