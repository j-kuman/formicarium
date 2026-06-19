# Formicarium T20 Balance Dials

This is a structured tuning guide for the current data pass. It focuses on the small set of dials that most directly change pacing, pressure, and recovery feel without requiring simulation code changes.

## Current Snapshot

- `data/tuning.json`
  - `enemySpeedScale`: `30`
  - `ticksPerSecond`: `60`
  - `startingResources`: food `120`, soil `80`, resin `40`
  - `resourceCaps`: food `200`, soil `9999`, resin `9999`
  - `recoveryIncomePer10Ticks`: food `8`, soil `4`, resin `2`
  - `recoveryPhaseDurationTicks`: `120`
  - `buildPhaseDurationTicks`: `300`
- `data/maps/act1_map.json`
  - Queen chamber HP: `200`
- Current Act 1 wave HP curve:
  - Wave 1: `24`
  - Wave 2: `92`
  - Wave 3: `80`
  - Wave 4: `146`
  - Wave 5: `157`
  - Wave 6: `218`
  - Wave 7: `220`
  - Wave 8: `363`
  - Wave 9: `392`
- Current Act 1 queen-threat curve:
  - Wave 1: `0`
  - Wave 2: `20`
  - Wave 3: `24`
  - Wave 4: `20`
  - Wave 5: `54`
  - Wave 6: `76`
  - Wave 7: `84`
  - Wave 8: `114`
  - Wave 9: `172`
  - Cumulative Act 1 queen-threat: `564`

## DIALS

| Dial | Lives in | Current values | Raising it does this | Lowering it does this |
|---|---|---:|---|---|
| Global enemy speed scale | `data/tuning.json` → `enemySpeedScale` | `30` | Compresses arrival times, makes waves feel more urgent, reduces dead air, increases leak danger. | Stretches waves, gives more reaction time, can create waiting/dead-air gaps. |
| Recovery income | `data/tuning.json` → `recoveryIncomePer10Ticks` | food `8`, soil `4`, resin `2` | Makes recovery more forgiving and lets players rebuild after leaks. | Makes damage and poor placement matter more; can create death spirals if too low. |
| Starting resources | `data/tuning.json` → `startingResources` | food `120`, soil `80`, resin `40` | Smooths early-wave onboarding and lets players experiment. | Makes early build choices sharper and more punishing. |
| Resource caps | `data/tuning.json` → `resourceCaps` | food `200`, soil/resin `9999` | Lets players bank more for late spikes. | Forces spend timing and reduces hoarding. |
| Build phase duration | `data/tuning.json` → `buildPhaseDurationTicks` | `300` | Gives more planning time and calmer pacing. | Speeds the loop and increases stress. |
| Recovery phase duration | `data/tuning.json` → `recoveryPhaseDurationTicks` | `120` | Adds breathing room after a wave. | Keeps momentum high and makes consecutive waves feel more intense. |
| Enemy speed | `data/enemies.json` → per-enemy `speed` | Mite `1.8`, Beetle `0.5`, Spider `2.5`, Robber `1.4`, Wasp `2.0` | Makes that enemy arrive sooner and overlap more with other groups. | Makes that enemy lag behind and can create cleanup/dead-air tails. |
| Enemy HP | `data/enemies.json` → per-enemy `hp` | Mite `8`, Beetle `60`, Spider `20`, Robber `18`, Wasp `25` | Increases time-to-clear and defense DPS requirements. | Makes the wave collapse faster once defenses are placed correctly. |
| Enemy armor | `data/enemies.json` → per-enemy `armor` | Beetle `10`, Robber `2`, Pale Borer `5`, Centipede `15`, Boss `20` | Blunts per-hit/per-tick damage and rewards higher-DPS or armor-piercing counters. | Makes low-DPS defenses more broadly effective. |
| Enemy attack | `data/enemies.json` → per-enemy `attack` | Mite `5`, Beetle `20`, Spider `12`, Robber `10`, Wasp `18` | Makes leaks hurt more and increases queen/chamber failure pressure. | Makes leaks more survivable and shifts challenge toward wave clearing. |
| Per-wave enemy count | `data/waves.json` → `spawns[].count` | Wave total counts: `3, 5, 7, 8, 8, 10, 11, 12, 15` | Raises total HP, total reward, screen density, and leak risk. | Lowers density and makes target prioritization less important. |
| Per-wave interval | `data/waves.json` → `spawns[].intervalTicks` | Act 1 ranges from `0` to `180` | Spreads a group out and reduces burst pressure. | Stacks enemies together, increases burst pressure, and makes AoE/slow more valuable. |
| Spawn entrance | `data/waves.json` → `spawns[].entrance` | `entrance_left`, `entrance_center`, `entrance_right` | Changing it can shorten/lengthen paths and shift which defenses matter. | Same; use it to redirect pressure toward underused lanes. |
| Spawn target alias | `data/waves.json` → `spawns[].target` | `brood`, `queen`, `food` | Queen targeting increases direct-loss pressure; brood/food targeting creates colony-management pressure. | Moving queen-targeted spawns to side objectives makes the wave more forgiving. |
| Queen HP | `data/maps/act1_map.json` → queen node `hp`/`maxHp` | `200` | Increases leak tolerance and gives more room for cumulative mistakes. | Makes leaks decisive and raises the chance of no-regen attrition losses. |

## FAILURE-MODE -> FIX

| Failure mode | Primary dial | Direction | Why |
|---|---|---|---|
| Too easy | `waves[].spawns[].count` | Up slightly | Adds HP, density, and reward without changing enemy identity. |
| Too easy | Enemy `attack` on queen-targeted enemies | Up slightly | Makes leaks matter more without making clears slower. |
| Too easy | `enemySpeedScale` or per-enemy `speed` | Up | Reduces reaction time and forces earlier defense value. |
| Too hard | `waves[].spawns[].count` | Down | Reduces total HP and leak volume. |
| Too hard | Enemy `hp`/`armor` | Down | Lets existing defenses clear before enemies leak. |
| Too hard | Recovery income or starting resources | Up | Gives players enough economy to recover from bad early choices. |
| Dead air mid-wave | Slow enemy `speed` | Up | Pulls late stragglers into the main fight window. |
| Dead air mid-wave | `spawns[].intervalTicks` | Down | Compresses groups so enemies overlap instead of trickling in. |
| Dead air mid-wave | Spawn entrance/path length | Shorter path | Prevents one group from arriving far after the others. |
| Queen dies too fast | Queen HP | Up | Adds direct leak tolerance. |
| Queen dies too fast | Queen-targeted enemy `attack` | Down | Reduces damage per leak. |
| Queen dies too fast | Queen-targeted count | Down | Reduces total possible leak damage. |
| Queen dies too fast | Redirect some targets | Queen -> brood/food | Turns instant-loss pressure into colony-objective pressure. |
| Never lose the queen | Queen HP | Down | Makes leaks more meaningful. |
| Never lose the queen | Queen-targeted count/attack | Up | Raises direct failure pressure. |
| Never lose the queen | Recovery income | Down | Makes prior damage harder to erase indirectly through defenses. |

## KNOWN ISSUES

### Beetle Tank timing is desynced

The Beetle Tank currently has speed `0.5`. On the center-to-queen route, it takes about `34.7s` to reach the queen at `enemySpeedScale = 30`.

Most other Act 1 queen-bound threats arrive much sooner:

- Spider Runner from left to queen: about `7.6s`
- Spider Runner from right to queen: about `7.8s`
- Wasp Assassin from center to queen: about `8.7s`
- Wasp Assassin from right to queen: about `9.8s`

That creates a slow armored tail after the main fight has already resolved. First experiment: try Beetle Tank speed around `0.9`. That would put its center-to-queen travel time around `19.3s`, still heavy and slower than the fast threats, but less likely to create dead air.

### HP curve is lumpy

Current total raw HP by wave:

| Wave | Total HP | Note |
|---:|---:|---|
| 1 | 24 | Intro |
| 2 | 92 | First big jump |
| 3 | 80 | Dips below Wave 2 |
| 4 | 146 | Jumps again |
| 5 | 157 | Small rise |
| 6 | 218 | Big rise |
| 7 | 220 | Nearly flat from Wave 6 |
| 8 | 363 | About +65% from Wave 7 |
| 9 | 392 | Smaller final rise |

The biggest structural issues are the Wave 3 dip, the Wave 6 -> 7 flat spot, and the Wave 7 -> 8 spike. Smooth this by either raising Wave 3, making Wave 7 more distinct, or shaving Wave 8.

### Queen attrition is harsh because there is no regen

The queen has `200` HP and no current regen. Cumulative Act 1 queen-threat is `564`, so a no-defense run loses the queen before Act 1 ends. By cumulative queen-threat, the no-defense loss point is around Wave 7:

| Through wave | Cumulative queen-threat |
|---:|---:|
| 1 | 0 |
| 2 | 20 |
| 3 | 44 |
| 4 | 64 |
| 5 | 118 |
| 6 | 194 |
| 7 | 278 |
| 8 | 392 |
| 9 | 564 |

That may be desirable for a no-defense baseline, but it means any early leaks persist permanently. If players are losing despite understanding the systems, tune queen HP, queen-targeted attack/count, recovery economy, or add an explicit queen-repair/regen mechanic later.