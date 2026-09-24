# DESIGN.md — Working title: *Last Orders* (TBC)

A tavern-keeper roguelike about indirect control. You are a dying former adventurer who runs a tavern at the mouth of an old dungeon. You can't fight any more. You recruit, equip, advise and send out adventurers, then watch what they do with your advice.

All numbers in this doc are **starting placeholders**. They live in `src/engine/balance.ts` and get tuned with the balance harness (see CLAUDE.md), not by feel.

---

## 1. Pillars

1. **Indirect control.** The player never acts inside the dungeon. Every outcome comes from people the player influences but doesn't control.
2. **The clock.** The keeper is dying. Time is the scarcest resource, and the keeper's own effort costs time off their life.
3. **Stories from simulation.** Traits, relationships and persistent dungeon state should produce memorable moments without scripting. The event log is the main thing the player watches.
4. **Legacy.** Failure passes the cause to the next generation. What you achieved carries forward.

---

## 2. Story frame

- The source of a curse lives on **level 50** of the dungeon. It is alive and it regenerates the dungeon.
- The curse runs in the keeper's bloodline. It shows up as a wasting illness, which is why the keeper has numbered days and why each heir takes up the cause.
- Destroying the source lifts the curse. **Any adventurer can land the final blow.** No family member needs to be present.
- The keeper **never enters the dungeon.** They're too ill. Their power is knowledge, money and influence.

---

## 3. Run structure

- **Generation = run.** One keeper's remaining lifetime.
- When the keeper dies, time skips forward **years** (e.g. 15–25). The heir discovers something of the previous keeper's (see §11), the dungeon has **regrown**, and the heir reopens the tavern.
- **Win:** any adventurer destroys the source on level 50.
- **Loss:** the bloodline ends. Placeholder: **max 5 generations**. The 5th keeper is known to be the last of the line.
- **Target lengths:** a first generation takes 2–4 hours of play. An average player's full win takes 2–4 generations.

---

## 4. Time model

- Continuous simulation time in **in-game hours**. 24 hours = 1 day, 28 days = 1 season, 4 seasons = 1 year.
- Speed controls: **pause, 1×, 2×, 4×**.
- **Auto-pause at evening** (configurable). Evening is when most tavern management happens: new recruits appear, returned parties hand in loot, and the keeper takes actions.
- Expeditions run continuously and can last **multiple days** for deep pushes.
- Parties can return at any hour. The player gets a notification, and the game auto-pauses on important events (death, boss reached, party returned, grave found).

---

## 5. The keeper

### 5.1 The illness clock
- Hidden stat `daysRemaining`. Placeholder start: 120–180 days, rolled per keeper.
- The player never sees the exact number. The **healer's estimate** shows a range ("a season, perhaps two") that narrows as death approaches. Buying a healer visit tightens it.
- Modifiers:
  - Keeper actions that cost effort (§5.2) subtract days.
  - **Rest days** (the keeper does nothing active) slow decline slightly.
  - **Tonics** (bought with gold) add a small number of days, with diminishing returns.
  - **Shocks** subtract days: a favourite adventurer dying, a party wiped out, a boss kill failing badly.
- The keeper's portrait visibly degrades in 4 stages as `daysRemaining` falls.

### 5.2 Keeper actions (the active lever)
| Action | Cost | Effect |
|---|---|---|
| Personal training | days of life | Strong stat or skill gain for one adventurer; builds their loyalty |
| Hire a trainer | gold | Weaker gain than personal training, no life cost |
| Counsel a party | days of life | Before departure: bonus to advice compliance and survival for that expedition |
| Buy tonic | gold | Adds days (diminishing returns) |
| Healer visit | gold | Narrows the illness estimate |
| Rest | a day of inaction | Slows illness slightly |

### 5.3 Keeper knowledge
- The keeper has old adventuring memories. As parties report encounters, new **insights** unlock ("That sounds like a mimic. Tell them to strike the chest first"). Insights give advice bonuses against specific threats.
- Insights and mapped levels go into the **Journal**, which the heir may inherit.

---

## 6. Adventurers

### 6.1 Data model
- **Name, age, portrait** (from the pre-generated pool, see ASSETS.md)
- **Class:** Fighter, Rogue, Cleric, Mage
- **Core stats (1–20):** Might, Agility, Wits, Resolve, Vitality
- **Derived:** HP, attack, defence, spellpower, trap sense
- **Level and XP.** Levels come from surviving expeditions.
- **Traits (1–3)** from a trait table. Examples:
  - *Reckless*: pushes deeper, ignores retreat thresholds, higher damage.
  - *Cowardly*: retreats early, rarely dies, lower loot.
  - *Greedy*: keeps more loot, may pocket gifts, drawn to graves.
  - *Loyal*: follows advice, gifts more.
  - *Glory-seeker*: wants boss kills, ignores "clear level" orders.
  - *Superstitious*: morale effects from omens, bonus vs undead.
  - *Kind*: will attempt risky rescues of fallen comrades.
  - *Drinker*: spends in the tavern (good for income), worse on day 1 of an expedition.
- **Morale (0–100):** changes during expeditions and in the tavern. Low morale leads to retreat or deserting.
- **Loyalty to tavern (0–100):** drives advice compliance and gifting, and whether they stay or leave.
- **Relationships:** a friend or rival value with other adventurers. It forms from shared expeditions and affects party morale, rescue behaviour and grave recovery.

### 6.2 Lifecycle
- **Recruitment:** each evening a few new faces are at the bar. Their quality scales with **tavern reputation** and upgrades. The player recruits them for free or with a signing gold cost at higher tiers.
- **In the tavern:** they pay room and board (income), heal over time and train.
- **Leaving:** loyalty below a threshold means they may leave. Old or maimed adventurers can **retire**, and a retired adventurer can become a trainer.
- **Death:** permanent. Leaves a **grave** on the level where they died (§8.3).

---

## 7. Orders and advice

The player sets these before departure. The adventurers then decide how far to follow them.

**Objective (one):**
- Clear level N
- Push to depth N (optionally: set a portal there)
- Recover grave on level N
- Hunt the boss of level N
- Scout: map the level and return

**Tactics:**
- Stance: Cautious / Balanced / Aggressive
- Retreat threshold: return when party HP drops below X%
- Return-by: come home by day N

**Compliance:** each decision point in the dungeon (go deeper? retreat? loot the grave?) checks a compliance roll against loyalty, traits, morale, keeper counsel and relevant insights. Non-compliance is logged as a story beat ("Brannoc laughed at the idea of turning back").

---

## 8. Dungeon

### 8.1 Structure
- **50 levels** in **5 themed bands of 10.** Placeholder themes:
  1. Old cellars and crypts (1–10)
  2. Fungal caverns (11–20)
  3. Drowned ruins (21–30)
  4. The forge deeps (31–40)
  5. The Heart, where the source lives (41–50)
- A **boss** every 10th level. Level 50 is the source.
- Each level has: danger rating, encounter table, explored %, known features, graves, portal (if any).

### 8.2 Persistence
- Within a generation the dungeon is **persistent**. Cleared levels stay safer for a while and slowly repopulate. Graves and portals stay where they are.
- **Regrowth between generations:** levels regenerate with **higher difficulty** (placeholder +10–15% per generation) and some theme variation. Most graves are gone, but a few persist as **legendary graves** with a ghost guardian and upgraded loot.

### 8.3 Graves
- When an adventurer dies, their equipped items and carried loot are left on that level as a grave.
- A grave can be recovered by later parties: automatically if they pass through and want to, or deliberately with a "recover grave" order.
- Recovered items return to the tavern stash. Friends of the fallen gain morale on recovery. Greedy adventurers may keep items.
- The notice board upgrade lets the player post a **bounty** for recovery.

### 8.4 Portals
- A **portal scroll** used at depth sends the party home instantly and leaves a **portal** on that level.
- Future parties can start their expedition at any portal. Portals decay after a number of uses or days (placeholder) and can be re-established.

---

## 9. Expedition simulation

- A party moves through a level as a sequence of **encounters** drawn from the level's table: combat, trap, treasure, grave, event (shrine, stranger, omen), rest spot, stairs.
- **Combat is auto-resolved** in abstract rounds: party power (stats + gear + level + stance + insights) vs encounter power, with a seeded roll. Damage is distributed across members (weighted by class role). Morale checks happen after each round.
- It's not shown turn by turn. Each encounter produces **1–3 events** for the log.
- After each encounter the party makes decisions: continue, rest, retreat, go down stairs, loot. These are driven by objective, tactics, traits and compliance.
- Deaths create graves. A full party wipe is a shock to the keeper (§5.1).

---

## 10. Economy and tavern

### 10.1 Income
- Room and board from adventurers in residence
- **Gifts:** a share of loot and gold from returning adventurers, scaled by loyalty and traits
- Selling surplus items
- Bar income (scales with the number of residents and certain traits, like *Drinker*)

### 10.2 Spending
- Gear: weapons, armour, trinkets
- Scrolls: portal, healing, light, ward, identify
- Trainers, tonics, healer visits
- Tavern upgrades

### 10.3 Tavern upgrades (each with ~3 tiers)
| Upgrade | Effect |
|---|---|
| Rooms | More resident adventurers, more recruits per evening |
| Forge | Better gear to buy, repair and upgrade items |
| Library | Scrolls to buy, faster insight unlocks |
| Shrine | Revive chance for recently dead (body recovered), morale boost |
| Notice board | Grave-recovery bounties, rumours of level features |
| Common room | Reputation gain, better recruit quality |

### 10.4 Reputation
- Rises with successful expeditions, boss kills and adventurers surviving. Falls with deaths and deserters.
- Drives recruit quality and quantity.

---

## 11. Legacy (between generations)

On the keeper's death, the heir finds **one legacy object**, chosen by what the previous keeper achieved:

| Object | Condition (placeholder) | Effect |
|---|---|---|
| The Journal | Default; richer with more mapped levels | Known map info for mapped levels (danger, features) and all unlocked insights |
| Portal stone | A portal existed at level 20+ | Heir starts with a decayed portal to the previous deepest portal; costly to use |
| The keeper's gear | Reached a band boss | A legendary item for an adventurer |
| Old friends | 3+ adventurers retired alive | Veterans show up as trainers or elite recruits |

The tavern starts **partially restored**: some upgrades survive at reduced tier. Legendary graves from the previous generation exist in the regrown dungeon.

---

## 12. UI screens (v1)

- **Tavern (hub):** keeper portrait and status (illness stage, healer estimate), gold, day/season, speed controls, recruits at the bar, residents, action buttons.
- **Roster:** all adventurers with stats, traits, morale, loyalty, relationships.
- **Party builder:** pick members, equip from the stash, set objective and tactics, counsel option.
- **Depth view:** vertical track of 50 levels showing active parties, portals, graves and explored status. Click a level for details.
- **Event log:** a scrolling story feed, filterable by party. This is the main thing the player watches.
- **Journal:** known levels, insights, the fallen (a memorial list).
- **Generation transition:** death screen, time skip, legacy object reveal.

Rendering: pixel art at integer scale, `image-rendering: pixelated`.

---

## 13. Tone and writing

- The event log is short, understated and specific. It favours character over mechanics.
  - "Mira hesitated at the stairs to level 12. Then she went down anyway."
  - "Brannoc found Tess's grave. He sat with her for a while before taking the sword."
  - "The healer says a season, perhaps less. You pour yourself a drink anyway."
- Events are **data**. Text is produced by a templating layer with several variants per event type, so the same event doesn't read identically every time.

---

## 14. Open questions / deferred

- Balancing of every number in this doc (use the harness).
- Animated sprites on the depth view (later milestone).
- Relationship depth: romances, mentor/apprentice pairs?
- Whether heirs can be different ages or personalities with passive bonuses.
- Band themes and boss designs.
- Sound and music.

### Decisions made during implementation
Minor questions the doc didn't answer, resolved with the simplest option. Revisit freely.

- **Party size** is 1–4 adventurers.
- **Bosses guard the stairs down.** A party can't go below a boss level (10, 20, …) until that boss is dead. Parties sent deeper must fight it; parties with other business on that level only fight it if a glory-seeker insists.
- **Recruits** who aren't hired leave after 2 evenings.
- **Room and board** comes out of each adventurer's own purse (their share of loot). An adventurer who can't pay for 10 days leaves.
- **Loot split:** carried gold is split among survivors on return; each gifts a share to the tavern (loyalty and traits set the share). Found items go to the stash; a greedy finder may pocket one grave item.
- **Portals on the way home:** a returning party that passes a standing portal uses it to get home (costs a use).
- **Desertion:** a member whose morale collapses may leave the party and walk home alone, with a death risk that grows with depth.
- **Rest** marks the rest of today as a rest day; it can't be taken on a day the keeper has already spent effort (training, counsel).
- **Stranger events** reveal the way down through the next level.
