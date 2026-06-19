# Formicarium Defense — Implementation Plan v1.2
## Engineering Handoff to Codex

_Last updated: 2026-06-18_

> **v1.2 consolidation pass** — fixes four latent logic bugs (target-alias resolution, enemy reward wiring, the damage/cooldown model, fixed-timestep determinism), folds previously ad-hoc fields (`selectedId`, `contaminationLevel`) into the canonical state model, merges the duplicate deep-enemy task, and renumbers tasks/sections to be contiguous. Architecture, schemas, and map graph from v1.1 are unchanged — they were verified sound.

---

## 0. Purpose

This document is the sole source of truth for implementing Formicarium Defense. It resolves all ambiguities in `formicarium_defense_game_plan.md` and specifies what to build, in what order, at what fidelity. Read it entirely before writing any code.

---

## 1. Goals / Non-Goals

### Goals
- Playable browser game covering Acts 1 and 2 (surface defense + Underbreach)
- Pure simulation logic fully separated from rendering and audio — zero Phaser in `src/sim/`
- All gameplay values in JSON data files — no magic numbers in TypeScript
- Phaser 3 + TypeScript 5 (strict) + Vite + Vitest stack
- Sim layer has unit tests (Vitest); feel/balance validated by manual playthrough
- Runs at 60fps in Chrome on a modern laptop
- Acts 1+2 constitute a complete arc: rule → rule-break → climax → domain expansion ending
- **Production art ships with Phase 1** — placeholder primitives are a dev-time scaffold only, replaced before launch via the texture-key seam (see §11). The fakeout requires Act 1 to *look* polished.

### Non-Goals (do not build)
- Act 3 (basement, roaches, concrete terrain) — text teaser only
- Freeform digging — all tunnels pre-defined in map JSON
- Individual ant pathfinding — squads are zone-assigned badges, not individually simulated
- Save / load system
- Multiplayer or networked features
- Mobile / touch support
- Procedural map generation
- Pheromone resource — scaffolded in types, not wired
- Music / soundtrack — procedural sound effects only
- Hundreds of individually rendered ants
- Wave 10+ mechanics in Segment 1 — Segment 1 ends with the breach cliffhanger visual only (no deep enemies, no Act 2 waves)

---

## 2. Scope: Three Build Segments

**Never start a segment until the prior segment's acceptance criteria pass.**

### Segment 1 — Gate 1: Static Defense Only (Waves 1–9)
Pure tower defense. Player places fixed defenses and manages resources. No mobile squads.

Segment 1 ends with a **breach cliffhanger only**: wave 9 completes → foreshadow fires → breach visual and narrative play → deep nodes are revealed → game enters `'ended'` phase with a cliffhanger screen. No wave 10, no deep enemies, no deep mechanics. This is intentional: it lets Gate 1 prove the fakeout lands before Segment 3 builds on it.

- One fixed map (node/edge graph from JSON)
- 4 chamber types: Queen, Brood, Food Store, Barracks
- 3 surface entrance nodes
- 3 defense types: Resin Barricade, Acid Sprayer, Guard Post
- 5 enemy types: Mite Swarm, Beetle Tank, Spider Runner, Robber Ant, Wasp Assassin
- 4-phase loop: Scout → Build → Wave → Recovery → (after wave 9) Ended/Cliffhanger
- 1 upgrade tier per defense
- Foreshadowing begins at wave 7
- `data/waves.json` in Segment 1 contains **waves 1–9 only**; waves 10–14 are added in Segment 3

### Segment 2 — Mobile Squads (add-on to Act 1)
Built only after Gate 1 passes. Adds squad layer on top of the working static loop.

- 3 unit types: Worker, Soldier, Major Ant
- Squad assignment to nodes/edges; 4 stances (hold, intercept, retreat, repair)
- Worker squads repair damaged nodes during recovery
- Squads render as group badge + count

### Segment 3 — The Underbreach (Waves 10–14, Act 2)
Built only after Segment 2 is stable.

Segment 3 **resumes from the breach cliffhanger** left by Segment 1. The visual reveal and narrative are already built; Segment 3 adds the actual Act 2 mechanics behind them.

- Extend `data/waves.json` with waves 10–14
- Study Chamber, 5 deep enemy types, Deep Adaptations tech branch
- Two-front defense (surface + deep simultaneously)
- Wave 14 boss: Glass-Pale Centipede
- Victory = colony defeats deep invaders, claims their territory as second tier
- Act 3 text teaser only

---

## 3. Architecture

### Core Constraint
`src/sim/` files have **zero imports from Phaser, SoundManager, or any render layer**. The sim is pure TypeScript. This constraint is load-bearing: it enables Vitest unit tests and the future Phase 2 agent handoff.

### SimEvent Queue
`GameSim.tick()` returns a `SimEvent[]` array. Consumers (GameScene, SoundManager, EffectRenderer) process events each frame. The sim never calls consumers directly.

```
Player Input
     │ InputCommand[]
     ▼
┌──────────────────────────────────┐
│          GameSim.tick()           │
│  mutates GameState internally     │
│  returns SimEvent[]               │
└──────┬───────────────────────────┘
       │
       ├─── SimEvent[] ──► SoundManager.process(events)   [play sfx]
       │
       ├─── SimEvent[] ──► EffectRenderer.process(events) [camera shake, flash]
       │
       └─── sim.getState() ──► MapRenderer / EnemyRenderer / DefenseRenderer
                                [read state, draw frame]
```

### Update Loop
```typescript
// GameScene.update(realTime, realDeltaMs)
// GameSim.tick() advances the sim in FIXED timesteps internally (see Determinism below).
// It accumulates realDeltaMs and runs N fixed steps; rendering reads the resulting state.
const commands = ui.flushCommands();
const events = sim.tick(realDeltaMs, commands);
soundManager.process(events);
effectRenderer.process(events, this.cameras.main);
const state = sim.getState();
mapRenderer.update(state);
enemyRenderer.update(state);
defenseRenderer.update(state);
squadRenderer.update(state);   // Segment 2
uiScene.sync(state, events);
```

### Determinism (fixed timestep) — load-bearing
The sim must be deterministic: identical starting state + identical command stream ⇒ identical result, **independent of frame rate**. The renderer may run at any fps and may interpolate, but **the sim never advances by a variable wall-clock delta.**

`GameSim.tick(realDeltaMs, commands)` accumulates `realDeltaMs` into an internal accumulator and runs as many fixed steps of `NOMINAL_DELTA_MS` (= `1000 / tuning.ticksPerSecond`) as have accumulated, carrying the remainder to the next call. Commands are applied on the first fixed step of the call. **Every sub-system (CombatResolver, WaveSpawner, SquadController, …) steps by `NOMINAL_DELTA_MS`, never by `realDeltaMs`.** Wherever a task below says `deltaMs`, it means this fixed step.

This is the single guarantee that makes the Vitest sim tests reproducible and the Phase 2 agent replay possible. Do not feed wall-clock delta into game logic anywhere.

---

## 4. State Model

```typescript
// src/types/game.ts

export type Phase = 'scout' | 'build' | 'wave' | 'recovery' | 'ended';
// 'ended' = no next wave found (Segment 1 cliffhanger); Segment 3 replaces this with wave 10 start
export type Act = 1 | 2;
export type SquadStance = 'hold' | 'intercept' | 'retreat' | 'repair' | 'patrol';

export interface Resources {
  food: number;
  soil: number;
  resin: number;
}

export interface GameState {
  phase: Phase;
  act: Act;
  wave: number;               // 1–14
  tick: number;               // sim ticks elapsed
  phaseTick: number;          // ticks in current phase
  resources: Resources;
  nodes: Map<string, NodeState>;
  edges: Map<string, EdgeState>;
  enemies: EnemyInstance[];
  squads: SquadInstance[];    // empty until Segment 2
  defenses: DefenseInstance[];
  queenHp: number;
  queenMaxHp: number;
  samples: Map<string, number>;
  unlockedAdaptations: Set<string>;
  foreshadowEvents: ForeshadowEvent[];
  breachTriggered: boolean;
  deepNodesVisible: boolean;
  claimedDeepNodes: boolean;  // set on victory
  gameOver: boolean;
  victory: boolean;
  waveEnemiesRemaining: number;
  selectedId: string | null;        // currently selected node OR edge id (UI focus)
  selectedKind: 'node' | 'edge' | null;
}

export interface NodeState {
  id: string;
  type: 'queen' | 'brood' | 'food' | 'barracks' | 'junction' |
        'entrance' | 'study' | 'deep_junction' | 'deep_entrance';
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  visible: boolean;
  defenseSlots: number;
  squadSlot: boolean;
  upgradeLevel: number;
  contaminated: boolean;            // true iff contaminationLevel > 0 (derived convenience flag)
  contaminationLevel: number;       // 0.0–1.0; raised by contaminating deaths, drained by spore scrubbers
}

export interface EdgeState {
  id: string;
  nodeA: string;
  nodeB: string;
  width: 'ant' | 'large';
  length: number;
  visible: boolean;
  defenseSlots: number;
  hp: number;
  maxHp: number;
  contaminated: boolean;
}

export interface EnemyInstance {
  id: string;
  typeId: string;
  hp: number;
  maxHp: number;
  edgeId: string;
  progress: number;           // 0.0 → 1.0 along current edge
  pathEdges: string[];        // remaining edges to traverse, index 0 = current
  targetNodeId: string;       // final goal node
  speed: number;
  slowFactor: number;         // 1.0 = full speed; 0.65 = 35% slowed
  dotDamage: number;          // active DoT damage per tick
  dotTicksRemaining: number;
  act: 1 | 2;
}

export interface SquadInstance {
  id: string;
  typeId: string;
  count: number;
  assignedNodeId: string | null;
  assignedEdgeId: string | null;
  stance: SquadStance;
  hp: number;
  maxHp: number;
}

export interface DefenseInstance {
  id: string;
  typeId: string;
  nodeId: string | null;
  edgeId: string | null;
  upgradeLevel: number;
  cooldownTicksRemaining: number;
  hp: number;
  maxHp: number;
}

export interface ForeshadowEvent {
  wave: number;
  type: 'tremor' | 'worker_refusal' | 'temperature' | 'crack' | 'scout_warning';
  message: string;
  shown: boolean;
}
```

---

## 5. SimEvent Types

```typescript
// src/types/events.ts

export type SimEventType =
  | 'ENEMY_DIED'
  | 'ENEMY_REACHED_GOAL'
  | 'NODE_DAMAGED'
  | 'QUEEN_HIT'
  | 'DEFENSE_FIRED'
  | 'NODE_CONTAMINATED'
  | 'WAVE_STARTED'
  | 'WAVE_COMPLETE'
  | 'PHASE_TRANSITION'
  | 'FORESHADOW_EVENT'
  | 'BREACH_TRIGGERED'
  | 'DEEP_NODES_REVEALED'
  | 'ADAPTATION_UNLOCKED'
  | 'SAMPLE_COLLECTED'
  | 'SQUAD_PANICKED'          // Segment 2 only
  | 'GAME_OVER'
  | 'VICTORY';

export interface SimEvent {
  type: SimEventType;
  tick: number;
  payload?: {
    enemyId?: string;
    enemyTypeId?: string;
    nodeId?: string;
    edgeId?: string;
    damage?: number;
    adaptationId?: string;
    sampleId?: string;
    foreshadowType?: string;
    message?: string;
    fromPhase?: string;
    toPhase?: string;
  };
}
```

SoundManager maps event types to sfx keys. EffectRenderer maps event types to visual effects. Neither can reach into sim.

---

## 6. Data Schemas

All files under `data/`. No stat may be hardcoded in TypeScript.

### `data/tuning.json`
All designer-tunable timing and economy constants live here. Code may reference these at startup but must not declare them as literals.

```json
{
  "ticksPerSecond": 60,
  "startingResources": { "food": 120, "soil": 80, "resin": 40 },
  "resourceCaps": { "food": 200, "soil": 9999, "resin": 9999 },
  "recoveryIncomePer10Ticks": { "food": 8, "soil": 4, "resin": 2 },
  "recoveryPhaseDurationTicks": 120,
  "buildPhaseDurationTicks": 300,
  "breachRevealDelayTicks": 180,
  "cameraShakeDurationMs": 1000,
  "cameraShakeIntensity": 0.02,
  "breachFlashDurationMs": 500,
  "breachCameraScrollDurationMs": 2000,
  "enemyDeathLingerTicks": 60,
  "patrolIntervalTicks": 60,
  "squadRetaliationDpsMultiplier": 0.5,
  "enemySpeedScale": 30
}
```

**Constants that may stay in code (not tunable):**
- `NOMINAL_DELTA_MS = 1000 / tuning.ticksPerSecond` — derived from tuning, not hardcoded
- TypeScript enum values, string IDs, structural constants

### `data/enemies.json`
```json
[
  {
    "id": "mite_swarm",
    "name": "Mite Swarm",
    "hp": 8,
    "attack": 5,
    "speed": 1.8,
    "armor": 0,
    "targetPriority": ["brood", "queen"],
    "tags": ["swarm", "small", "surface"],
    "act": 1,
    "reward": { "food": 2 }
  },
  {
    "id": "beetle_tank",
    "name": "Beetle Tank",
    "hp": 60,
    "attack": 20,
    "speed": 0.5,
    "armor": 10,
    "targetPriority": ["queen", "junction"],
    "tags": ["armored", "large", "surface"],
    "act": 1,
    "reward": { "soil": 5 }
  },
  {
    "id": "spider_runner",
    "name": "Spider Runner",
    "hp": 20,
    "attack": 12,
    "speed": 2.5,
    "armor": 0,
    "targetPriority": ["queen", "brood"],
    "tags": ["fast", "surface"],
    "act": 1,
    "reward": { "resin": 3 }
  },
  {
    "id": "robber_ant",
    "name": "Robber Ant",
    "hp": 18,
    "attack": 10,
    "speed": 1.4,
    "armor": 2,
    "targetPriority": ["food", "brood"],
    "tags": ["ant", "surface"],
    "act": 1,
    "reward": { "food": 4 }
  },
  {
    "id": "wasp_assassin",
    "name": "Wasp Assassin",
    "hp": 25,
    "attack": 18,
    "speed": 2.0,
    "armor": 0,
    "targetPriority": ["queen", "queen", "queen"],
    "tags": ["flying", "surface", "priority_queen"],
    "act": 1,
    "reward": { "resin": 5 }
  },
  {
    "id": "pale_borer",
    "name": "Pale Borer",
    "hp": 35,
    "attack": 15,
    "speed": 0.9,
    "armor": 5,
    "targetPriority": ["queen", "junction"],
    "tags": ["deep", "burrower", "ignores_resin"],
    "act": 2,
    "reward": { "soil": 8 },
    "sampleDrop": "pale_borer_sample"
  },
  {
    "id": "spore_mite",
    "name": "Spore Mite",
    "hp": 6,
    "attack": 3,
    "speed": 1.5,
    "armor": 0,
    "targetPriority": ["brood", "junction"],
    "tags": ["deep", "swarm", "contaminates"],
    "act": 2,
    "reward": { "food": 1 },
    "sampleDrop": "fungal_sample",
    "onDeath": "contaminate_node"
  },
  {
    "id": "blind_centipede_larva",
    "name": "Blind Centipede Larva",
    "hp": 80,
    "attack": 30,
    "speed": 0.7,
    "armor": 15,
    "targetPriority": ["queen", "brood"],
    "tags": ["deep", "armored", "tunnel_fighter"],
    "act": 2,
    "reward": { "soil": 10, "resin": 5 }
  },
  {
    "id": "pheromone_leech",
    "name": "Pheromone Leech",
    "hp": 22,
    "attack": 8,
    "speed": 1.6,
    "armor": 0,
    "targetPriority": ["junction", "queen"],
    "tags": ["deep", "disrupts_squads"],
    "act": 2,
    "reward": { "food": 3 },
    "onReach": "panic_nearby_squads"
  },
  {
    "id": "brood_worm",
    "name": "Brood-Worm",
    "hp": 30,
    "attack": 20,
    "speed": 1.1,
    "armor": 0,
    "targetPriority": ["brood", "queen"],
    "tags": ["deep", "corrupts_brood"],
    "act": 2,
    "reward": { "food": 5 }
  },
  {
    "id": "glass_pale_centipede",
    "name": "Glass-Pale Centipede",
    "hp": 350,
    "attack": 80,
    "speed": 0.6,
    "armor": 20,
    "targetPriority": ["queen"],
    "tags": ["deep", "boss", "ignores_resin", "causes_panic"],
    "act": 2,
    "reward": { "food": 50, "soil": 30, "resin": 20 },
    "bossWave": 14
  }
]
```

**`attack` semantics:** When an enemy reaches its `targetNodeId` and is removed, it deals `attack` damage to that node's HP. Queen chamber damage also decrements `queenHp`. After dealing damage the enemy is removed and `waveEnemiesRemaining` decrements.

**`reward` semantics:** An enemy's `reward` is granted **only when the enemy is killed** (HP depleted by a defense or squad). An enemy that *reaches its goal* and is removed grants **no** reward — it got past you. Rewards are added via `ResourceManager.grant()` and clamped to resource caps. (This is the only mid-wave source of soil/resin; without it the economy stalls — see T07.)

**Target aliases (critical):** `spawn.target` in `waves.json` and the entries in each enemy's `targetPriority` are **node-type aliases** (`"queen"`, `"brood"`, `"food"`, `"junction"`) — they are **not node IDs**. They map to concrete node IDs by node *type* (e.g. `"queen"` → the node whose `type === "queen"`, i.e. `queen_chamber`). Resolution happens once at spawn time via `Pathfinder.resolveTarget()`; the resolved concrete id is stored in `EnemyInstance.targetNodeId`. Calling `findPath(entrance, "queen")` directly would find no node and return an empty path — always resolve the alias first. See T04 and T06.

### `data/defenses.json`
```json
[
  {
    "id": "resin_barricade",
    "name": "Resin Barricade",
    "placement": "edge",
    "cost": { "resin": 20 },
    "hp": 80,
    "effects": { "slowFactor": 0.65 },
    "tags": ["primitive", "slow", "blocker"],
    "upgrade": {
      "cost": { "resin": 35 },
      "hp": 150,
      "effects": { "slowFactor": 0.45 }
    }
  },
  {
    "id": "acid_sprayer",
    "name": "Acid Sprayer",
    "placement": "node",
    "cost": { "soil": 25, "resin": 10 },
    "hp": 60,
    "effects": { "dps": 8, "dotDuration": 3, "cooldownTicks": 60 },
    "tags": ["damage", "dot"],
    "upgrade": {
      "cost": { "soil": 40, "resin": 20 },
      "hp": 100,
      "effects": { "dps": 16, "dotDuration": 5, "cooldownTicks": 45 }
    }
  },
  {
    "id": "guard_post",
    "name": "Guard Post",
    "placement": "node",
    "cost": { "soil": 30, "food": 15 },
    "hp": 120,
    "effects": { "dps": 12, "cooldownTicks": 1 },
    "tags": ["melee", "blocker"],
    "upgrade": {
      "cost": { "soil": 50, "food": 25 },
      "hp": 200,
      "effects": { "dps": 22, "cooldownTicks": 1 }
    }
  },
  {
    "id": "spore_scrubber",
    "name": "Spore Scrubber",
    "placement": "node",
    "cost": { "soil": 20, "food": 10 },
    "hp": 50,
    "effects": { "cleanRatePerTick": 0.025 },
    "tags": ["deep", "adaptation", "cleanse"],
    "requiresAdaptation": "spore_scrubber_unlock"
  },
  {
    "id": "vibration_sentinel",
    "name": "Vibration Sentinel",
    "placement": "node",
    "cost": { "soil": 35 },
    "hp": 70,
    "effects": { "detectsBurrowers": true, "warningTicks": 120 },
    "tags": ["deep", "adaptation", "detect"],
    "requiresAdaptation": "vibration_sentinel_unlock"
  },
  {
    "id": "pheromone_anchor",
    "name": "Pheromone Anchor",
    "placement": "node",
    "cost": { "resin": 30, "food": 20 },
    "hp": 80,
    "effects": { "preventsPanic": true },
    "tags": ["deep", "adaptation", "command"],
    "requiresAdaptation": "pheromone_anchor_unlock"
  }
]
```

**Damage model (single canonical rule — do not improvise per defense):**
- **Continuous** (`guard_post`): every fixed tick, deal `effects.dps * (NOMINAL_DELTA_MS / 1000)` to every enemy in range. `cooldownTicks` is **ignored** for continuous defenses (always-on melee). With `dps: 12` at 60 tps this is ~12 damage/second — coherent.
- **Damage-over-time** (`acid_sprayer`): every `cooldownTicks` ticks, (re)apply a DoT to every enemy in range, then reset the cooldown. The DoT sets `enemy.dotDamage = max(0, dps - armor) / tuning.ticksPerSecond` (post-armor damage per tick) and `enemy.dotTicksRemaining = dotDuration * tuning.ticksPerSecond`. It then ticks down independently. `dps` is the DoT's per-second magnitude — **not** an instantaneous hit. (This is why v1.1's "fire once per 60 ticks, apply `dps*dt/1000`" was wrong: it dealt ~0.13 dmg/sec.)
- **Slow** (`resin_barricade`): no damage; sets `enemy.slowFactor = effects.slowFactor` while the enemy is on its edge (skipped for `ignores_resin` enemies).
- Armor is applied as `max(0, incoming - armor)` **at application time** — continuous damage applies it each tick; DoT bakes it into `dotDamage` when applied (not re-subtracted every tick).

### `data/chambers.json`
```json
[
  {
    "id": "queen",
    "name": "Queen Chamber",
    "hp": 200,
    "defenseSlots": 2,
    "squadSlot": true,
    "passiveEffect": null,
    "upgradeable": false
  },
  {
    "id": "brood",
    "name": "Brood Chamber",
    "hp": 100,
    "defenseSlots": 1,
    "squadSlot": true,
    "passiveEffect": { "type": "ant_production", "ratePerWave": 2 },
    "upgrade": {
      "cost": { "food": 40, "soil": 20 },
      "passiveEffect": { "type": "ant_production", "ratePerWave": 4 }
    }
  },
  {
    "id": "food",
    "name": "Food Store",
    "hp": 80,
    "defenseSlots": 1,
    "squadSlot": true,
    "passiveEffect": { "type": "food_cap_bonus", "amount": 100 },
    "upgrade": {
      "cost": { "soil": 30 },
      "passiveEffect": { "type": "food_cap_bonus", "amount": 200 }
    }
  },
  {
    "id": "barracks",
    "name": "Barracks",
    "hp": 90,
    "defenseSlots": 1,
    "squadSlot": true,
    "passiveEffect": { "type": "unlock_major_ant_at_wave", "wave": 4 },
    "upgrade": {
      "cost": { "food": 50, "soil": 30 },
      "passiveEffect": { "type": "squad_capacity_bonus", "amount": 2 }
    }
  },
  {
    "id": "study",
    "name": "Study Chamber",
    "hp": 60,
    "defenseSlots": 0,
    "squadSlot": false,
    "passiveEffect": null,
    "unlocksAfterBreach": true
  }
]
```

### `data/units.json`
```json
[
  {
    "id": "worker",
    "name": "Worker",
    "hp": 10,
    "attack": 2,
    "speed": 1.5,
    "role": "repair",
    "repairRatePerTick": 0.5,
    "costPerUnit": { "food": 8 }
  },
  {
    "id": "soldier",
    "name": "Soldier",
    "hp": 30,
    "attack": 10,
    "speed": 1.2,
    "role": "melee",
    "costPerUnit": { "food": 15 }
  },
  {
    "id": "major_ant",
    "name": "Major Ant",
    "hp": 80,
    "attack": 18,
    "speed": 0.7,
    "role": "tank",
    "costPerUnit": { "food": 30 },
    "requiresBarracks": true
  }
]
```

### `data/adaptations.json`
```json
[
  {
    "id": "spore_scrubber_unlock",
    "name": "Spore Scrubbers",
    "requires": { "fungal_sample": 3 },
    "unlocks": "defense:spore_scrubber"
  },
  {
    "id": "vibration_sentinel_unlock",
    "name": "Vibration Sentinels",
    "requires": { "pale_borer_sample": 2 },
    "unlocks": "defense:vibration_sentinel"
  },
  {
    "id": "pheromone_anchor_unlock",
    "name": "Pheromone Anchors",
    "requires": { "pheromone_leech": 2 },
    "unlocks": "defense:pheromone_anchor"
  },
  {
    "id": "deep_guard_caste",
    "name": "Deep Guard Caste",
    "requires": { "pale_borer_sample": 4, "fungal_sample": 2 },
    "unlocks": "unit:deep_guard"
  },
  {
    "id": "acid_recomposition",
    "name": "Acid Recomposition",
    "requires": { "blind_centipede_larva": 1 },
    "unlocks": "upgrade:acid_sprayer_deep"
  },
  {
    "id": "brood_quarantine",
    "name": "Brood Quarantine",
    "requires": { "brood_worm": 2 },
    "unlocks": "passive:brood_contamination_resist"
  }
]
```

### `data/waves.json`
```json
[
  {
    "wave": 1, "act": 1, "warningTicks": 300,
    "spawns": [
      { "enemy": "mite_swarm", "count": 3, "entrance": "entrance_left", "target": "brood", "intervalTicks": 60 }
    ]
  },
  {
    "wave": 2, "act": 1, "warningTicks": 300,
    "spawns": [
      { "enemy": "mite_swarm", "count": 4, "entrance": "entrance_right", "target": "brood", "intervalTicks": 50 },
      { "enemy": "beetle_tank", "count": 1, "entrance": "entrance_center", "target": "queen", "intervalTicks": 0 }
    ]
  },
  {
    "wave": 3, "act": 1, "warningTicks": 300,
    "spawns": [
      { "enemy": "spider_runner", "count": 2, "entrance": "entrance_left", "target": "queen", "intervalTicks": 90 },
      { "enemy": "mite_swarm", "count": 5, "entrance": "entrance_right", "target": "brood", "intervalTicks": 40 }
    ]
  },
  {
    "wave": 4, "act": 1, "warningTicks": 270,
    "spawns": [
      { "enemy": "robber_ant", "count": 3, "entrance": "entrance_left", "target": "food", "intervalTicks": 60 },
      { "enemy": "beetle_tank", "count": 1, "entrance": "entrance_center", "target": "queen", "intervalTicks": 0 },
      { "enemy": "mite_swarm", "count": 4, "entrance": "entrance_right", "target": "brood", "intervalTicks": 45 }
    ]
  },
  {
    "wave": 5, "act": 1, "warningTicks": 270,
    "spawns": [
      { "enemy": "wasp_assassin", "count": 1, "entrance": "entrance_center", "target": "queen", "intervalTicks": 0 },
      { "enemy": "robber_ant", "count": 4, "entrance": "entrance_left", "target": "food", "intervalTicks": 50 },
      { "enemy": "spider_runner", "count": 3, "entrance": "entrance_right", "target": "queen", "intervalTicks": 80 }
    ]
  },
  {
    "wave": 6, "act": 1, "warningTicks": 240,
    "spawns": [
      { "enemy": "beetle_tank", "count": 2, "entrance": "entrance_center", "target": "queen", "intervalTicks": 180 },
      { "enemy": "wasp_assassin", "count": 2, "entrance": "entrance_right", "target": "queen", "intervalTicks": 120 },
      { "enemy": "mite_swarm", "count": 6, "entrance": "entrance_left", "target": "brood", "intervalTicks": 35 }
    ]
  },
  {
    "wave": 7, "act": 1, "warningTicks": 240,
    "foreshadow": "tremor",
    "foreshadowMessage": "Vibrations detected below mapped colony.",
    "spawns": [
      { "enemy": "robber_ant", "count": 5, "entrance": "entrance_left", "target": "food", "intervalTicks": 45 },
      { "enemy": "spider_runner", "count": 4, "entrance": "entrance_right", "target": "queen", "intervalTicks": 70 },
      { "enemy": "wasp_assassin", "count": 2, "entrance": "entrance_center", "target": "queen", "intervalTicks": 150 }
    ]
  },
  {
    "wave": 8, "act": 1, "warningTicks": 240,
    "foreshadow": "worker_refusal",
    "foreshadowMessage": "Workers refuse to enter lower tunnels.",
    "spawns": [
      { "enemy": "beetle_tank", "count": 3, "entrance": "entrance_center", "target": "queen", "intervalTicks": 150 },
      { "enemy": "wasp_assassin", "count": 3, "entrance": "entrance_right", "target": "queen", "intervalTicks": 100 },
      { "enemy": "robber_ant", "count": 6, "entrance": "entrance_left", "target": "food", "intervalTicks": 40 }
    ]
  },
  {
    "wave": 9, "act": 1, "warningTicks": 240,
    "foreshadow": "crack",
    "foreshadowMessage": "Hairline fractures observed beneath the queen chamber.",
    "afterWaveEvent": "underbreach_trigger",
    "spawns": [
      { "enemy": "beetle_tank", "count": 3, "entrance": "entrance_center", "target": "queen", "intervalTicks": 120 },
      { "enemy": "wasp_assassin", "count": 4, "entrance": "entrance_right", "target": "queen", "intervalTicks": 90 },
      { "enemy": "spider_runner", "count": 5, "entrance": "entrance_left", "target": "queen", "intervalTicks": 60 },
      { "enemy": "robber_ant", "count": 4, "entrance": "entrance_left", "target": "food", "intervalTicks": 50 }
    ]
  },
  {
    "wave": 10, "act": 2, "warningTicks": 360,
    "note": "First deep wave — survivable, teaches new threat vector",
    "spawns": [
      { "enemy": "pale_borer", "count": 2, "entrance": "deep_entrance_a", "target": "queen", "intervalTicks": 240 },
      { "enemy": "spore_mite", "count": 4, "entrance": "deep_entrance_a", "target": "brood", "intervalTicks": 60 }
    ]
  },
  {
    "wave": 11, "act": 2, "warningTicks": 300,
    "spawns": [
      { "enemy": "spore_mite", "count": 6, "entrance": "deep_entrance_a", "target": "brood", "intervalTicks": 50 },
      { "enemy": "blind_centipede_larva", "count": 1, "entrance": "deep_entrance_b", "target": "queen", "intervalTicks": 0 },
      { "enemy": "mite_swarm", "count": 3, "entrance": "entrance_center", "target": "brood", "intervalTicks": 60 }
    ]
  },
  {
    "wave": 12, "act": 2, "warningTicks": 270,
    "spawns": [
      { "enemy": "pheromone_leech", "count": 2, "entrance": "deep_entrance_a", "target": "junction", "intervalTicks": 180 },
      { "enemy": "brood_worm", "count": 2, "entrance": "deep_entrance_b", "target": "brood", "intervalTicks": 120 },
      { "enemy": "beetle_tank", "count": 2, "entrance": "entrance_center", "target": "queen", "intervalTicks": 150 }
    ]
  },
  {
    "wave": 13, "act": 2, "warningTicks": 270,
    "spawns": [
      { "enemy": "blind_centipede_larva", "count": 2, "entrance": "deep_entrance_b", "target": "queen", "intervalTicks": 300 },
      { "enemy": "spore_mite", "count": 8, "entrance": "deep_entrance_a", "target": "brood", "intervalTicks": 40 },
      { "enemy": "wasp_assassin", "count": 3, "entrance": "entrance_right", "target": "queen", "intervalTicks": 90 },
      { "enemy": "pheromone_leech", "count": 2, "entrance": "deep_entrance_a", "target": "junction", "intervalTicks": 150 }
    ]
  },
  {
    "wave": 14, "act": 2, "warningTicks": 360,
    "isBossWave": true,
    "afterWaveEvent": "victory",
    "spawns": [
      { "enemy": "glass_pale_centipede", "count": 1, "entrance": "deep_entrance_b", "target": "queen", "intervalTicks": 0 },
      { "enemy": "spore_mite", "count": 10, "entrance": "deep_entrance_a", "target": "brood", "intervalTicks": 35 },
      { "enemy": "pheromone_leech", "count": 3, "entrance": "deep_entrance_a", "target": "junction", "intervalTicks": 120 }
    ]
  }
]
```

### `data/maps/act1_map.json`

Canvas: 1200×900 viewport. Full map height: 1100px (Act 1 y:0–600; deep map y:600–1100). Camera pans vertically; viewport always 900px.

```json
{
  "mapWidth": 1200,
  "mapHeight": 1100,
  "viewportHeight": 900,
  "nodes": [
    { "id": "entrance_left",    "type": "entrance",      "x": 100,  "y": 50,  "visible": true,  "defenseSlots": 0, "squadSlot": false, "hp": 9999, "maxHp": 9999 },
    { "id": "entrance_center",  "type": "entrance",      "x": 600,  "y": 50,  "visible": true,  "defenseSlots": 0, "squadSlot": false, "hp": 9999, "maxHp": 9999 },
    { "id": "entrance_right",   "type": "entrance",      "x": 1100, "y": 50,  "visible": true,  "defenseSlots": 0, "squadSlot": false, "hp": 9999, "maxHp": 9999 },
    { "id": "junc_upper_left",  "type": "junction",      "x": 200,  "y": 160, "visible": true,  "defenseSlots": 1, "squadSlot": true,  "hp": 60,   "maxHp": 60 },
    { "id": "food_store",       "type": "food",          "x": 360,  "y": 160, "visible": true,  "defenseSlots": 1, "squadSlot": true,  "hp": 80,   "maxHp": 80 },
    { "id": "junc_upper_right", "type": "junction",      "x": 950,  "y": 160, "visible": true,  "defenseSlots": 1, "squadSlot": true,  "hp": 60,   "maxHp": 60 },
    { "id": "junc_mid_center",  "type": "junction",      "x": 600,  "y": 280, "visible": true,  "defenseSlots": 2, "squadSlot": true,  "hp": 80,   "maxHp": 80 },
    { "id": "fungus_farm",      "type": "junction",      "x": 300,  "y": 360, "visible": true,  "defenseSlots": 1, "squadSlot": false, "hp": 60,   "maxHp": 60 },
    { "id": "barracks",         "type": "barracks",      "x": 820,  "y": 360, "visible": true,  "defenseSlots": 1, "squadSlot": true,  "hp": 90,   "maxHp": 90 },
    { "id": "brood_chamber",    "type": "brood",         "x": 560,  "y": 430, "visible": true,  "defenseSlots": 1, "squadSlot": true,  "hp": 100,  "maxHp": 100 },
    { "id": "deep_defense",     "type": "junction",      "x": 600,  "y": 520, "visible": true,  "defenseSlots": 2, "squadSlot": true,  "hp": 70,   "maxHp": 70 },
    { "id": "queen_chamber",    "type": "queen",         "x": 600,  "y": 610, "visible": true,  "defenseSlots": 2, "squadSlot": true,  "hp": 200,  "maxHp": 200 },
    { "id": "deep_junction_a",  "type": "deep_junction", "x": 400,  "y": 730, "visible": false, "defenseSlots": 1, "squadSlot": true,  "hp": 50,   "maxHp": 50 },
    { "id": "deep_junction_b",  "type": "deep_junction", "x": 780,  "y": 760, "visible": false, "defenseSlots": 1, "squadSlot": true,  "hp": 50,   "maxHp": 50 },
    { "id": "study_chamber",    "type": "study",         "x": 280,  "y": 840, "visible": false, "defenseSlots": 0, "squadSlot": false, "hp": 60,   "maxHp": 60 },
    { "id": "deep_entrance_a",  "type": "deep_entrance", "x": 180,  "y": 870, "visible": false, "defenseSlots": 0, "squadSlot": false, "hp": 9999, "maxHp": 9999 },
    { "id": "deep_entrance_b",  "type": "deep_entrance", "x": 940,  "y": 890, "visible": false, "defenseSlots": 0, "squadSlot": false, "hp": 9999, "maxHp": 9999 }
  ],
  "edges": [
    { "id": "e_entL_juncUL",   "nodeA": "entrance_left",   "nodeB": "junc_upper_left",  "width": "large", "length": 120, "visible": true,  "defenseSlots": 1, "hp": 9999, "maxHp": 9999 },
    { "id": "e_entC_juncMC",   "nodeA": "entrance_center", "nodeB": "junc_mid_center",  "width": "large", "length": 230, "visible": true,  "defenseSlots": 2, "hp": 9999, "maxHp": 9999 },
    { "id": "e_entR_juncUR",   "nodeA": "entrance_right",  "nodeB": "junc_upper_right", "width": "large", "length": 120, "visible": true,  "defenseSlots": 1, "hp": 9999, "maxHp": 9999 },
    { "id": "e_juncUL_food",   "nodeA": "junc_upper_left", "nodeB": "food_store",       "width": "ant",   "length": 80,  "visible": true,  "defenseSlots": 1, "hp": 60,   "maxHp": 60 },
    { "id": "e_juncUL_juncMC", "nodeA": "junc_upper_left", "nodeB": "junc_mid_center",  "width": "large", "length": 160, "visible": true,  "defenseSlots": 1, "hp": 60,   "maxHp": 60 },
    { "id": "e_juncUR_juncMC", "nodeA": "junc_upper_right","nodeB": "junc_mid_center",  "width": "large", "length": 175, "visible": true,  "defenseSlots": 1, "hp": 60,   "maxHp": 60 },
    { "id": "e_juncMC_fungus", "nodeA": "junc_mid_center", "nodeB": "fungus_farm",      "width": "ant",   "length": 120, "visible": true,  "defenseSlots": 0, "hp": 60,   "maxHp": 60 },
    { "id": "e_juncMC_brcks",  "nodeA": "junc_mid_center", "nodeB": "barracks",         "width": "ant",   "length": 140, "visible": true,  "defenseSlots": 0, "hp": 60,   "maxHp": 60 },
    { "id": "e_juncMC_brood",  "nodeA": "junc_mid_center", "nodeB": "brood_chamber",    "width": "large", "length": 110, "visible": true,  "defenseSlots": 1, "hp": 80,   "maxHp": 80 },
    { "id": "e_brood_deepDef", "nodeA": "brood_chamber",   "nodeB": "deep_defense",     "width": "large", "length": 90,  "visible": true,  "defenseSlots": 1, "hp": 80,   "maxHp": 80 },
    { "id": "e_deepDef_queen", "nodeA": "deep_defense",    "nodeB": "queen_chamber",    "width": "large", "length": 90,  "visible": true,  "defenseSlots": 2, "hp": 100,  "maxHp": 100 },
    { "id": "e_queen_deepA",   "nodeA": "queen_chamber",   "nodeB": "deep_junction_a",  "width": "large", "length": 130, "visible": false, "defenseSlots": 1, "hp": 80,   "maxHp": 80 },
    { "id": "e_queen_deepB",   "nodeA": "queen_chamber",   "nodeB": "deep_junction_b",  "width": "large", "length": 160, "visible": false, "defenseSlots": 1, "hp": 80,   "maxHp": 80 },
    { "id": "e_deepA_study",   "nodeA": "deep_junction_a", "nodeB": "study_chamber",    "width": "ant",   "length": 80,  "visible": false, "defenseSlots": 0, "hp": 50,   "maxHp": 50 },
    { "id": "e_deepA_entA",    "nodeA": "deep_junction_a", "nodeB": "deep_entrance_a",  "width": "large", "length": 150, "visible": false, "defenseSlots": 1, "hp": 50,   "maxHp": 50 },
    { "id": "e_deepB_entB",    "nodeA": "deep_junction_b", "nodeB": "deep_entrance_b",  "width": "large", "length": 160, "visible": false, "defenseSlots": 1, "hp": 50,   "maxHp": 50 }
  ]
}
```

---

## 7. File Structure

```
formicarium/
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── package.json
├── data/
│   ├── tuning.json
│   ├── enemies.json
│   ├── units.json
│   ├── defenses.json
│   ├── chambers.json
│   ├── waves.json
│   ├── adaptations.json
│   └── maps/
│       └── act1_map.json
└── src/
    ├── main.ts
    ├── types/
    │   ├── game.ts          ← GameState and all entity interfaces
    │   ├── data.ts          ← JSON schema interfaces
    │   ├── commands.ts      ← InputCommand union
    │   └── events.ts        ← SimEvent and SimEventType
    ├── sim/
    │   ├── GameSim.ts       ← tick() orchestrator; owns GameState
    │   ├── Pathfinder.ts    ← BFS on graph; returns edge path
    │   ├── WaveSpawner.ts   ← reads waves.json; emits EnemyInstance
    │   ├── CombatResolver.ts← defense DPS; enemy movement; node damage
    │   ├── PhaseController.ts← phase state machine
    │   ├── ResourceManager.ts← income, spending, cap enforcement
    │   ├── BreachController.ts← foreshadow events; underbreach trigger
    │   ├── AdaptationManager.ts← sample tracking; unlock gating (Seg 3)
    │   ├── SquadController.ts  ← squad logic (Segment 2)
    │   └── __tests__/
    │       ├── Pathfinder.test.ts
    │       ├── PhaseController.test.ts
    │       ├── ResourceManager.test.ts
    │       ├── WaveSpawner.test.ts
    │       ├── CombatResolver.test.ts
    │       └── BreachController.test.ts
    ├── scenes/
    │   ├── BootScene.ts     ← load all JSON; generate procedural textures
    │   ├── GameScene.ts     ← update loop; dispatches to sim and renderers
    │   └── UIScene.ts       ← parallel scene; fixed camera; HUD
    ├── render/
    │   ├── MapRenderer.ts
    │   ├── EnemyRenderer.ts
    │   ├── DefenseRenderer.ts
    │   ├── SquadRenderer.ts    ← Segment 2
    │   └── EffectRenderer.ts   ← consumes SimEvent[]; camera shake; overlays
    ├── ui/
    │   ├── HUD.ts
    │   ├── BuildPanel.ts
    │   ├── SelectionPanel.ts
    │   ├── WaveAlert.ts
    │   └── AdaptationPanel.ts  ← Segment 3
    └── audio/
        └── SoundManager.ts     ← consumes SimEvent[]; no Phaser scene dependency
```

---

## 8. Input Command Model

```typescript
// src/types/commands.ts

export type InputCommand =
  | { type: 'place_defense'; defenseTypeId: string; nodeId?: string; edgeId?: string }
  | { type: 'upgrade_defense'; defenseInstanceId: string }
  | { type: 'upgrade_chamber'; nodeId: string }
  | { type: 'assign_squad'; squadId: string; nodeId?: string; edgeId?: string }
  | { type: 'set_squad_stance'; squadId: string; stance: SquadStance }
  | { type: 'spawn_squad'; unitTypeId: string; count: number }
  | { type: 'unlock_adaptation'; adaptationId: string }
  | { type: 'advance_phase' }
  | { type: 'select_node'; nodeId: string }
  | { type: 'select_edge'; edgeId: string }
  | { type: 'deselect' };
```

---

## 9. Rendering Approach

### Camera
- Phaser camera y-axis panning only. Default origin: y=0, shows y:0–900.
- After breach: camera may pan to reveal y:200–1100. Add mouse-wheel or keyboard pan.
- No x-panning needed.

### Node Rendering
- Circle (r=30–50) with type icon. Color by type: queen=gold, brood=orange, food=green, barracks=red, junction=grey, deep_junction=purple, entrance=white.
- HP bar below node when damaged.
- Defense slot indicators visible during build phase on selected node.
- Contamination: animated purple-green tint.

### Edge Rendering
- Quadratic bezier between node centers.
- `width: 'ant'` → thin dashed line; `width: 'large'` → thick solid.
- Defense slots shown as small icons at edge midpoint.
- Resin barricade active → red tint overlay on edge.

### Enemy Rendering
- Sprite position = lerp along bezier by `enemy.progress`.
- Surface enemies: red triangle; deep enemies: purple triangle; boss: large red diamond.
- Swarm tags (mite_swarm): render as 3 offset sprites.
- DoT active: pulsing red tint.

### Effect Rendering (consumes SimEvent[])
- `FORESHADOW_EVENT` → `cameras.main.shake()`
- `BREACH_TRIGGERED` → black flash + camera pan animation
- `NODE_CONTAMINATED` → particle burst at node
- `QUEEN_HIT` → brief screen vignette
- `ADAPTATION_UNLOCKED` → chime + icon flash

---

## 10. Task Breakdown

**Each task = one logical commit. Verify before starting the next.**

### Implementer tier — CODEX ONLY (GPT-5.5 reasoning effort per task)
*This table applies only to the **Codex** lane (GPT-5.5, which has a switchable reasoning-effort setting). The **ChatGPT connector lane runs at 5.5 High throughout and ignores this table** — if ChatGPT ever falls back to 5.4 under rate limits, pause that lane rather than implement invariant-heavy work with the weaker model.*

`high` = residual ambiguity, cross-file/refactor scope, stateful/sequenced logic, judgment/balance, **or** high blast radius (a subtle error propagates — shared types, core state, orchestration, seam/invariant-setting code). `medium` = well-specified, low-blast, mostly single-file execution. Default to `high` when uncertain. Codex reads this table and tells you when to switch effort (it does not decide on its own).

| Task | Tier | Why |
|---|---|---|
| T01 Project Scaffold | medium | boilerplate scaffold, fully specified |
| T02 Type Definitions | **high** | shared types — maximum blast radius |
| T03 Data Files | medium | transcribe spec JSON verbatim |
| T04 Pathfinder | **high** | core algorithm + target-alias subtlety |
| T05 PhaseController + ResourceManager | **high** | stateful phase machine + cliffhanger branch |
| T06 WaveSpawner | **high** | stateful queue + alias/path integration |
| T07 CombatResolver | **high** | most complex sim; high blast radius |
| T08 BreachController | **high** | stateful/sequenced cliffhanger mechanism |
| T09 GameSim Orchestrator | **high** | orchestration + fixed-timestep core |
| T10 BootScene | **high** | establishes the texture-key seam |
| T11 GameScene + MapRenderer | **high** | sets node-container + layer-stack invariants |
| T12 EnemyRenderer | medium | self-contained sprite renderer |
| T13 DefenseRenderer | medium | self-contained renderer, clear spec |
| T14 EffectRenderer | **high** | stateful tween sequences + camera work |
| T15 HUD (UIScene) | **high** | cross-scene command-queue wiring |
| T16 BuildPanel + SelectionPanel | medium | contained UI, clear flow |
| T17 WaveAlert | medium | display panel, clear spec |
| T18 Recovery Phase | medium | small additions, verify existing |
| T19 Audio (SoundManager) | medium | contained event→sfx mapping |
| T20 Act 1 Balance Pass | **high** | balance/tuning judgment |
| T21 SquadController + Squad UI | **high** | stateful, cross-file, muddiest interaction |
| T22 Segment 2 Balance Pass | **high** | balance/tuning judgment |
| T23 Resume from Breach Cliffhanger | **high** | stateful phase-resume + data extend |
| T24 Deep Enemy Mechanics + Act 2 Waves | **high** | new stateful mechanics, cross-file |
| T25 Study Chamber + Adaptations | **high** | new system, cross-file unlock gating |
| T26 Act 2 Balance Pass | **high** | balance/tuning judgment |
| T27 Resolution Screen + Domain Expansion | **high** | stateful snapshot/restore + sequence |
| A5 BootScene art swap | **high** | touches the texture-key seam |
| A6 Art integration pass | medium | wire tints + scale parity |

(Art tasks A1–A4 are the parallel art track — direction, manifest, SVG authoring, raster backdrop — not GPT-5.5 coding tasks.)

**Natural session clusters** (run without switching effort, dependency order permitting): the medium pair **T12–T13**; the medium run **T16–T19**; **T01/T03** medium. Everything else is high — the sim/orchestration/seam core (T02, T04–T11, T14–T15), all balance passes, and all of Segments 2–3 (T20–T27). For what remains now, that's one medium session (**T17–T19**), then high for the rest.

---

## SEGMENT 1 — Gate 1: Static Defense Only

---

### T01 — Project Scaffold
**Files:** `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`

**Steps:**
1. `npm create vite@latest formicarium -- --template vanilla-ts`
2. `npm install phaser`
3. `npm install -D vitest`
4. `tsconfig.json`: `"strict": true`, `"target": "ES2020"`, `"moduleResolution": "bundler"`
5. `vite.config.ts`: `assetsInclude: ['**/*.json']`
6. `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: {
       environment: 'node',
       include: ['src/**/*.test.ts'],
       passWithNoTests: true,   // prevents exit-1 before any test files exist
     },
   });
   ```
7. Create `src/sim/__tests__/smoke.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   describe('smoke', () => {
     it('test runner works', () => { expect(true).toBe(true); });
   });
   ```
8. `src/main.ts`: create `Phaser.Game` (width:1200, height:900, type:AUTO, scenes:[BootScene])
9. Add `window.__sim: GameSim | null = null` to main.ts for dev console access

**Verify:** `npm run dev` → blank canvas, no errors. `npm test` → smoke test passes (1 test, 0 failures).

---

### T02 — Type Definitions
**Files:** `src/types/game.ts`, `src/types/data.ts`, `src/types/commands.ts`, `src/types/events.ts`

**Steps:**
1. Copy all interfaces from §4 (State Model) into `game.ts`
2. Add to `data.ts`:
   ```typescript
   export interface EnemyData {
     id: string; name: string; hp: number; attack: number; speed: number;
     armor: number; targetPriority: string[]; tags: string[]; act: number;
     reward: Partial<Record<keyof Resources, number>>;
     sampleDrop?: string; onDeath?: string; onReach?: string; bossWave?: number;
   }
   export interface WaveSpawn { enemy: string; count: number; entrance: string; target: string; intervalTicks: number; }
   export interface WaveData {
     wave: number; act: number; warningTicks: number; spawns: WaveSpawn[];
     foreshadow?: string; foreshadowMessage?: string;
     afterWaveEvent?: 'underbreach_trigger' | 'victory'; isBossWave?: boolean;
   }
   export interface DefenseEffects { slowFactor?: number; dps?: number; dotDuration?: number; cooldownTicks?: number; cleanRatePerTick?: number; detectsBurrowers?: boolean; warningTicks?: number; preventsPanic?: boolean; }
   export interface DefenseData {
     id: string; name: string; placement: 'node' | 'edge'; cost: Partial<Record<keyof Resources, number>>;
     hp: number; effects: DefenseEffects; tags: string[];
     upgrade?: { cost: Partial<Record<keyof Resources, number>>; hp: number; effects: DefenseEffects; };
     requiresAdaptation?: string;
   }
   export interface NodeData { id: string; type: NodeState['type']; x: number; y: number; visible: boolean; defenseSlots: number; squadSlot: boolean; hp: number; maxHp: number; }
   export interface EdgeData { id: string; nodeA: string; nodeB: string; width: 'ant' | 'large'; length: number; visible: boolean; defenseSlots: number; hp: number; maxHp: number; }
   export interface MapData { mapWidth: number; mapHeight: number; viewportHeight: number; nodes: NodeData[]; edges: EdgeData[]; }
   export interface TuningData {
     ticksPerSecond: number;
     startingResources: Record<keyof Resources, number>;
     resourceCaps: Record<keyof Resources, number>;
     recoveryIncomePer10Ticks: Record<keyof Resources, number>;
     recoveryPhaseDurationTicks: number;
     buildPhaseDurationTicks: number;
     breachRevealDelayTicks: number;
     cameraShakeDurationMs: number; cameraShakeIntensity: number;
     breachFlashDurationMs: number; breachCameraScrollDurationMs: number;
     enemyDeathLingerTicks: number;
     patrolIntervalTicks: number;
     squadRetaliationDpsMultiplier: number;
     enemySpeedScale?: number;  // traversal-speed multiplier; see movement formula in T07
   }
   ```
3. Copy `InputCommand` from §8 into `commands.ts`
4. Copy `SimEvent` and `SimEventType` from §5 into `events.ts`

**Verify:** `npm run typecheck` → zero errors.

---

### T03 — Data Files
**Files:** All files under `data/`

**Steps:**
1. Create all JSON files exactly as specified in §6
2. **Exception: `data/waves.json` in Segment 1 contains waves 1–9 only.** Waves 10–14 (specified in §6) are added in T23 (Segment 3). Do not include them now — their absence is what causes PhaseController to enter `'ended'` after wave 9 recovery.
3. In BootScene stub (or a temp script): import each file and `console.log` to verify parse

**Verify:** No JSON parse errors in console on load. `data/waves.json` contains exactly 9 wave entries.

---

### T04 — Pathfinder
**Files:** `src/sim/Pathfinder.ts`, `src/sim/__tests__/Pathfinder.test.ts`

**Implementation:**
```typescript
export class Pathfinder {
  constructor(
    private nodes: Map<string, NodeState>,
    private edges: Map<string, EdgeState>
  ) {}

  // Returns ordered list of edge IDs from startNode to goalNode.
  // Returns [] if no path exists.
  findPath(startNodeId: string, goalNodeId: string): string[] { /* BFS */ }

  // Given an edge and the node the traveler came FROM, returns the other node id.
  getOtherNode(edge: EdgeState, fromNodeId: string): string { }

  // Resolves node-type ALIASES (e.g. "queen", "brood", "food", "junction") to a
  // concrete node ID. Walks `priority` in order; for each alias returns the id of
  // the first VISIBLE node whose `type === alias`, in map insertion order. The
  // insertion-order tiebreak is REQUIRED and deterministic — "junction" matches
  // several nodes and the choice must not vary. Returns null if nothing matches.
  resolveTarget(priority: string[], nodes: Map<string, NodeState>): string | null { }
}
```

**Tests (`Pathfinder.test.ts`):**
```typescript
// Build a minimal 3-node, 2-edge test graph inline (do not load JSON in unit tests)
test('finds direct path between adjacent nodes')
test('finds multi-hop path')
test('returns empty array when no path exists')
test('getOtherNode returns correct endpoint')
test('resolveTarget picks first matching node type from priority list')
test('resolveTarget maps a type alias to the concrete node id (queen → queen_chamber)')
test('resolveTarget tiebreak is deterministic: returns first matching node in insertion order')
test('resolveTarget skips invisible nodes')
test('resolveTarget returns null when no alias matches any visible node')
```

**Trap:** Do not use edge `length` as BFS weight. BFS finds the fewest hops. Length only affects animation speed. Enemy pathing is topology-based.

**Verify:** `npm test` → all Pathfinder tests pass.

---

### T05 — PhaseController + ResourceManager
**Files:** `src/sim/PhaseController.ts`, `src/sim/ResourceManager.ts`, `src/sim/__tests__/PhaseController.test.ts`, `src/sim/__tests__/ResourceManager.test.ts`

**PhaseController:**
```typescript
export class PhaseController {
  // Returns SimEvents for any phase transition that occurred this tick.
  tick(state: GameState, commands: InputCommand[], tuning: TuningData): SimEvent[] { }
}
```
- `scout → build`: on `advance_phase` command OR after `warningTicks` (from current wave data) elapses
- `build → wave`: on `advance_phase` command OR after `tuning.buildPhaseDurationTicks`
- `wave → recovery`: when `state.waveEnemiesRemaining === 0`
- `recovery → scout`: after `tuning.recoveryPhaseDurationTicks`; increment wave number; look up next wave data
  - If next wave data **exists**: set `phase = 'scout'`; emit `PHASE_TRANSITION { toPhase: 'scout' }`
  - If next wave data **does not exist**: set `phase = 'ended'`; emit `PHASE_TRANSITION { toPhase: 'ended' }` ← **Segment 1 cliffhanger path**
- `ended`: terminal; no further transitions. UIScene shows cliffhanger screen on this phase.

**ResourceManager:**
```typescript
export class ResourceManager {
  // Applies recovery income during recovery phase.
  // Returns SimEvents (none currently, placeholder for future).
  tick(state: GameState, tuning: TuningData): SimEvent[] { }

  // Attempts to spend resources. Returns true if successful, false if insufficient.
  spend(state: GameState, cost: Partial<Record<keyof Resources, number>>): boolean { }

  // Apply food_cap_bonus from upgraded Food Store nodes.
  recomputeCaps(state: GameState, chambers: ChamberData[]): void { }

  // Adds reward resources, clamped to caps. Called by CombatResolver on enemy KILL.
  grant(state: GameState, reward: Partial<Record<keyof Resources, number>>): void { }
}
```

**PhaseController tests:**
```typescript
test('scout advances to build on advance_phase command')
test('scout advances to build automatically after warningTicks')
test('build advances to wave on advance_phase')
test('wave advances to recovery when waveEnemiesRemaining reaches 0')
test('recovery advances to scout after recoveryPhaseDurationTicks when next wave exists')
test('recovery advances to ended after recoveryPhaseDurationTicks when no next wave exists')
test('wave number increments on recovery→scout transition')
test('emits PHASE_TRANSITION { toPhase: ended } when entering cliffhanger')
test('emits PHASE_TRANSITION event on every transition')
```

**ResourceManager tests:**
```typescript
test('spend returns false and does not mutate state when resources insufficient')
test('spend deducts correctly when resources sufficient')
test('recovery income applies only during recovery phase')
test('recovery income respects resource caps')
test('food cap increases when food_store upgraded')
test('grant adds reward resources and clamps each to its cap')
```

**Verify:** `npm test` → all tests pass.

---

### T06 — WaveSpawner
**Files:** `src/sim/WaveSpawner.ts`, `src/sim/__tests__/WaveSpawner.test.ts`

**Implementation:**
```typescript
export class WaveSpawner {
  constructor(private waves: WaveData[], private enemies: EnemyData[], private pathfinder: Pathfinder) {}

  // Called once when wave phase begins. Enqueues all spawns for this wave.
  startWave(state: GameState, waveNumber: number): SimEvent[] { }

  // Called each tick during wave phase. Spawns enemies whose tick has arrived.
  tick(state: GameState): SimEvent[] { }
}
```

- `startWave` sets `state.waveEnemiesRemaining` = total spawn count for this wave
- Each spawn becomes a queue entry `{ enemyTypeId, entranceNodeId, targetAlias, spawnAtTick }` — note `targetAlias` is the raw `spawn.target` string (a node-type alias, e.g. `"queen"`), NOT a node id
- `spawnAtTick` = `state.tick + spawn.intervalTicks * spawnIndex`
- `tick()` checks queue; when `state.tick >= entry.spawnAtTick`, creates `EnemyInstance`:
  - **Resolve the alias first:** `targetNodeId = pathfinder.resolveTarget([targetAlias], state.nodes)`. If it returns null (target type not present/visible), fall back to `queen_chamber`. Store as `EnemyInstance.targetNodeId`.
  - Set `pathEdges` via `pathfinder.findPath(entranceNodeId, targetNodeId)`
  - Set `edgeId = pathEdges[0]`, `progress = 0`
  - Set `speed`, `armor`, `hp`, `maxHp` from enemy data
  - Set `slowFactor = 1.0`, `dotDamage = 0`, `dotTicksRemaining = 0`
  - Emit `WAVE_STARTED` on first spawn of wave

**Tests:**
```typescript
test('startWave sets waveEnemiesRemaining to total spawn count')
test('enemies spawn at correct tick intervals')
test('spawn target alias is resolved to a concrete node id before pathing (queen → queen_chamber)')
test('spawned enemy has correct pathEdges from entrance to resolved target')
test('spawned enemy initial edgeId is first edge in path')
test('emits WAVE_STARTED event on first spawn')
```

**Verify:** `npm test` → all tests pass.

---

### T07 — CombatResolver
**Files:** `src/sim/CombatResolver.ts`, `src/sim/__tests__/CombatResolver.test.ts`

**Segment 1 scope: defenses vs enemies only. No squad combat.**

```typescript
export class CombatResolver {
  constructor(private enemies: EnemyData[], private defenses: DefenseData[]) {}

  tick(state: GameState, deltaMs: number): SimEvent[] { }
}
```

**Note:** `deltaMs` here is always `NOMINAL_DELTA_MS` — the fixed sim step (§3 Determinism). Never a wall-clock value. Damage follows the canonical **Damage model** defined in §6 (after `defenses.json`) — implement that, not an improvised per-defense scheme.

**Enemy movement (per enemy per tick):**
1. Advance `progress += (speed * tuning.enemySpeedScale * slowFactor * deltaMs) / (currentEdge.length * 1000)`
   - **The `enemySpeedScale` factor is required.** Without it, crossing time ≈ `length * 1000 / speed` ms — at the 60fps fixed step a 120px edge takes ~67s, so enemies crawl and the wave phase never visibly ends. With `enemySpeedScale = 30`, crossing time ≈ `length * 1000 / (speed * 30)` ms (~2.2s for that edge). Pass the scale into `CombatResolver` (constructor arg, default 1 so unit tests are unaffected); `GameSim` supplies `tuning.enemySpeedScale`. Refine the value in the balance pass (T20).
2. If `progress >= 1.0`:
   - Move to next edge: `pathEdges.shift()`; set `edgeId = pathEdges[0]`; reset `progress = 0`
   - If `pathEdges` is now empty → enemy has reached `targetNodeId`:
     - Deal `attack` damage to target node HP
     - If target node is `queen_chamber`: also decrement `state.queenHp` by `attack`; emit `QUEEN_HIT`
     - Emit `ENEMY_REACHED_GOAL`
     - Remove enemy from `state.enemies`
     - Decrement `state.waveEnemiesRemaining`
     - If `state.queenHp <= 0`: set `state.gameOver = true`; emit `GAME_OVER`

**Defense fire (per defense per tick) — follow the §6 Damage model exactly:**
- **resin_barricade** (slow, no damage): for every enemy on its edge without `ignores_resin`, set `enemy.slowFactor = effects.slowFactor`. Reset an enemy's `slowFactor` to `1.0` when it leaves a barricaded edge.
- **guard_post** (continuous): deal `effects.dps * (deltaMs / 1000)` to every enemy on its node or an edge incident to its node. `cooldownTicks` ignored. Emit `DEFENSE_FIRED` (throttle the *event* to ~once/sec so audio isn't spammed; damage is still every tick).
- **acid_sprayer** (DoT): decrement `cooldownTicksRemaining`; when it hits 0, for every enemy on its node or an incident edge, apply a DoT — `enemy.dotDamage = max(0, dps - enemy.armor) / tuning.ticksPerSecond`, `enemy.dotTicksRemaining = dotDuration * tuning.ticksPerSecond` — then set `cooldownTicksRemaining = effects.cooldownTicks` and emit `DEFENSE_FIRED`.

**DoT ticks (per enemy per tick):**
1. If `dotTicksRemaining > 0`: subtract `dotDamage` from enemy HP; decrement `dotTicksRemaining`.
2. If enemy HP ≤ 0: handle via the shared **kill** path below.

**Kill path (any time an enemy's HP reaches 0 — DoT or continuous damage):**
- Remove from `state.enemies`
- **Grant `reward`** via `resourceManager.grant(state, enemyData.reward)` (capped)
- Emit `ENEMY_DIED` (payload `{ enemyId, enemyTypeId }` — AdaptationManager consumes this in Segment 3 for samples)
- Decrement `state.waveEnemiesRemaining`
- (Goal-reach removal, handled in Enemy movement above, grants **no** reward.)

**Tags affecting combat:**
- `ignores_resin`: do not apply `slowFactor` from resin_barricade to this enemy

**Node damage (no squad involvement):**
- Nodes with `hp < maxHp` do NOT auto-repair in Segment 1. Repair is Segment 2 (workers).

**Tests:**
```typescript
test('enemy advances along edge each tick proportional to speed and deltaMs')
test('enemy transitions to next edge when progress >= 1.0')
test('enemy reaching target node deals attack damage to node hp')
test('enemy reaching queen_chamber decrements queenHp')
test('enemy death from hp depletion decrements waveEnemiesRemaining')
test('enemy goal-reach decrements waveEnemiesRemaining')
test('both death and goal-reach emit the correct SimEvent')
test('killing an enemy grants its reward to resources')
test('granted reward is clamped to resource caps')
test('reaching goal grants NO reward')
test('acid_sprayer applies a DoT that deals post-armor damage per tick and expires after dotDuration')
test('guard_post deals continuous per-tick damage and ignores cooldownTicks')
test('armor reduces damage to floor of 0')
test('resin_barricade sets slowFactor on enemies on its edge')
test('ignores_resin tag prevents slowFactor from resin_barricade')
test('game over set when queenHp reaches 0')
```

**Trap:** `waveEnemiesRemaining` must decrement on **both** paths of removal (death AND goal-reach). Missing either will cause waves to never complete.

**Verify:** `npm test` → all tests pass.

---

### T08 — BreachController
**Files:** `src/sim/BreachController.ts`, `src/sim/__tests__/BreachController.test.ts`

**Segment 1 scope: foreshadow events + breach trigger + visual reveal cliffhanger. Wave 10 mechanics are NOT wired here — AdaptationManager and deep wave start are Segment 3.**

**Cliffhanger mechanism:** After `DEEP_NODES_REVEALED` fires, PhaseController (T05) will attempt to advance from recovery to the next wave. It calls `waves.find(w => w.wave === state.wave + 1)`. In Segment 1, waves.json has no wave 10, so this returns `undefined` → PhaseController sets `state.phase = 'ended'` and emits `PHASE_TRANSITION { toPhase: 'ended' }`. UIScene shows a cliffhanger screen. No wave 10 starts. This is by design — wave 10 data is absent until Segment 3.

```typescript
export class BreachController {
  constructor(private waves: WaveData[], private tuning: TuningData) {}

  // Called on wave start. Queues foreshadow event if wave has one.
  onWaveStart(state: GameState, waveNumber: number): SimEvent[] { }

  // Called each tick. Handles breach reveal countdown after afterWaveEvent fires.
  tick(state: GameState): SimEvent[] { }

  // Called by GameSim when afterWaveEvent === 'underbreach_trigger' fires.
  // Sets breachTriggered, starts countdown. Does NOT start wave 10.
  triggerBreach(state: GameState): SimEvent[] { }

  // Called when afterWaveEvent === 'victory' fires (Segment 3 only).
  triggerVictory(state: GameState): SimEvent[] { }
}
```

**Foreshadow:**
- On wave start, if wave has `foreshadow` field: push to `state.foreshadowEvents`; emit `FORESHADOW_EVENT` with payload `{ foreshadowType, message }`

**Breach trigger (fires when wave 9 `afterWaveEvent === 'underbreach_trigger'`):**
1. Set `state.breachTriggered = true`; emit `BREACH_TRIGGERED`
2. Start internal countdown of `tuning.breachRevealDelayTicks`
3. When countdown reaches 0: set all `visible: false` nodes/edges to `visible: true`; set `state.deepNodesVisible = true`; emit `DEEP_NODES_REVEALED`
4. *(PhaseController then enters `'ended'` on next recovery→scout attempt — no further action needed from BreachController)*

**Victory trigger (Segment 3):**
1. Set `state.victory = true`; `state.claimedDeepNodes = true`; emit `VICTORY`

**Tests:**
```typescript
test('foreshadow event queued and emitted on wave 7 start')
test('foreshadow event queued and emitted on wave 8 start')
test('foreshadow event queued and emitted on wave 9 start')
test('triggerBreach sets breachTriggered = true and emits BREACH_TRIGGERED')
test('deep nodes remain visible: false until breachRevealDelayTicks elapses')
test('deep nodes set visible: true after delay; DEEP_NODES_REVEALED emitted')
test('triggerBreach does NOT set state.phase or start wave 10')
test('triggerVictory sets victory = true and claimedDeepNodes = true')
```

**Verify:** `npm test` → all tests pass.

---

### T09 — GameSim Orchestrator
**Files:** `src/sim/GameSim.ts`

```typescript
export class GameSim {
  private state: GameState;
  private tuning: TuningData;
  // sub-systems initialized in constructor

  constructor(data: { tuning: TuningData; map: MapData; waves: WaveData[]; enemies: EnemyData[]; defenses: DefenseData[]; chambers: ChamberData[]; units: UnitData[]; }) { }

  // Returns SimEvent[] for this tick. State is mutated internally.
  tick(deltaMs: number, commands: InputCommand[]): SimEvent[] { }

  // Returns readonly reference — do not mutate outside sim.
  getState(): Readonly<GameState> { }
}
```

**tick(realDeltaMs, commands) — fixed-timestep driver (§3 Determinism):**
- Maintain an internal `accumulatorMs`. On each call: `accumulatorMs += realDeltaMs`.
- While `accumulatorMs >= NOMINAL_DELTA_MS`: run **one fixed step** (the ordered sub-steps below) with `deltaMs = NOMINAL_DELTA_MS`; then `accumulatorMs -= NOMINAL_DELTA_MS`.
- Apply `commands` only on the **first** fixed step of the call (subsequent steps in the same call get `[]`).
- Accumulate every fixed step's events; return the concatenated `SimEvent[]`.
- Guard against spiral-of-death: cap fixed steps per call (e.g. 5); discard excess accumulator.

**Ordered sub-steps within one fixed step:**
1. Process `commands` (placement, upgrade, advance_phase — no squad commands until Segment 2)
2. `phaseController.tick()` — may change phase; collect events
3. If phase just became `'wave'` and it's a new wave: `waveSpawner.startWave()`
4. `waveSpawner.tick()` — spawn queued enemies
5. `combatResolver.tick()` — move enemies; fire defenses; apply damage; grant kill rewards
6. `breachController.onWaveStart()` on wave start; `breachController.tick()` always
7. Check `afterWaveEvent` on wave data when `waveEnemiesRemaining === 0`
8. `resourceManager.tick()` — recovery income
9. Collect all events from this step

**Command processing (Segment 1 only):**
- `place_defense`: validate slot exists, node/edge visible, cost affordable, adaptation unlocked → create `DefenseInstance`; deduct resources
- `upgrade_defense`: validate upgrade affordable → apply upgrade stats; deduct resources
- `upgrade_chamber`: same pattern
- `advance_phase`: pass to PhaseController
- `select_node` / `select_edge`: set `state.selectedId` + `state.selectedKind` (both defined in §4 GameState); `deselect`: set both to `null`

**Verify:** Run game to wave 3 manually. Verify events returned each tick include expected types. `window.__sim.getState()` in console shows correct state.

---

### T10 — BootScene
**Files:** `src/scenes/BootScene.ts`

**Steps:**
1. `preload()`: load all JSON via `this.load.json(key, path)` for tuning, enemies, units, defenses, chambers, waves, adaptations, map
2. Generate procedural **placeholder** textures via `this.make.graphics()` (dev-time scaffold; replaced by production art in §11/A5 under these same keys):
   - `node_queen`: filled gold circle r=40
   - `node_brood`: filled orange circle r=35
   - `node_food`: filled green circle r=35
   - `node_barracks`: filled red circle r=35
   - `node_junction`: filled grey circle r=28
   - `node_deep`: filled purple circle r=28
   - `node_entrance`: filled white circle r=20
   - `enemy_surface`: red triangle 20px
   - `enemy_deep`: purple triangle 20px
   - `enemy_boss`: red diamond 40px
   - `defense_barricade`: blue rectangle 30×8
   - `defense_acid`: green circle r=10
   - `defense_guard`: white square 20×20
3. `create()`: instantiate `GameSim` with all loaded data; expose as `window.__sim`; start `GameScene` and `UIScene`

**Trap:** Do not block on external art assets *during development* — placeholders keep mechanics unblocked. But art is **not** post-MVP: production art ships with Phase 1 (§11). Keep all texture creation in BootScene under stable keys so the swap (A5) is a one-file change.

**Verify:** Both scenes start. `window.__sim` available in console.

---

### T11 — GameScene + MapRenderer
**Files:** `src/scenes/GameScene.ts`, `src/render/MapRenderer.ts`

**GameScene:**
```typescript
create() {
  this.sim = (window as any).__sim as GameSim;
  this.mapRenderer = new MapRenderer(this);
  this.enemyRenderer = new EnemyRenderer(this);
  this.defenseRenderer = new DefenseRenderer(this);
  this.effectRenderer = new EffectRenderer(this);
  this.soundManager = new SoundManager(this.sound);
  this.mapRenderer.init(this.sim.getState());
}

update(_time: number, delta: number) {
  const commands = this.uiCommands.flush();   // UIScene pushes commands here
  const events = this.sim.tick(delta, commands);
  this.soundManager.process(events);
  this.effectRenderer.process(events);
  const state = this.sim.getState();
  this.mapRenderer.update(state);
  this.enemyRenderer.update(state);
  this.defenseRenderer.update(state);
  // squadRenderer added in Segment 2
}
```

**MapRenderer:**
- `init(state)`: create Phaser containers for each node; draw all edges as Graphics
- `update(state)`: for each node: update HP bar; update contamination tint; set alpha=0 if not visible
- Edges: redraw Graphics each frame (cheap for this node count)
- Node click: push `select_node` command to UIScene command queue

**Verify:** Act 1 map renders. Nodes clickable. Deep nodes invisible.

---

### T12 — EnemyRenderer
**Files:** `src/render/EnemyRenderer.ts`

**Steps:**
1. `Map<string, Phaser.GameObjects.Container>` keyed by enemy instance id
2. `update(state)`:
   - Create containers for enemies not yet in map
   - Destroy containers for enemy ids no longer in `state.enemies`
   - Position each container: `getPointOnEdge(edge, progress)` — lerp along bezier
3. `getPointOnEdge(edgeId, progress)`: compute quadratic bezier point using nodeA pos, midpoint offset, nodeB pos
4. Scale container by `hp/maxHp` (min 0.6)
5. For `swarm` tag: render 3 sprites offset ±6px

**Verify:** Mites move from `entrance_left` toward `brood_chamber` during wave 1.

---

### T13 — DefenseRenderer
**Files:** `src/render/DefenseRenderer.ts`

**Steps:**
1. `Map<string, Phaser.GameObjects.Container>` keyed by defense instance id
2. `update(state)`: create/destroy containers to match `state.defenses`
3. Defense position: if `nodeId` → node center; if `edgeId` → `getEdgeMidpoint(edgeId)`
4. HP bar below defense sprite if HP < maxHp
5. During build phase with a node/edge selected: render slot indicator circles at available slots

**Verify:** Resin barricade placed on edge → appears at edge midpoint.

---

### T14 — EffectRenderer
**Files:** `src/render/EffectRenderer.ts`

**Steps:**
1. `process(events: SimEvent[])` called each frame before render:
   - `FORESHADOW_EVENT` → `this.cameras.main.shake(tuning.cameraShakeDurationMs, tuning.cameraShakeIntensity)`
   - `QUEEN_HIT` → brief red vignette overlay (alpha 0.3 → 0, 300ms)
   - `NODE_CONTAMINATED` → particle burst at node position
   - `BREACH_TRIGGERED` → start breach sequence (black flash → camera pan) — set flag, animate over next N ticks
   - `DEEP_NODES_REVEALED` → fade in deep nodes (alpha 0→1, 1500ms)
   - `VICTORY` → start victory sequence flag
2. Breach sequence (stateful animation over multiple frames):
   - Tween black overlay alpha 0→1 (500ms)
   - Tween camera y offset to reveal deep map (2000ms)
   - Tween black overlay alpha 1→0 (1000ms)
3. Narrative popup text: brief centered message for `FORESHADOW_EVENT` and `BREACH_TRIGGERED`

**Verify:** Wave 7 triggers camera shake. Breach triggers flash + scroll. Narrative text appears.

---

### T15 — HUD (UIScene)
**Files:** `src/scenes/UIScene.ts`, `src/ui/HUD.ts`

**Steps:**
1. UIScene is a parallel scene (both GameScene and UIScene active simultaneously)
2. UIScene has its own fixed camera (ignores GameScene camera transforms)
3. HUD:
   - Top bar: Food | Soil | Resin (values from `state.resources`)
   - Top right: Wave X/14, Phase label (SCOUT / BUILD / WAVE / RECOVERY)
   - Center-top: Queen HP bar (prominent; always visible; pulses red on `QUEEN_HIT` event)
   - Bottom right: "Ready" button → pushes `advance_phase` command
4. No squad UI in Segment 1
5. When `state.phase === 'ended'` (cliffhanger): show overlay screen:
   ```
   Something stirs below.
   The colony holds its breath.

   [ Cliffhanger — Act 2 coming in Segment 3 ]
   [ Play Again ]
   ```
   "Play Again" resets GameSim to initial state (wave 1).
6. UIScene exposes a `commandQueue: InputCommand[]` that GameScene reads via `flush()`
7. UIScene calls `sync(state, events)` each frame to update displayed values

**Verify:** Resources update. Phase label changes. Queen HP bar decreases on hit. Ready button advances phase. After wave 9 breach sequence, cliffhanger screen appears.

---

### T16 — BuildPanel + SelectionPanel
**Files:** `src/ui/BuildPanel.ts`, `src/ui/SelectionPanel.ts`

**BuildPanel (bottom bar, visible during build phase):**
1. Show icons for all 3 defenses; grey out if resources insufficient or adaptation not unlocked
2. Click defense icon → enter placement mode (cursor changes; valid slot highlights appear)
3. Click valid slot → push `place_defense` command; exit placement mode
4. Show cost tooltip on hover

**SelectionPanel (right panel, visible when node/edge selected):**
1. Show chamber name, HP, defense slot count
2. List placed defenses; show upgrade button if upgrade affordable
3. Click upgrade → push `upgrade_defense` or `upgrade_chamber` command
4. No squad assignment in Segment 1

**Trap:** Click-to-place only. No drag-and-drop. No squad assignment panel until Segment 2.

**Verify:** Place acid sprayer on node during build phase. Cost deducted. Defense appears. Upgrade button functional.

---

### T17 — WaveAlert
**Files:** `src/ui/WaveAlert.ts`

**Steps:**
1. During scout phase: display incoming wave composition panel (top-center)
   - List enemy types with icon + count
   - Show "QUEEN TARGETED" warning if any enemy in wave has `priority_queen` tag or targetPriority[0] === 'queen'
   - Show `foreshadowMessage` if present on wave data
2. Foreshadow popup: dismissible overlay with message; appears when `FORESHADOW_EVENT` received
3. Breach narrative popup: full-screen dismissible overlay on `BREACH_TRIGGERED`; shows "The floor splits. Something moves below." then "The colony has never been attacked from below. Old defenses will not hold."
4. Popups do not pause gameplay; game continues while displayed

**Verify:** Wave 5 shows QUEEN TARGETED. Wave 7 foreshadow popup appears. Breach narrative shows after wave 9.

---

### T18 — Recovery Phase
**Files:** `src/sim/ResourceManager.ts` (verify tick behavior), `src/render/EnemyRenderer.ts` (update), `src/ui/HUD.ts` (update)

**Steps:**
1. During recovery phase: `ResourceManager.tick()` applies income every 10 ticks (already in T05)
2. Enemy death linger: when enemy is removed (`ENEMY_DIED`), EnemyRenderer keeps sprite visible for `tuning.enemyDeathLingerTicks` ticks then fades out — do not remove sprite immediately
3. Resource income popups: when income ticks, show small `+N` text floating up from resource icon (HUD)
4. Nodes do NOT auto-repair in Segment 1 (repair requires Worker squads, Segment 2)
5. Phase auto-advances to scout after `tuning.recoveryPhaseDurationTicks` — already in PhaseController

**Verify:** After wave 1: resources tick up during recovery. Dead mite sprites linger briefly. Phase advances to scout automatically.

---

### T19 — Audio (SoundManager)
**Files:** `src/audio/SoundManager.ts`, `src/scenes/BootScene.ts` (update)

**SoundManager:**
```typescript
export class SoundManager {
  constructor(private sound: Phaser.Sound.BaseSoundManager) {}
  process(events: SimEvent[]): void { }
  setMuted(muted: boolean): void { }
}
```

Event → sfx mapping:
- `QUEEN_HIT` → `sfx_queen_hit`
- `ENEMY_DIED` → `sfx_enemy_death`
- `DEFENSE_FIRED` → `sfx_defense_fire` (check payload.defenseTypeId for variety)
- `WAVE_STARTED` → `sfx_phase_wave`
- `PHASE_TRANSITION` (toPhase: 'recovery') → `sfx_phase_recovery`
- `BREACH_TRIGGERED` → `sfx_breach`
- `ADAPTATION_UNLOCKED` → `sfx_adaptation_unlock`
- `NODE_CONTAMINATED` → `sfx_contaminate`

**Audio generation in BootScene (no external files):**
- Use Phaser's WebAudio via `this.sound.add()` with `AudioContext` tone synthesis, OR
- Encode 8 minimal CC0 sound effects as base64 data URIs in a `src/audio/sfx_data.ts` constants file and load via `this.load.audio(key, dataUri)`
- Mute toggle button in HUD top-right

**Trap:** SoundManager must not import from `src/sim/`. It receives `SimEvent[]` only. No Phaser scene reference beyond `BaseSoundManager`.

**Verify:** Queen hit plays sound. Wave start plays sound. No audio errors in console. Mute button works.

---

### T20 — Act 1 Balance Pass
**Files:** `data/waves.json`, `data/tuning.json` (tuning only — no code changes)

**Steps:**
1. Play waves 1–9 three times from fresh start
2. Record which waves feel trivial vs impossible
3. Adjust in JSON only: wave `spawns` counts, `intervalTicks`, enemy `hp`/`speed` in enemies.json, defense `cost`/`effects` in defenses.json, `startingResources` in tuning.json
4. Fun-oracle (§0/D2): player faces at least one hard placement decision per wave; wrong placement has visible consequence

**Gate 1 pass criteria:**
- Average first-playthrough loss point: wave 5–9
- At least one wave causes genuine placement regret
- Player can survive to wave 9 with good play

**Trap:** Do not add code to fix balance. If the loop isn't tense, the fix is JSON tuning or UI clarity, not new features.

**Verify:** 3 playthroughs meet criteria above.

---

## SEGMENT 2 — Mobile Squads

**Build only after Gate 1 acceptance criteria pass.**

---

### T21 — SquadController + SquadRenderer + Squad UI
**Files:** `src/sim/SquadController.ts`, `src/render/SquadRenderer.ts`, `src/ui/BuildPanel.ts` (update), `src/ui/SelectionPanel.ts` (update), `src/ui/HUD.ts` (update), `src/sim/CombatResolver.ts` (extend)

**SquadController:**
```typescript
export class SquadController {
  constructor(private units: UnitData[], private pathfinder: Pathfinder, private tuning: TuningData) {}
  tick(state: GameState, deltaMs: number): SimEvent[] { }
}
```

Stance behaviors:
- `hold`: squad stays at assigned node/edge; fights enemies at same location
- `intercept`: each tick, scan enemies within 1 hop of squad assignment; if found, reassign squad to that enemy's edge
- `retreat`: reassign squad to the adjacent node 1 step closer to `queen_chamber` (use Pathfinder)
- `repair`: workers only; heal assigned node by `unit.repairRatePerTick * count * (deltaMs/1000)` per tick; only during recovery phase
- `patrol`: every `tuning.patrolIntervalTicks` ticks, alternate between assigned node and one pre-chosen adjacent node

**Squad combat (extend CombatResolver.tick in Segment 2):**
- Squads at a location deal `unit.attack * count * (deltaMs/1000)` DPS to enemies at same node/edge
- Enemies at same location deal back `unit.attack * 0.5 * (deltaMs/1000)` * enemy count to squad HP (multiplier from `tuning.squadRetaliationDpsMultiplier`)
- Squad HP ≤ 0: emit `SQUAD_PANICKED` (flavour), remove squad
- `pheromone_leech` onReach: set affected squads within 1 hop to `retreat` stance temporarily (100 ticks)

**SquadRenderer:**
- Badge at assigned node center or edge midpoint
- Icon from unit type + count label
- Border color: hold=white, intercept=orange, retreat=blue, repair=green, patrol=yellow
- Pulse when in combat

**Squad UI additions:**
- BuildPanel: add squad spawn section (unit icon + count selector + assign button)
- SelectionPanel: show assigned squads at selected node; stance buttons
- Squad spawn: deduct cost per unit; create `SquadInstance` in state

**Verify:** Soldier squad assigned to `junc_mid_center` with `hold` deals DPS to beetles. Workers in `repair` stance restore node HP during recovery. Intercept reassigns squad to nearby enemy edge.

---

### T22 — Segment 2 Balance Pass
**Files:** `data/tuning.json`, `data/units.json` (tuning only)

**Steps:**
1. Play waves 1–9 with squads available; tune squad costs, HP, attack in JSON
2. Squads should add options, not trivialize static defenses — player shouldn't abandon defenses just to squad-rush

**Verify:** Combined static defense + squad play still produces hard decisions each wave.

---

## SEGMENT 3 — The Underbreach

**Build only after Segment 2 is stable.**

---

### T23 — Resume from Breach Cliffhanger
**Files:** `data/waves.json` (extend), `src/scenes/UIScene.ts` (update), `src/sim/PhaseController.ts` (verify)

**What this task does:** The breach visual and foreshadow already work (T08, T14, T17). The cliffhanger screen shows after wave 9. This task extends waves.json with waves 10–14, which causes PhaseController to advance past `'ended'` into wave 10 scout. It also removes the cliffhanger screen and replaces it with a wave 10 scout → the narrative popups already wired in T17 serve as the transition.

**Steps:**
1. Add waves 10–14 to `data/waves.json` (from §6 — already specified; just excluded until now)
2. Verify PhaseController now advances from recovery (wave 9) → scout (wave 10) instead of `'ended'`
3. Update UIScene: remove the Segment 1 cliffhanger screen; the `'ended'` phase no longer fires after wave 9
4. Add crack sprite in MapRenderer beneath `queen_chamber` for wave 9 foreshadow (`foreshadow: 'crack'`): static graphic, persists until breach
5. Verify WaveAlert shows wave 10 composition during wave 10 scout phase

**Verify:** Play to end of wave 9 → breach sequence fires → deep nodes reveal → wave 10 scout phase begins (not cliffhanger screen) → wave 10 composition shows in WaveAlert.

---

### T24 — Deep Enemy Mechanics + Act 2 Waves
**Files:** `src/sim/WaveSpawner.ts` (verify), `src/sim/CombatResolver.ts` (update), `src/sim/__tests__/CombatResolver.test.ts` (extend), `src/render/EnemyRenderer.ts` (update)

**What this task does:** The breach visual is done (T14) and deep nodes are revealed (T08). This task wires the actual Act 2 enemy behaviors behind the already-revealed deep map: deep pathing, contamination, squad disruption, spore-scrubber cleanup, deep/boss rendering. (`contaminationLevel` is already a canonical field on `NodeState` — §4 — so no ad-hoc interface changes.)

**Steps:**
1. **Deep pathing (verify, likely no code change):** deep spawns (`deep_entrance_a`/`b` → alias targets) resolve via the same `resolveTarget` + `findPath` flow as surface spawns (T04/T06). The deep entrances are ordinary nodes; once visible, BFS pathing upward to the queen just works. Confirm with a test rather than assuming.
2. **Tag behaviors in CombatResolver:**
   - `ignores_resin` — already handled (T07)
   - `contaminates` + `onDeath: 'contaminate_node'`: on the enemy's **kill path**, set its current node's `contaminationLevel = 1.0` and `contaminated = true`; emit `NODE_CONTAMINATED { nodeId }`
   - `disrupts_squads` + `onReach: 'panic_nearby_squads'`: on goal-reach, set squads within 1 hop to `'retreat'` for 100 ticks; emit `SQUAD_PANICKED`. (No-op if no squads exist — harmless.)
   - `causes_panic` (boss): same as above but 2-hop radius
3. **Spore scrubber cleanup:** each fixed tick, if the scrubber's node has `contaminationLevel > 0`, reduce it by `effects.cleanRatePerTick * (deltaMs / 1000)`, clamp at 0, and set `contaminated = false` when it hits 0.
4. **EnemyRenderer:** enemies with `act: 2` use the purple triangle texture; the boss uses the large red diamond.

**Tests (extend CombatResolver.test.ts):**
```typescript
test('deep enemy paths from deep_entrance to resolved target (queen_chamber)')
test('contaminating enemy death sets node contaminationLevel to 1.0 and contaminated true')
test('spore scrubber drains contaminationLevel toward 0 and clears contaminated flag')
```

**Verify:** Wave 10 pale borers spawn at `deep_entrance_a`, path through `deep_junction_a` to queen. Spore mite death sets node `contaminationLevel = 1.0`; a placed spore scrubber drains it over time. Two-front wave 11 runs without crash.

---

### T25 — Study Chamber + Adaptations
**Files:** `src/sim/AdaptationManager.ts`, `src/ui/AdaptationPanel.ts`, `src/ui/SelectionPanel.ts` (update)

**AdaptationManager:**
```typescript
export class AdaptationManager {
  constructor(private adaptations: AdaptationData[]) {}

  // Called on ENEMY_DIED event. Increments sample count if enemy has sampleDrop.
  onEnemyDied(state: GameState, enemyTypeId: string): SimEvent[] { }

  // Called each tick. Checks all adaptations; auto-unlocks when requirements met.
  tick(state: GameState): SimEvent[] { }
}
```

**AdaptationPanel (shown when study_chamber selected):**
- List each adaptation with sample requirements and current counts
- Progress bar per requirement (e.g., "Fungal Samples: 2/3")
- When requirements met: adaptation auto-unlocks; `ADAPTATION_UNLOCKED` event emitted
- Unlocked adaptations immediately appear in BuildPanel

**Verify:** Kill 3 spore mites → fungal_sample count = 3 → spore_scrubber_unlock fires → spore_scrubber appears in BuildPanel → place it → contaminated node cleans.

---

### T26 — Act 2 Balance Pass
**Files:** `data/waves.json`, `data/enemies.json` (tuning only)

**Criteria:**
- Waves 10–13 survivable with zero adaptations but punishing — contamination spreads, squads get disrupted
- Wave 14 boss: survivable with ≥2 adaptations + active squad at queen; very difficult with zero adaptations
- Two-front defense creates genuine tension without feeling impossible

**Verify:** Playthrough with no adaptations → loss at wave 11–13. With 3 adaptations → can beat wave 14.

---

### T27 — Resolution Screen + Domain Expansion
**Files:** `src/scenes/UIScene.ts` (update), `src/render/MapRenderer.ts` (update)

**Victory sequence (triggered when `VICTORY` event received):**
1. Surviving enemies retreat — EnemyRenderer moves remaining sprites toward their entrance node and fades them out over 1s
2. Zoom camera out to show full map height (both tiers simultaneously) — tween camera zoom over 2s
3. Deep nodes flip color: purple → colony amber (MapRenderer checks `state.claimedDeepNodes`)
4. Worker sprites (simple dots) animate sweeping through deep edges — cosmetic only, not sim-driven
5. Fade to black over 2s

**Resolution screen text:**
```
THE UNDERBREACH IS YOURS.

The Glass-Pale Centipede fell. The deep invaders have been driven back
into the furthest cracks and forgotten places.

Workers descend through the breach — not to repair, but to claim.
New chambers grow where the pale things once nested.
The colony breathes in two tiers now.

Something lies further still. Beyond the living soil.
A wall of stone. The smell of grease and old metal.
The sound of something enormous, moving slowly.

[ THE BASEMENT AWAITS — Act 3 ]

[ Play Again ]     [ Main Menu ]
```

**Game Over screen (on `GAME_OVER` event):**
```
THE QUEEN HAS FALLEN.

[ Try Act 2 Again ]     [ Restart from Wave 1 ]
```

**"Play Again"** resets `GameSim` to fresh state (wave 1, full resources, all defenses removed).
**"Try Act 2 Again"** resets to wave 10 state snapshot — GameSim must save a snapshot of state at the start of wave 10 for this.

**Verify:** Survive wave 14 → enemies retreat → zoom out → deep nodes go amber → resolution screen. Game over screen shows retry options.

---

## 11. Art Production (MVP-Required, Parallel Workstream)

Production art is a **Phase 1 ship requirement**, not post-MVP. The fakeout (design doc §0/D1) depends on Act 1 reading as a polished "tight little game" — players judge Act 1 and quit if it bores them, *before* the Underbreach fires. Placeholder primitives read as "impoverished," not "elegant minimalism," and break that bounce-test. So the shipped Phase 1 build must use production art.

It must **not block mechanics development**, so it runs as a **parallel workstream** against the texture-key seam — the legitimate exception to the single-implementer rule, since art touches no game code and can be done by a separate effort/agent.

### 11.1 The texture-key seam (why this is safe to parallelize and land late)
Renderers reference art **only by texture key** — `MapRenderer.NODE_TEXTURES` (`node_queen`, `node_brood`, …), `EnemyRenderer.textureForEnemy` (`enemy_surface/deep/boss`), and the `defense_*` keys. BootScene fills those keys. Swapping placeholder→production art is therefore a change to **BootScene only**, under identical keys — renderers never change. Art becomes a drop-in, swappable key by key.

**Invariant (binds every renderer task, T11–T17 and on):** renderers must never hardcode a color, shape, or sprite. All texture creation/loading lives in BootScene. A new visual entity adds a new key + a placeholder in BootScene + a manifest row (§11.3) — same pattern. **Nodes are layered Phaser containers, never collapsed to a single sprite** — this preserves the icon→chamber-space upgrade (§11.6).

### 11.2 Art direction (decided): hybrid vector + raster
- **Vector / SVG for all gameplay entities + UI** — the ~13 sprite keys plus HUD chrome. Authored as SVG: generatable as code, editable, tiny, and **runtime-tintable** (one shape tinted per state — contamination green, claimed-deep amber, deep-enemy glow). Legibility-first, matching the "lean, tight" gameplay feel.
- **One raster backdrop** for the soil-strata atmosphere — a single painted asset (surface→deep strata + glass formicarium frame). Mood without cross-sprite consistency cost; image-gen sourced, seeded by `formicarium_slice_view_concept.png`.
- Phaser rasterizes SVG to a texture at load — author at 2× target size for crispness; set load dimensions in BootScene.

### 11.3 Asset manifest (the contract)

| Key(s) | Subject | Size (≈) | Runtime tints |
|---|---|---|---|
| `node_queen / brood / food / barracks / junction / entrance / node_deep` | chambers + entrances | 56–80px | contamination green; claimed-deep amber |
| `enemy_surface / enemy_deep / enemy_boss` | enemies | 20–40px | hp fade; deep glow |
| `defense_barricade / acid / guard` | defenses | 16–30px | firing flash |
| `bg_strata` | backdrop (raster) | 1200×1100 | — |
| `hud_frame` + panel chrome | UI | varies | — |

(`node_deep` currently covers study/deep_junction/deep_entrance — split into distinct silhouettes later if needed.)

### 11.4 Workstream tasks (A1–A6 — parallel to the T-sequence, gated to finish before Phase 1 ship)
- **A1 — Direction lock.** One-page style guide + palette: surface amber/earthy-brown, deep pale-cyan/bioluminescent, the glass frame. Lock against the concept image.
- **A2 — Manifest.** Fill §11.3 fully from the live texture keys (audit the renderers for the authoritative list).
- **A3 — Entity + UI SVGs.** Author the sprite keys + HUD chrome: transparent, consistent scale, tint-ready (flat fills, no baked state-color).
- **A4 — Raster backdrop.** Generate `bg_strata` via image-gen seeded by the concept; one asset.
- **A5 — BootScene swap.** Replace procedural generation with `load.svg` / `load.image` under identical keys, behind a `USE_PLACEHOLDER_ART` flag for instant fallback. Renderers untouched.
- **A6 — Integration pass.** Scale/anchor parity vs placeholders; wire runtime tints (contamination, claimed-deep amber, deep-enemy glow); readability check at gameplay zoom.

### 11.5 Gate
Phase 1 ships only when: zero placeholder primitives in the build, every texture key resolves to production art, runtime tints work, and readability holds at gameplay zoom. Until A5, development continues on placeholders (T10) — never blocked.

### 11.6 Upgrade path (icon → concept-fidelity)
The vector v1 art is a **waypoint** to the concept-image look (`formicarium_slice_view_concept.png`), not a fork away from it. There are two tiers of upgrade, both preserved by the texture-key seam (§11.1):

**Tier A — richer baked sprite (pure key swap, supported today).** Replace a key's vector with a painterly raster of the same footprint — e.g. a single image that *depicts* the queen inside her chamber. Renderers don't change; it's the same BootScene swap as placeholder→vector, and it can be done **incrementally, one key at a time** (paint the queen first, leave junctions vector, ship the hybrid). The vector sprite doubles as the silhouette/proportion/composition spec the painter or image-gen works from — v1 work is not thrown away.

**Tier B — chamber as a living space (the richer evolution).** To make a node read as a *carved pocket with a creature inside it* — queen on her own layer, eggs reflecting brood state, lighting/contamination as separate overlays, optional idle animation — a node must be a **composable, layered region**, not one icon. MapRenderer already builds each node as a Phaser Container with layered children, so this is **additive** (add pocket-bg → interior → creature → fx → rim as children), not a rewrite. The node coordinate becomes the chamber *center*; contents lay out around it.

**Four disciplines that keep Tier B reachable (cheap now, expensive to retrofit):**
1. **Layer stack — define and honor it now:** `backdrop → terrain/pockets → edges → node contents → enemies → fx → UI`. This is what lets chambers later read as carved *into* the soil rather than floating on top.
2. **Manifest pins a footprint, not just a sprite size:** each node key records a region/radius (the chamber bounds), so swapping an icon for a pocket-space keeps layout stable.
3. **State as separate overlay layers, never baked into the base texture:** contamination, claimed-deep, hp, and selection are child layers/tints — so they work whether the base is a flat vector or a painted pocket. (This is also the flat-tint→overlay evolution: flat vectors tint cleanly; painterly bases get a glow/overlay child instead.)
4. **A node is always a container, never assumed to be one sprite:** no renderer may collapse a node to a single image. Centralize node-visual assembly + state application (one `applyNodeState(view, node, state)`) so the icon→space change happens in one place.

**Worked example — Queen Chamber.** Today `node_queen` is one container child (glow + silhouette icon). *Tier A:* swap that child for a painted queen-in-chamber image — same key, same footprint. *Tier B:* the container grows children — `pocket_walls` (terrain layer), `chamber_interior` (lit fill), `creature_queen` (the ant, animatable), `brood_eggs` (count-driven content), `glow`/`contamination` (fx overlays), `rim` — all anchored to the queen node coordinate. Renderers' positioning and the sim are untouched; the node just composes more layers.

---

## 12. Acceptance Criteria

### Segment 1 — Gate 1
- [ ] Waves 1–9 complete without crash or console error
- [ ] Queen HP decrements when queen-targeted enemies reach `queen_chamber`
- [ ] All 3 defenses placeable during build phase; costs deducted correctly
- [ ] Build → Wave → Recovery → Scout cycle completes cleanly
- [ ] `waveEnemiesRemaining` reaches 0 after all enemies either die or reach their goal
- [ ] Resources respect caps; spending fails gracefully when insufficient
- [ ] Foreshadow events fire on waves 7, 8, 9; crack sprite visible wave 9
- [ ] Player can lose (queenHp = 0 → game over screen)
- [ ] Sound effects play on queen hit, wave start, defense activation
- [ ] **Zero squad mechanics present** — no squad UI, no squad combat, no worker repair
- [ ] After wave 9: breach visual fires → deep nodes revealed → `state.phase` becomes `'ended'` → cliffhanger screen shows (not a crash or hang)
- [ ] `npm test` passes (smoke test + all sim tests green)
- [ ] `npm run typecheck` produces zero errors
- [ ] `npm run build` succeeds
- [ ] Fun-oracle: 3 playthroughs, average loss point wave 5–9, genuine placement regret each run

### Segment 2 — Squads
- [ ] All Segment 1 criteria pass (no regression)
- [ ] Squads assignable to nodes and edges; stances function correctly
- [ ] Workers in repair stance restore node HP during recovery phase
- [ ] Squads deal DPS to enemies; take retaliation damage; die when HP depleted
- [ ] Pheromone leech disrupts nearby squads on reach

### Segment 3 — Gate 2
- [ ] All Segment 2 criteria pass
- [ ] Breach sequence fires after wave 9: shake, flash, camera pan, deep map reveals
- [ ] Deep enemies spawn correctly and path upward toward queen
- [ ] Contamination: spore mite death → node contaminated → spore scrubber cleans it
- [ ] Study chamber collects samples; adaptations auto-unlock when requirements met
- [ ] Two-front defense playable without crash
- [ ] Boss wave beatable with adaptations; very difficult without
- [ ] Victory sequence: enemies retreat, zoom out, deep nodes go amber, text displays
- [ ] Game over screen shows act-2 retry option
- [ ] State snapshot saved at wave 10 start; "Try Act 2 Again" resets to it
- [ ] `npm test` still passes; `npm run build` zero errors

### Phase 1 Ship — Art (parallel workstream, §11)
- [ ] A1–A6 complete: zero placeholder primitives in the shipped build
- [ ] Every texture key resolves to production art (vector entities/UI + raster backdrop)
- [ ] Runtime tints work: contamination green, claimed-deep amber, deep-enemy glow
- [ ] Readability holds at gameplay zoom; renderers unchanged (swap was BootScene-only)

---

## 13. Build, Test, and Run Commands

```bash
# Install dependencies
npm install

# Development server (hot reload, port 5173)
npm run dev

# Run Vitest unit tests
npm test

# Run tests in watch mode
npm run test:watch

# TypeScript type check (no emit)
npm run typecheck

# Production build
npm run build

# Preview production build locally
npm run preview
```

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

**Dev console access:** `window.__sim.getState()` returns live GameState. `window.__sim.tick(16, [])` can be called manually to step the sim.

---

## 14. Implementation Traps

**Do not:**
- Import Phaser, SoundManager, or any render class in `src/sim/`. The sim is pure TypeScript.
- Have the sim call `soundManager.play()` or any consumer API. Emit a `SimEvent`; let consumers react.
- Hardcode any stat, cost, timing, or balance value in TypeScript. Use `data/tuning.json` or the relevant data file.
- Use pixel-based pathfinding (A*). Enemy pathing is BFS on the graph topology. Edge `length` only affects animation speed (time to traverse = length / speed / 1000ms).
- Implement freeform digging. All tunnels are in `act1_map.json`.
- Add squad combat in Segment 1. CombatResolver in Segment 1 handles defenses vs enemies only.
- Simulate individual ant movement. Squads are badges. They teleport to their assignment.
- Make the Underbreach instant-kill. Wave 10 must be survivable with zero deep adaptations.
- Build Act 3 content. The resolution screen references the basement in text only.
- Use `any` in TypeScript. Strict mode is required.
- Decrement `waveEnemiesRemaining` only on death — it must also decrement when an enemy reaches its goal and is removed.
- Pass `spawn.target` / `targetPriority` aliases straight into `findPath`. They are node-TYPES, not ids — resolve via `resolveTarget` first (`"queen"` → `queen_chamber`), else you get an empty path and the enemy never moves.
- Grant rewards on goal-reach. Rewards are granted **only on kill**; an enemy that reaches its goal grants nothing.
- Improvise a per-defense damage formula. There is one canonical Damage model (§6): continuous for guard_post, DoT for acid_sprayer, slow for resin_barricade.
- Step game logic by wall-clock `delta`. The sim advances by fixed `NOMINAL_DELTA_MS` steps only — variable delta breaks determinism and the Phase 2 replay guarantee.
- Forget to build the wave 10 state snapshot before implementing "Try Act 2 Again" in T27.
- Build AdaptationManager or AdaptationPanel before Segment 3 (scaffolded types are fine; wiring is not).
- Hardcode a color, shape, or sprite in any renderer. All texture creation lives in BootScene under stable keys (§11.1) so the placeholder→production art swap stays a one-file change. Bake state-color into a texture instead of tinting the sprite at runtime — production art relies on runtime tints.

**Do:**
- Expose `window.__sim` in development for console inspection.
- Write Vitest tests for each sim module before moving to the next task.
- Keep JSON files hot-reloadable (Vite's `assetsInclude` config handles this).
- Build Gate 1 to fun and tuneable before touching BreachController trigger logic.
- Treat `GameState` as the single source of truth. Renderers never hold their own copies of entity positions.
- Use `Map<string, X>` for nodes, edges, enemies, and defenses in state — O(1) lookup by id.
- Keep `GameSim.tick()` deterministic: same state + same commands = same next state + same events. This is required for Phase 2 agent replay.

---

## 15. Definition of Done

The implementation is complete when:

1. A first-time player can load the game, place defenses, survive or lose in Act 1, witness the Underbreach sequence, fight through Act 2, and reach either the resolution screen or game over — with no instruction beyond what the in-game UI shows.
2. `npm test` passes with all sim unit tests green.
3. `npm run build` completes with zero TypeScript errors.
4. No console errors or warnings during a full 14-wave playthrough.
5. All gameplay stats, timing, and costs are in JSON files — changing any value requires editing only JSON, not TypeScript.
6. The shipped build uses production art (§11) — no placeholder primitives; all texture keys resolve to vector entities/UI + the raster backdrop, with runtime tints working.
