# AGENTS.md — standing instructions for AI agents in this repo

**Formicarium** — a browser tower-defense game (Phaser 3 + TypeScript + Vite + Vitest). Before any task, read **`IMPLEMENTATION_PLAN.md`** (the single source of truth) and find your task's tier in the §10 "Implementer tier" table.

## Per-task: report your tier first
Before writing code, look up the task's tier in the §10 table and output one line:
`TIER: medium (Txx) — matches current effort` **or** `TIER: high (Txx) — switch to high before this task`.
Use the table's tier, not your own opinion. Flag any task that's clearly mis-tagged once you're into it.

## Do NOT revert these fixes (committed, intentional)
- **`vitest.config.ts` → `fileParallelism: false`.** Vitest 4's parallel pool fails on this Windows env (collects zero tests). Run tests from the project dir: `cd formicarium && npm test`.
- **`tuning.enemySpeedScale` (=30)**, threaded through `CombatResolver` (4th constructor arg, default 1) and `GameSim`. Movement is `progress += speed * enemySpeedScale * slowFactor * deltaMs / (length*1000)`. Without it, enemies crawl (~67s/edge).

## Architecture invariants (load-bearing — don't break these)
- **Sim purity:** `src/sim/` has ZERO imports from Phaser, render, audio, or UI. Pure TypeScript.
- **Determinism:** the sim advances in fixed `NOMINAL_DELTA_MS` steps, never by wall-clock delta. Same state + commands ⇒ same result (required for replay/tests).
- **SimEvent queue:** `GameSim.tick()` returns `SimEvent[]`; consumers (renderers/audio/effects) react to events — the sim never calls them directly.
- **Texture-key seam:** renderers reference art ONLY by texture key (`node_*`, `enemy_*`, `defense_*`). NEVER hardcode a color/shape/sprite in a renderer. All texture creation lives in `BootScene` under stable keys (so placeholder→production art is a one-file swap).
- **Nodes are layered Phaser containers,** never collapsed to a single sprite (preserves the icon→chamber-space upgrade, §11.6). Honor the layer stack: backdrop → terrain → edges → node contents → enemies → fx → UI.
- **State visuals are runtime tints/overlays,** never baked into a base texture.
- **Data-driven:** all stats/costs/timing live in `data/*.json` (and `tuning.json`); no magic numbers in TS.

## Art is MVP-required, built in PARALLEL
Production art ships with Phase 1 (the fakeout needs Act 1 to look polished), but it's a **parallel workstream** (§11, tasks A1–A6). Keep building mechanics on the placeholder textures; do not stop to make art or gold-plate visuals.

## Verification
Every change must keep `npm test`, `npm run typecheck`, and `npm run build` green — CI runs all three on push/PR. Tests use Vitest with inline fixtures; match the existing test conventions.

## Coordination (parallel lanes)
A separate tooling/QA lane commits in parallel — additional unit tests plus isolated files under `scripts/` and `docs/`. Expect commits and files you did NOT create; that's normal, not corruption. **`git pull` before you push.** Do not modify or depend on `scripts/` or `docs/` — they're not your tasks and never touch `src/`. Work on a branch + PR; never commit directly to a protected `main`.
