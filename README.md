# Last Orders

A tavern-keeper roguelike about indirect control. See `DESIGN.md` for the game, `CLAUDE.md` for the architecture rules and `ASSETS.md` for the art pipeline.

## Running it

```
npm install
npm run dev          # the game, at http://localhost:5173
npm test             # engine tests (vitest)
npm run build        # typecheck and production build
```

`npm run dev` and `npm run build` first generate placeholder art for anything in `assets/manifest.json` that has no real image yet.

## Balance harness

The engine runs headless. The harness plays scripted games and prints summaries:

```
npm run sim                                   # 200 whole campaigns with the default policy
npm run sim -- --runs 1000 --seed 42 --policy cautious
npm run sim -- --mode generation              # first keeper only, more detail
npm run sim -- --mode expedition --depths 1,5,10
npm run sim -- --set combat.dmgFrac=0.2 --set dungeon.threatGrowth=1.06
npm run sim -- --csv                          # also write CSV to tools/out/
npm run sim -- --mode demo --days 60          # write tools/out/demo-save.json
```

Every tunable number lives in `src/engine/balance.ts`; `--set path=value` overrides any of them for a run. Policies are in `tools/policies.ts`.

In dev, `?save=/tools/out/demo-save.json` loads a harness-made save and `?tab=depth` (or `roster`, `party`, `journal`) opens a screen directly.

## Layout

- `src/engine/`: the deterministic simulation. No React, no `Math.random()`, no clock. `step(state, input, hours)` is the only entry point the UI uses.
- `src/text/`: turns engine events into log lines.
- `src/ui/`: React screens.
- `src/save/`: versioned saves with migrations.
- `tools/`: the balance harness and the placeholder generator.
