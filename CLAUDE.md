# CLAUDE.md

Tavern-keeper roguelike. **DESIGN.md is the spec. ASSETS.md is the art pipeline.** Read both before starting any milestone.

## Stack
- Vite + React + TypeScript (strict mode)
- Vitest for tests
- Plain CSS modules; no UI framework needed
- Canvas only where it earns it (the depth view may start as plain DOM)
- Saves in `localStorage` as versioned JSON

## Architecture rules (non-negotiable)

1. **Engine and UI are separate.** `src/engine/` has zero imports from React or `src/ui/`. The engine must run headless in Node.
2. **The engine is deterministic.** All randomness goes through the seeded RNG in `src/engine/rng.ts` (e.g. sfc32 or mulberry32). **Never use `Math.random()` or `Date.now()` in the engine.** Same seed + same player inputs = identical state.
3. **The simulation is a pure step function:** `step(state, input, hours) => { state, events }`. The UI dispatches player inputs and renders state and events. The UI never mutates game state directly.
4. **All tunable numbers live in `src/engine/balance.ts`.** No magic numbers in engine logic. The balance harness overrides this file's values.
5. **Events are data, not text.** The engine emits typed events (`{ type: 'ADVENTURER_DIED', adventurerId, level, cause }`). `src/text/` turns events into log lines using templates with multiple variants.
6. **State is JSON-serializable** (no classes with methods in state, no Maps/Sets unless serialized explicitly). Save files carry a `version` field; add a migration when the shape changes.
7. **IDs, not references.** Entities refer to each other by ID.

## Layout
```
src/
  engine/
    rng.ts
    balance.ts
    types.ts          # all state + event types
    step.ts           # top-level step function
    time.ts
    keeper.ts         # illness clock, keeper actions
    adventurers.ts    # generation, stats, traits, lifecycle
    traits.ts         # trait table + behavior hooks
    dungeon.ts        # levels, bands, persistence, regrowth
    expedition.ts     # encounter sequencing, decisions, compliance
    combat.ts         # abstract combat resolution
    economy.ts
    tavern.ts         # upgrades, reputation, recruitment
    legacy.ts         # generation transition
  text/
    templates.ts      # event -> log line variants
  ui/
    App.tsx
    screens/          # Tavern, Roster, PartyBuilder, DepthView, Journal, Legacy
    components/
    assets.ts         # manifest loader + placeholder fallback
  save/
    save.ts
tools/
  sim.ts              # balance harness (runs headless)
  placeholders.ts     # generates placeholder PNGs from the manifest
assets/
  manifest.json
  reference/          # approved style references (keeper.png, fighter.png)
  ...                 # final art, filenames per manifest
```

## Balance harness
`npm run sim -- --runs 1000 --seed 42 --policy default` runs full generations headless with a simple scripted player policy and prints a summary:
- generation length (days), keeper cause of death
- max depth reached per generation, levels cleared
- adventurer deaths per expedition, by level band
- gold curve over time
- win rate and generations-to-win

Output a summary table to stdout and optionally CSV to `tools/out/`. Build the harness **early** (milestone 1) and extend it every milestone. Tuning happens here, not in the UI.

## Testing
- Unit tests for engine modules.
- A **determinism test**: run the same seed twice for N simulated days and assert identical state hashes.
- A **save round-trip test**: serialize, deserialize, then step again and get identical results.
- The UI has light testing only; don't over-invest.

## Assets
- The UI loads art through `src/ui/assets.ts` using `assets/manifest.json`.
- If a file is missing, fall back to a generated placeholder (a coloured block plus a label). Development never blocks on art.
- Pixel art renders at integer scale with `image-rendering: pixelated`. Never scale by fractional amounts.
- Art is generated with the PixelLab MCP server's **`create_image_pixen`** tool. Don't use other PixelLab image tools; they produce a different style. See ASSETS.md.
- **Do not call PixelLab to generate assets unless explicitly asked.** Generation costs credits. Use placeholders by default.

## Milestones
Build one at a time. Each ends with passing tests, harness output and a short summary of what changed and what's next.

1. **Sim core.** Types, RNG, balance file, adventurer generation, one dungeon level, combat, a single expedition resolving headless. Harness v0.
2. **Tavern loop.** Recruitment, stash, equip, send, return, gifts, economy. Basic UI: tavern, roster, party builder, event log. Time controls and evening auto-pause.
3. **The dungeon.** 50 levels, bands, bosses, persistence, multi-level expeditions, depth view.
4. **Graves and portals.** Death leaves graves, recovery orders, bounties, portal scrolls and portal starts.
5. **Traits and advice.** Full trait table, orders and tactics, compliance rolls, morale, loyalty, relationships. Text templates with variants.
6. **The keeper.** Illness clock, healer estimate, keeper actions (training, counsel, tonics, rest), insights, journal, portrait stages.
7. **Generations.** Death, time skip, regrowth, legacy objects, partial tavern restore, legendary graves, bloodline limit, win/loss.
8. **Tavern upgrades and polish.** Upgrade tiers, reputation, balancing pass using the harness, save/load UI.
9. **Later.** Animated sprites on the depth view, sound.

## Working style
- Stick to DESIGN.md. If a design question comes up that the doc doesn't answer, **ask** rather than invent. If the answer is minor, pick the simplest option, note it in DESIGN.md §14, and continue.
- Don't balance by feel. Put numbers in `balance.ts` and check them with the harness.
- Prefer boring, readable code over clever abstractions. This is a hobby project that will be picked up and put down.
- Keep dependencies minimal.
