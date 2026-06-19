# Formicarium Defense

Formicarium Defense is a side-view ant-colony tower-defense game: the player protects a carved colony map with fixed defenses, resources, foreshadowed surface waves, and an Underbreach arc that expands the battlefield below the queen chamber.

## Tech stack

- Phaser 3
- TypeScript
- Vite
- Vitest

## Architecture

This project follows the architecture contract in `AGENTS.md` and `IMPLEMENTATION_PLAN.md`:

- `src/sim/` is pure TypeScript: no Phaser, render, audio, or UI imports.
- `GameSim.tick()` advances the simulation deterministically in fixed `NOMINAL_DELTA_MS` steps, not by wall-clock delta.
- The sim emits a `SimEvent[]` queue; renderers, effects, audio, and UI consume events instead of being called directly by sim code.
- Renderers reference art by stable texture keys such as `node_*`, `enemy_*`, and `defense_*`; texture creation/loading lives in `BootScene` so placeholder art can be swapped without changing renderers.
- Nodes are layered Phaser containers rather than single sprites, preserving the path from icon-style placeholders to richer chamber-space art.
- Gameplay stats, costs, and timing are data-driven through JSON files under `data/`.

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

Additional package scripts include `npm run preview` and `npm run test:watch`.

## Project layout

```text
data/          Gameplay JSON: tuning, enemies, units, defenses, chambers, waves, adaptations, maps
src/sim/       Pure deterministic simulation modules and unit tests
src/render/    Phaser renderers for map, enemies, defenses, effects, and future squads
src/scenes/    BootScene, GameScene, and UIScene orchestration
src/ui/        HUD, build/selection panels, wave alerts, and future adaptation UI
scripts/       Standalone tooling and QA scripts
docs/          Design, balance, art, and implementation support docs
```

## Status

The implementation plan scopes a complete Acts 1 and 2 browser game: surface-defense Act 1, mobile squads in Segment 2, and the Underbreach/Act 2 arc through wave 14. Segment 1 (T01–T20) is complete; current follow-on work begins with Segment 2 mobile squads and then Segment 3 Underbreach mechanics.
