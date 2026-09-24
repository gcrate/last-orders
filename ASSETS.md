# ASSETS.md — Art pipeline

## Tool and style
- **Tool:** PixelLab MCP server, **`create_image_pixen`** tool only (the Pixen model). Other PixelLab image tools produce a different style and must not be used.
- **Style references:** `assets/reference/keeper.png` and `assets/reference/fighter.png` (the two approved test portraits). Attach one as the style reference for **every** generation.
- **Look:** fantasy RPG pixel art, muted earthy palette, warm candlelight from the left, dark backgrounds, clean dark outlines.
- **Rendering:** integer scaling only, `image-rendering: pixelated`.

## Prompt template
Keep prompts short and concrete. Always end with the shared style suffix:

```
<subject description>, warm candlelight from left, dark background, muted earthy colors, fantasy RPG style
```

Example (approved):
```
Portrait of an old sick tavern keeper, former adventurer, grey short beard, scar over eyebrow, gaunt pale face, tired determined eyes, wool blanket over shoulders, innkeeper apron, warm candlelight from left, dark background, muted earthy colors, fantasy RPG style
```

For non-portrait assets (items, dungeon backgrounds), swap "warm candlelight from left, dark background" for whatever lighting fits, but keep "muted earthy colors, fantasy RPG style".

## Sizes
| Type | Size |
|---|---|
| Portraits (keeper, heirs, adventurers, bosses) | 64×64 |
| Item icons | 32×32 |
| Grave, portal, status icons | 32×32 |
| Band backgrounds (depth view) | 256×144 |
| Tavern interior | 256×144 |
| UI frames/buttons | as needed, 9-slice where possible |

## Asset list
Filenames go in `assets/manifest.json` as `{ id, file, size, usage, prompt }`. Placeholders are generated for anything missing.

### Keeper and heirs (~8)
- `keeper_stage1..4`: generate stage 1 (the approved portrait), then **inpaint** stages 2–4 with progressively worse illness (paler, more gaunt, darker eyes, blanket pulled tighter, candle lower). Stage 4 is near death.
- `heir_1..4`: a new keeper per generation. Visibly related (same colouring or features), different ages and genders. Each heir will also need illness stages later (inpaint as above).

### Adventurer pool (~80)
- 20 per class (Fighter, Rogue, Cleric, Mage).
- Vary age, gender, build, hair, scars and gear quality (cheap to decent).
- Some older veterans for the "old friends" legacy.
- Files: `adv_fighter_01..20`, `adv_rogue_01..20`, etc.

### Bosses (5)
- One per band boss (levels 10, 20, 30, 40) plus the **source** on level 50. The source should look alive and wrong, tying to the curse.

### Dungeon (≈12)
- 5 band backgrounds: cellars/crypts, fungal caverns, drowned ruins, forge deeps, the Heart.
- Grave marker, legendary grave (with ghost), portal (active), portal (decayed), stairs.

### Tavern (≈4)
- Tavern interior at 3 states: rundown (new generation), restored, prosperous.
- Bar counter/foreground element for the recruits-at-the-bar view.

### Items (≈45)
- Weapons (12): swords, axes, maces, daggers, staves, bows, in 3 quality tiers.
- Armour (9): cloth, leather, plate, in 3 tiers.
- Trinkets (8): rings, amulets, charms.
- Scrolls (6): portal, healing, light, ward, identify, blank.
- Consumables (4): tonic, potion, rations, torch.
- Legendary (6): including the keeper's old sword (the one on the wall in the keeper portrait).

### UI (≈10)
- Panel frames, buttons, icons for gold, day, morale, loyalty, HP.

**Total: roughly 165–175 images.** Check this against the plan's generation limits, and budget extra for rerolls (assume ~2–3× attempts).

## Workflow
1. Generate in batches by category, always attaching a reference image.
2. Save to `assets/` using the manifest filenames.
3. Reject anything whose lighting or palette drifts. Consistency matters more than any single great image.
4. Claude Code generates via `create_image_pixen`, **only when explicitly asked**, one category batch at a time.
5. Before the first batch, inspect `create_image_pixen`'s parameters. If it accepts a style or reference image, always pass `assets/reference/keeper.png`. If it doesn't, rely on the shared style suffix and have the human review the first few outputs against the references before continuing.
6. Generate a small sample (3–5) of each category first and get human approval before generating the rest. Record each approved prompt in the manifest so it can be regenerated.
