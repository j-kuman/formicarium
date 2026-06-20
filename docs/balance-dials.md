# Formicarium Balance Dials

This is a practical symptom -> dial reference for tuning. Use it when the game feels wrong and you need to know which JSON knob to move first.

The source of truth is the data in `data/*.json` plus `data/maps/*.json`. Do not tune by gut alone: run the measurement scripts first, then change the smallest data dial that explains the symptom.

## Measurement tools

Run these from the repo root:

```bash
node scripts/balance.mjs
node scripts/timeline.mjs
```

Use `scripts/balance.mjs` for wave weight: total enemy count, total raw HP, total armor, total queen-threat, rewards, path length, and rough time-to-target. Use `scripts/timeline.mjs` for pacing feel: per-enemy spawn/arrival times, first queen arrival, wave duration, and arrival clumping.

Current Segment-1 scope is waves 1-9 only. Segment 3 forward references exist in data, but should not be treated as live Act-1 balance problems unless they affect a current wave.

## Current snapshot

### Global timing and economy

| Key | File | Current value | Notes |
|---|---|---:|---|
| `ticksPerSecond` | `data/tuning.json` | `60` | Converts tick dials to seconds. |
| `enemySpeedScale` | `data/tuning.json` | `30` | Global multiplier on all enemy traversal speed. |
| `startingResources.food` | `data/tuning.json` | `120` | Starting food. |
| `startingResources.soil` | `data/tuning.json` | `80` | Starting soil. |
| `startingResources.resin` | `data/tuning.json` | `40` | Starting resin. |
| `resourceCaps.food` | `data/tuning.json` | `200` | Food bank cap. |
| `resourceCaps.soil` | `data/tuning.json` | `9999` | Effectively uncapped. |
| `resourceCaps.resin` | `data/tuning.json` | `9999` | Effectively uncapped. |
| `recoveryIncomePer10Ticks.food` | `data/tuning.json` | `8` | About 6 pulses/sec at 60 tps if paid every 10 ticks. |
| `recoveryIncomePer10Ticks.soil` | `data/tuning.json` | `4` | Same cadence. |
| `recoveryIncomePer10Ticks.resin` | `data/tuning.json` | `2` | Same cadence. |
| `buildPhaseDurationTicks` | `data/tuning.json` | `300` | 5.0 seconds at 60 tps. |
| `recoveryPhaseDurationTicks` | `data/tuning.json` | `120` | 2.0 seconds at 60 tps. |
| `breachRevealDelayTicks` | `data/tuning.json` | `180` | 3.0 seconds at 60 tps. |

### Current Act-1 wave metrics

These are the headline rows to compare before/after a balance change. `balance.mjs` reports HP, armor, queen-threat, and rewards. `timeline.mjs` reports first queen arrival and total wave duration.

| Wave | Count | Total HP | Armor sum | Queen-threat | Reward | First queen arrival | Wave duration |
|---:|---:|---:|---:|---:|---|---:|---:|
| 1 | 3 | 24 | 0 | 0 | food 6 | n/a | 9.22s |
| 2 | 5 | 92 | 10 | 20 | food 8, soil 5 | 34.67s | 34.67s |
| 3 | 7 | 80 | 0 | 24 | food 10, resin 6 | 7.60s | 10.17s |
| 4 | 8 | 146 | 16 | 20 | food 20, soil 5 | 34.67s | 34.67s |
| 5 | 8 | 157 | 8 | 54 | food 16, resin 14 | 7.80s | 10.47s |
| 6 | 10 | 218 | 20 | 76 | food 12, soil 10, resin 10 | 9.75s | 37.67s |
| 7 | 11 | 220 | 10 | 84 | food 20, resin 22 | 7.80s | 11.30s |
| 8 | 12 | 363 | 42 | 114 | food 24, soil 15, resin 15 | 9.75s | 39.67s |
| 9 | 15 | 392 | 28 | 172 | food 16, soil 10, resin 35 | 7.60s | 36.67s |

## Dials by subsystem

### Economy and resources

| Dial | Exact key + file | What it controls | Direction | Notable interactions |
|---|---|---|---|---|
| Starting food | `data/tuning.json` -> `startingResources.food` | Opening squad/guard affordability, early mistake tolerance. | ↑ easier early; ↓ sharper opener. | Food also pays for units and some guard/chamber upgrades. Raising this can hide a bad food economy. |
| Starting soil | `data/tuning.json` -> `startingResources.soil` | Opening chamber/defense build latitude. | ↑ easier setup; ↓ fewer early options. | Soil pays for acid/guard costs and chamber upgrades. |
| Starting resin | `data/tuning.json` -> `startingResources.resin` | Early slow/blocker access. | ↑ easier to control lanes; ↓ more leak risk. | Resin barricades interact strongly with enemy speed and armor-heavy waves. |
| Food cap | `data/tuning.json` -> `resourceCaps.food` | How much food can be banked. | ↑ more hoarding and late recovery; ↓ forced spending. | Current food cap is 200 while soil/resin are effectively uncapped. |
| Soil/resin caps | `data/tuning.json` -> `resourceCaps.soil`, `resourceCaps.resin` | Bank ceiling for build materials. | ↑ easier stockpiling; ↓ more spend timing pressure. | Current 9999 values mean these caps are not active tuning constraints. |
| Recovery income | `data/tuning.json` -> `recoveryIncomePer10Ticks.*` | Resource refill during recovery. | ↑ easier comeback/runaway; ↓ harsher attrition. | More valuable when `recoveryPhaseDurationTicks` is longer. If recovery pays every 10 ticks for the full 120 ticks, current max per recovery is roughly food 96 / soil 48 / resin 24. |
| Enemy reward | `data/enemies.json` -> `reward.*` | Resources returned by killing that enemy. | ↑ easier after that enemy appears; ↓ tighter economy. | Spawns multiply reward by `spawns[].count`, so wave composition changes economy as well as difficulty. |
| Cost maps | `data/defenses.json`, `data/units.json`, `data/chambers.json` -> `cost`, `costPerUnit`, `upgrade.cost` | Purchase/upgrade affordability. | ↑ harder/slower tech; ↓ easier/faster tech. | Cost changes must be checked against starting resources, recovery income, and wave rewards. |
| Chamber food cap bonus | `data/chambers.json` -> `food.passiveEffect.amount`, `food.upgrade.passiveEffect.amount` | Food-store cap relief. | ↑ easier food banking; ↓ more food waste/cap pressure. | Only matters once players approach the food cap. |

### Phase timings and pacing

| Dial | Exact key + file | What it controls | Direction | Notable interactions |
|---|---|---|---|---|
| Scout warning duration | `data/waves.json` -> `warningTicks` | Scout phase time before build for each wave. | ↑ more preview/planning; ↓ faster pressure. | Current Act-1 values step down from 300 to 270 to 240 ticks. |
| Build duration | `data/tuning.json` -> `buildPhaseDurationTicks` | Build phase time when player does not manually advance. | ↑ calmer planning; ↓ faster loop. | Current 300 ticks = 5s. Manual advance can still shorten it. |
| Recovery duration | `data/tuning.json` -> `recoveryPhaseDurationTicks` | Post-wave rebuild/income window. | ↑ easier recovery/slower cadence; ↓ more pressure/faster cadence. | Multiplies the practical value of `recoveryIncomePer10Ticks.*`. |
| Breach reveal delay | `data/tuning.json` -> `breachRevealDelayTicks` | Delay around the Underbreach reveal. | ↑ more drama/pause; ↓ faster handoff. | Narrative pacing only unless recovery/breach hold code is active. |
| Death linger | `data/tuning.json` -> `enemyDeathLingerTicks` | How long defeated enemies stay visible. | ↑ more visual confirmation but more clutter; ↓ snappier cleanup. | Does not change combat math. |
| Patrol interval | `data/tuning.json` -> `patrolIntervalTicks` | Squad/AI cadence where used. | ↑ less frequent updates; ↓ more responsive. | Check squad feel after changing. |

### Enemy stats

| Dial | Exact key + file | What it controls | Direction | Notable interactions |
|---|---|---|---|---|
| Global movement scale | `data/tuning.json` -> `enemySpeedScale` | All enemy traversal speed. | ↑ faster arrivals/harder; ↓ slower arrivals/easier/dead air. | Multiplies every enemy's `speed`; use sparingly because it moves the whole game. |
| Per-enemy speed | `data/enemies.json` -> `<enemy>.speed` | One enemy's travel time and overlap with other groups. | ↑ faster/harder/less dead air; ↓ slower/easier/more tail. | Responsible dial for Beetle Tank movement. Current `beetle_tank.speed` is 0.5; known target experiment is about 0.9. |
| HP | `data/enemies.json` -> `<enemy>.hp` | Raw time-to-clear. | ↑ harder/longer waves; ↓ easier/faster clears. | `balance.mjs` total raw HP catches wave-level impact. |
| Armor | `data/enemies.json` -> `<enemy>.armor` | Resistance to damage. | ↑ harder for low-DPS defenses; ↓ easier for basic damage. | Armor-heavy waves can spike even when count is modest. |
| Attack | `data/enemies.json` -> `<enemy>.attack` | Leak punishment and queen/chamber attrition. | ↑ harsher leaks; ↓ more forgiving leaks. | Queen-threat is attack * count for queen-targeted spawns in `balance.mjs`. |
| Target priority | `data/enemies.json` -> `<enemy>.targetPriority` | Fallback target selection when a spawn lacks explicit target. | Queen-first is harder; side-objective-first is more forgiving. | Current wave spawns explicitly set `target`, so this mostly affects future/deep waves. |
| Tags | `data/enemies.json` -> `<enemy>.tags` | Renderer identity and some mechanics/counters. | Depends on tag. | `deep`, `boss`, `swarm`, `ignores_resin`, `disrupts_squads`, `causes_panic` are design-sensitive tags; do not retag just for numeric tuning. |
| On-reach/on-death hooks | `data/enemies.json` -> `onReach`, `onDeath` | Special failure or side effects. | Adding live hooks increases complexity/difficulty. | `pheromone_leech.onReach = panic_nearby_squads`, but the enemy is not deployed in current waves. |

### Wave composition, cadence, and map routing

| Dial | Exact key + file | What it controls | Direction | Notable interactions |
|---|---|---|---|---|
| Spawn enemy | `data/waves.json` -> `spawns[].enemy` | Which enemy type appears. | Harder/easier depends on stat profile. | Swapping enemy type changes HP, armor, attack, speed, reward, tags, and special hooks at once. |
| Spawn count | `data/waves.json` -> `spawns[].count` | Group size. | ↑ more HP/reward/leak volume; ↓ less pressure. | Simple first dial for wave too easy/hard, but also changes economy via rewards. |
| Spawn interval | `data/waves.json` -> `spawns[].intervalTicks` | Time between enemies in a group. | ↑ less burst/more trickle; ↓ more burst/overlap. | `timeline.mjs` is the best way to see whether intervals create clumps or tails. |
| Spawn entrance | `data/waves.json` -> `spawns[].entrance` | Lane and path length. | Shorter/more central paths usually harder; longer paths easier. | Current surface entrances are `entrance_left`, `entrance_center`, `entrance_right`. |
| Spawn target | `data/waves.json` -> `spawns[].target` | Objective pressure. | `queen` is direct-loss pressure; `brood`/`food` are softer side pressure. | Target is a node type alias in current waves, resolved to visible map nodes. |
| Wave warning | `data/waves.json` -> `warningTicks` | Pre-wave read time. | ↑ easier to prep; ↓ harder/faster. | Also listed under phase timings because it controls scout pacing. |
| Foreshadow hooks | `data/waves.json` -> `foreshadow`, `foreshadowMessage`, `afterWaveEvent` | Narrative and breach event timing. | Earlier = earlier fakeout pressure; later = longer pure TD arc. | Wave 9 currently has `afterWaveEvent: underbreach_trigger`. |
| Edge length | `data/maps/act1_map.json` -> `edges[].length` | Path travel time. | ↑ longer travel/easier; ↓ shorter travel/harder. | Movement formula effectively uses path length divided by enemy speed * `enemySpeedScale`. Changing this also changes all enemies using that path. |
| Edge width | `data/maps/act1_map.json` -> `edges[].width` | Tunnel class/readability/mechanic affordance. | Design-dependent. | Keep consistent with pathing/placement expectations. |
| Edge defense slots | `data/maps/act1_map.json` -> `edges[].defenseSlots` | How much static defense a tunnel accepts. | ↑ easier to hold a lane; ↓ harder. | Strongly interacts with resin barricades and slow chokepoints. |
| Node defense slots | `data/maps/act1_map.json` -> `nodes[].defenseSlots` | How much node defense a chamber/junction accepts. | ↑ easier to build local kill zones; ↓ harder. | Queen has 2, brood has 1, food has 1, major junctions vary. |
| Node HP/maxHp | `data/maps/act1_map.json` -> `nodes[].hp`, `nodes[].maxHp` | Map-object durability. | ↑ more forgiving leaks; ↓ harsher attrition. | Queen node is 200 HP with no current regen. |

### Defenses

| Dial | Exact key + file | What it controls | Direction | Notable interactions |
|---|---|---|---|---|
| Placement | `data/defenses.json` -> `<defense>.placement` | Node vs edge placement. | Design-dependent. | This is a structural dial, not a first-pass numeric knob. |
| Cost | `data/defenses.json` -> `<defense>.cost` | When a defense becomes affordable. | ↑ harder/slower; ↓ easier/faster. | Compare against starting resources and early wave rewards. |
| HP | `data/defenses.json` -> `<defense>.hp`, `upgrade.hp` | Defense durability. | ↑ less rebuilding; ↓ more attrition. | Matters most when enemies damage defenses. |
| Slow | `data/defenses.json` -> `resin_barricade.effects.slowFactor`, `upgrade.effects.slowFactor` | Movement multiplier through slow/blocker defense. | Lower value = stronger slow/easier; higher value = weaker slow/harder. | Current base is 0.65, upgrade is 0.45. Multiplies enemy speed after global/per-enemy speed. |
| DPS | `data/defenses.json` -> `acid_sprayer.effects.dps`, `guard_post.effects.dps`, upgrade dps | Damage throughput. | ↑ easier clears; ↓ harder clears. | Use against `balance.mjs` total HP/armor. |
| DoT duration | `data/defenses.json` -> `acid_sprayer.effects.dotDuration`, upgrade value | How long acid continues damaging. | ↑ stronger sustained damage; ↓ weaker. | Interacts with enemy speed: faster enemies may leave before value lands if implementation is positional. |
| Cooldown | `data/defenses.json` -> `effects.cooldownTicks` | Firing cadence. | ↑ slower/weaker; ↓ faster/stronger. | Guard post cooldown is 1, acid base is 60, acid upgrade is 45. |
| Clean rate | `data/defenses.json` -> `spore_scrubber.effects.cleanRatePerTick` | Deep contamination cleanup. | ↑ easier deep recovery; ↓ harsher contamination. | Segment-3/deep dial. |
| Detection warning | `data/defenses.json` -> `vibration_sentinel.effects.warningTicks` | Burrower warning window. | ↑ easier to react; ↓ more surprise. | Segment-3/deep dial. |
| Panic prevention | `data/defenses.json` -> `pheromone_anchor.effects.preventsPanic` | Whether panic can be countered. | `true` easier; `false` harder. | No live panic trigger exists until `pheromone_leech` or another panic enemy is spawned. |
| Adaptation gate | `data/defenses.json` -> `requiresAdaptation` | Tech prerequisite. | Adding a gate delays access; removing gate accelerates access. | Current deep defenses depend on adaptation ids in `data/adaptations.json`. |

### Squads and units

| Dial | Exact key + file | What it controls | Direction | Notable interactions |
|---|---|---|---|---|
| Unit cost | `data/units.json` -> `<unit>.costPerUnit` | Squad affordability. | ↑ weaker/slower squad economy; ↓ stronger/faster. | Current costs: Worker food 15, Soldier food 65, Major Ant food 180. |
| Unit HP | `data/units.json` -> `<unit>.hp` | Squad durability. | ↑ squads survive longer; ↓ squads collapse faster. | Current HP: Worker 8, Soldier 20, Major Ant 40. |
| Unit attack | `data/units.json` -> `<unit>.attack` | Squad damage. | ↑ squads stronger; ↓ squads weaker. | Current attack: Worker 1, Soldier 4, Major Ant 6. |
| Unit speed | `data/units.json` -> `<unit>.speed` | Squad reposition/response speed. | ↑ more responsive; ↓ more committed/punishing. | Current speed: Worker 1.5, Soldier 1.2, Major Ant 0.7. |
| Worker repair | `data/units.json` -> `worker.repairRatePerTick` | Map recovery through workers. | ↑ easier attrition repair; ↓ harsher damage persistence. | Interacts with recovery phase duration. |
| Barracks gate | `data/units.json` -> `major_ant.requiresBarracks`; `data/chambers.json` -> `barracks.passiveEffect` | When Major Ants unlock. | Earlier/easier if gate removed or wave lowered; later/harder if delayed. | Barracks currently unlocks Major Ant at wave 4. |
| Squad retaliation multiplier | `data/tuning.json` -> `squadRetaliationDpsMultiplier` | Squad combat damage modifier where used. | ↑ squads stronger; ↓ squads weaker. | Current value is 1.25. Check with playtest plus wave clear speed. |
| Panic duration | `data/tuning.json` -> `squadPanicRetreatTicks` | How long panic/retreat behavior lasts. | ↑ panic harsher; ↓ panic softer. | Current value is 100 ticks (~1.67s), but current waves do not spawn the panic trigger enemy. |
| Squad capacity chamber upgrade | `data/chambers.json` -> `barracks.upgrade.passiveEffect.amount` | Added squad capacity from barracks upgrade. | ↑ squads scale harder; ↓ squads cap sooner. | Current upgrade amount is 2. |
| Squad slot availability | `data/maps/act1_map.json` -> `nodes[].squadSlot` | Where squads can be assigned. | More slots = easier coverage; fewer slots = harder routing choices. | Map-level structural dial; use cautiously. |

## Failure-mode -> dial reference

| Failure mode | What detects it | First dials to try | Direction | Notes |
|---|---|---|---|---|
| Waves are too easy overall | Playtest + `balance.mjs` low total HP/queen-threat relative to player power | `spawns[].count`, enemy `attack`, enemy `hp`, `enemySpeedScale` | Count/attack/HP ↑; speed scale ↑ | Count is simplest, but it also increases reward. Attack makes leaks matter without slowing clears. |
| Waves are too hard overall | Deaths despite correct placement; `balance.mjs` high HP/armor/queen-threat | `spawns[].count`, enemy `hp`, enemy `armor`, recovery income, starting resources | Count/HP/armor ↓; income/resources ↑ | Reduce the stat causing the failure. If players cannot afford counters, tune economy first. |
| Per-wave difficulty spike | `balance.mjs` wave row jumps; `timeline.mjs` sudden earlier first-queen-arrival or longer duration | `spawns[].count`, enemy mix, `intervalTicks`, target, speed | Smooth one wave at a time | Wave 8 currently jumps to 363 HP from 220 at wave 7. |
| Wave feels scary but HP is not high | `timeline.mjs` shows early first queen arrival or arrival clump | `spawns[].intervalTicks`, per-enemy `speed`, `entrance`, `target` | Spread intervals ↑, speed ↓, soften target | Wave 3 is this style: HP dips from wave 2, but first queen arrival jumps from 34.67s to 7.60s. |
| Resource starvation | Player cannot afford intended defenses/units; compare costs to starting resources + rewards in `balance.mjs` | `startingResources.*`, `recoveryIncomePer10Ticks.*`, enemy `reward`, costs | Resources/rewards ↑ or costs ↓ | Check whether starvation is broad or resource-specific. |
| Runaway economy | Player banks too much and invalidates later waves | `resourceCaps.*`, `recoveryIncomePer10Ticks.*`, enemy `reward`, costs | Caps ↓, income/reward ↓, costs ↑ | Food cap is active at 200; soil/resin caps are effectively disabled. |
| Pacing too slow / dead air | `timeline.mjs` long wave duration, late stragglers | Slow enemy `speed`, `enemySpeedScale`, `intervalTicks`, path `edges[].length` | Speed ↑, interval ↓, path shorter | Beetle Tank at speed 0.5 creates long tails on center-to-queen routes. |
| Pacing too fast / no decision time | `timeline.mjs` first arrivals too early; players cannot build/respond | `warningTicks`, `buildPhaseDurationTicks`, enemy speed, `intervalTicks` | Warning/build ↑, speed ↓, intervals ↑ | Use phase timing if players need prep; use enemy speed if combat itself is too compressed. |
| Squads too strong | Playtest: squads replace static defenses or erase leaks | unit `attack`, unit `hp`, `squadRetaliationDpsMultiplier`, unit costs | Attack/HP/multiplier ↓ or cost ↑ | Also check `barracks.upgrade.passiveEffect.amount` if squad count is the issue. |
| Squads too weak | Playtest: squads die or fail to matter even when placed correctly | unit `hp`, unit `attack`, unit `speed`, costs, worker repair | HP/attack/speed ↑ or cost ↓ | Worker repair can make squads feel valuable outside direct DPS. |
| Squads never panic | Data coverage check: no live wave spawns enemy with panic hook | Add `pheromone_leech` spawn or another `onReach: panic_nearby_squads` enemy | Deploy trigger | Current `pheromone_leech` has the panic hook but appears in no wave spawn. |
| Squads panic too readily | `timeline.mjs` shows too many panic-trigger arrivals; playtest shows constant retreat | Panic enemy count/interval/speed, `squadPanicRetreatTicks`, pheromone anchor access | Count/speed/duration ↓, intervals ↑, anchor easier | No current wave triggers this yet. Use after adding a panic enemy. |
| Defined enemy never deployed | Compare `data/enemies.json` ids to `data/waves.json` spawn enemy ids; P7 validator also warns | Add a spawn or accept forward reference | Deploy or document | Current deployed enemies are surface Act-1 only; deep enemies are defined for Segment 3. |
| Queen attrition feels unfair | Playtest + cumulative queen-threat from `balance.mjs` | queen `hp`/`maxHp`, queen-targeted count/attack, target aliases, repair/regen later | HP ↑, queen threat ↓ | Queen has 200 HP and no current regen; early leaks persist. |
| Side objectives do not matter | Playtest ignores brood/food; `balance.mjs` queen-threat dominates | More `target: brood`/`food`, side-objective HP, rewards/cost pressure | Shift some spawns off queen | Softer than direct queen pressure but can create strategic variety. |

## Known current issues and intended fixes

### Beetle Tank movement is too slow

Responsible dial: `data/enemies.json` -> `beetle_tank.speed`.

Current value is 0.5. With `enemySpeedScale = 30`, a center-to-queen Beetle Tank takes about 34.67s to arrive. That is much slower than the fast queen threats: Spider Runner left-to-queen is about 7.60s, Wasp Assassin center-to-queen is about 7.80s, and Wasp Assassin right-to-queen is about 9.75s.

First experiment: raise `beetle_tank.speed` toward about 0.9. That would keep Beetle Tank slower and heavier than the fast enemies, but pull the center-to-queen travel time down to roughly 19.26s. Avoid changing `enemySpeedScale` for this specific issue because that also speeds every enemy.

### Difficulty spikes around wave 3 and waves 6-8 need smoothing

Use both scripts before tuning:

- `balance.mjs`: compare total HP, armor, queen-threat, and reward by wave.
- `timeline.mjs`: compare first queen arrival and wave duration.

Current rough shape:

| Transition | Symptom | Likely fix |
|---|---|---|
| Wave 2 -> 3 | Total HP drops 92 -> 80, but first queen arrival shifts from 34.67s to 7.60s because Spider Runner appears. | Treat wave 3 as a speed/arrival spike, not an HP spike. Adjust Spider Runner count, interval, target, or warning time before raising HP. |
| Wave 5 -> 6 | HP rises 157 -> 218 and queen-threat rises 54 -> 76, with long Beetle tail duration. | Smooth by reducing Beetle count/attack, increasing interval, or fixing Beetle speed if the issue is dead air rather than lethality. |
| Wave 6 -> 7 | HP is almost flat 218 -> 220 but first queen arrival becomes fast again at 7.80s. | If wave 7 feels too sharp, soften Spider/Wasp timing. If it feels too flat, add HP/reward intentionally. |
| Wave 7 -> 8 | HP jumps 220 -> 363 and armor jumps 10 -> 42. | Shave Beetle count, Wasp count, or armor load; keep reward implications in mind. |

### Pheromone Leech is defined but not deployed

`data/enemies.json` defines `pheromone_leech` with `onReach: panic_nearby_squads`, but `data/waves.json` currently has no `pheromone_leech` spawn. That means the T21 squad-panic mechanic has no live trigger in current waves.

Treat this as a balance/coverage gap, not a number-tuning issue. To test panic, add a controlled `pheromone_leech` spawn in the appropriate Segment-3 wave set or add another live enemy with the same hook. Until then, `squadPanicRetreatTicks` and `pheromone_anchor.effects.preventsPanic` are mostly dormant dials.

### `deep_guard` is an expected Segment-3 forward reference

`data/adaptations.json` has `deep_guard_caste.unlocks = unit:deep_guard`, but `data/units.json` does not currently define `deep_guard`. This is expected as a Segment-3 forward reference. Do not treat `deep_guard` as a current Act-1 balance dial until the unit data lands.

### Deep enemies are defined but not in current waves

The current `data/waves.json` contains waves 1-9 only. Deep enemies such as `pale_borer`, `spore_mite`, `blind_centipede_larva`, `pheromone_leech`, `brood_worm`, and `glass_pale_centipede` are not deployed in current Act-1 waves. That is normal for the Segment-1 fakeout, except where a mechanic explicitly needs live coverage for testing, such as squad panic.
