# Formicarium Implementation Plan v2
## ChatGPT 5.5 High + Jeff+Claude Dev Method

_Last updated: 2026-06-22 (P2 merged)_

> **v2 purpose:** Routes remaining work between ChatGPT 5.5 High (GitHub connector, raises PRs) and the Jeff+Claude lane (balance passes, testing, review). Architecture, schemas, and task specs are unchanged from v1 — this document is a scheduling layer over IMPLEMENTATION_PLAN.md, not a replacement. When Codex comes back online (~2026-06-25), reconcile with §6 below.

---

## 1. Current State (as of 2026-06-21)

**Merged to main:**
- T01–T21 complete: Segments 1 + 2 fully implemented
- Act-1 surface art wired (all SVG texture keys, raster backdrop)
- UX polish (PR #15): build-phase pacing, placement prompt, cancel (right-click/Esc)
- Barricade visual: red edge tint when resin_barricade active (`src/render/MapRenderer.ts`)
- Playwright diagnostic: `scripts/diag-watch.mjs` — autonomous sim state watcher

**Signed off / merged:**
- T22 balance pass — complete 2026-06-21. Beetle armor 10→5, HP 60→80, soldier cost 65→40 food. Barricade slow confirmed via Playwright. P1 unlocked.
- P1 breach resume — merged 2026-06-21 (PR #16, db3bd79). Waves 10–14 verbatim from spec, crack sprite, PhaseController test. P2 unlocked.
- P2 deep enemy mechanics — merged 2026-06-22 (PR #17, 2b6a6f1). Contamination, squad disruption, boss panic, spore scrubber, act-2 texture routing. P3 unlocked.

**Parked branch (Codex worktree, do not touch):**
- `codex/park-t23-breach-resume-wip` — early T23 work, unreviewed

---

## 2. Lane Definitions

### ChatGPT lane (primary implementer until Codex returns)
- **Tooling:** ChatGPT 5.5 High via GitHub connector (reads repo directly, no paste slots)
- **Can:** write TypeScript, edit JSON, add tests, run typecheck via CI
- **Cannot:** run the game, observe visual output, verify balance feel
- **Output:** one PR per packet; CI (typecheck + vitest) must be green before review
- **Packet format:** see §3

### Jeff+Claude lane (testing, review, balance)
- **Balance passes (T22, T26):** Jeff plays, Claude watches via `scripts/diag-watch.mjs`, both tune JSON
- **PR review:** Claude reads the diff, flags invariant violations (see §4); Jeff merges or requests changes
- **Integration verification:** after merge, Jeff runs the game; Claude monitors Playwright output

---

## 3. Remaining Work — Packet Queue

Dependency order: **T22 → P1 → P2 → P3 → T26 → P4**

Never start a packet before its prerequisite is merged. P1–P4 are the ChatGPT lane; T22/T26 are Jeff+Claude.

---

### T22 — Segment 2 Balance Pass _(Jeff+Claude lane)_

**Gate to unlock P1.** No code changes — JSON tuning only.

**Jeff plays, Claude monitors:**
```
cd formicarium
npm run dev          # terminal 1
node scripts/diag-watch.mjs --duration 120   # terminal 2
```

**Tune only these files:** `data/tuning.json`, `data/units.json`, `data/waves.json`

**Pass criteria (from v1 §T22):**
- Squads add options, don't trivialize static defenses
- Hard placement decision present every wave
- Player shouldn't be able to squad-rush and ignore all defenses

**Output:** commit tuning changes to main, note what was changed + why in commit message. T22 is complete when Jeff signs off after ≥2 playthroughs.

---

### P1 — Resume from Breach Cliffhanger _(ChatGPT packet)_

**Prerequisite:** T22 merged.
**v1 reference:** §T23

**Repo + branch:** `j-kuman/formicarium`, branch `main`

**Read first:**
- `IMPLEMENTATION_PLAN.md` §T23 (full spec)
- `src/sim/PhaseController.ts` (how `'ended'` phase is triggered when no next wave exists)
- `src/scenes/UIScene.ts` (cliffhanger screen, to be removed)
- `data/waves.json` (currently has waves 1–9 only)

**Implement:**
1. Extend `data/waves.json` with waves 10–14 exactly as specified in `IMPLEMENTATION_PLAN.md` §6 (`data/waves.json` schema). **Derive from the spec verbatim — do not invent wave compositions.**
2. Verify `PhaseController` now transitions recovery (wave 9) → scout (wave 10) instead of `'ended'`. If PhaseController already handles this correctly (it checks `waves.find(w => w.wave === state.wave + 1)`), no code change needed — confirm with a unit test.
3. Remove the Segment 1 cliffhanger overlay screen from `UIScene.ts`. The `'ended'` phase no longer fires after wave 9. Keep the `victory` and `game_over` phase handling intact.
4. Add a crack sprite in `MapRenderer.ts` beneath `queen_chamber` when `state.foreshadowEvents` contains a wave-9 `'crack'` foreshadow. Use a Graphics object (dark thin line, no external asset). Persists until breach fires.
5. Verify `WaveAlert` shows wave 10 composition during wave 10 scout phase — check existing `WaveAlert.ts` logic; this should work automatically once wave 10 data exists.

**Do not implement:** deep enemy behaviors (P2), contamination, adaptations.

**Files to modify/create:**
- `data/waves.json` (extend with waves 10–14)
- `src/scenes/UIScene.ts` (remove cliffhanger screen)
- `src/render/MapRenderer.ts` (crack sprite for wave 9 foreshadow)
- `src/sim/__tests__/PhaseController.test.ts` (add: wave-9 recovery → wave-10 scout; no `'ended'` when wave 10 exists)

**Verification (CI):** `npm run typecheck` zero errors; `npm test` all passing including new PhaseController test.

**Branch:** `chatgpt/p1-breach-resume`; raise PR titled "P1: Resume from breach cliffhanger (waves 10–14)"; CI green.

**Jeff+Claude review focus:** does PhaseController test cover the correct branch? Does wave data match v1 spec exactly?

---

### P2 — Deep Enemy Mechanics + Act 2 Waves _(ChatGPT packet)_

**Prerequisite:** P1 merged.
**v1 reference:** §T24

**Repo + branch:** `j-kuman/formicarium`, branch `main`

**Read first:**
- `IMPLEMENTATION_PLAN.md` §T24 (full spec, tag behaviors, damage model)
- `src/sim/CombatResolver.ts` (extend this — do not rewrite)
- `src/sim/__tests__/CombatResolver.test.ts` (extend, do not overwrite existing tests)
- `src/render/EnemyRenderer.ts` (add act-2 texture routing)
- `src/types/game.ts` (NodeState.contaminationLevel already exists — use it, don't re-add)

**Implement:**
1. **Tag: `contaminates` + `onDeath: 'contaminate_node'`** — in `CombatResolver` kill path: when enemy's `onDeath === 'contaminate_node'`, set its current node's `contaminationLevel = 1.0` and `contaminated = true`; emit `NODE_CONTAMINATED { nodeId }`.
2. **Tag: `disrupts_squads` + `onReach: 'panic_nearby_squads'`** — in `CombatResolver` goal-reach path: call existing `panicNearbySquads` (already implemented in SquadController path) for squads within 1 hop.
3. **Tag: `causes_panic` (boss)** — same as above but 2-hop radius.
4. **Spore scrubber cleanup** — in `CombatResolver.resolveDefenses`: when `defense.typeId === 'spore_scrubber'`, reduce `node.contaminationLevel` by `effects.cleanRatePerTick * (deltaMs / 1000)` each tick; clamp at 0; set `node.contaminated = false` when 0.
5. **EnemyRenderer** — enemies with `act: 2` use `enemy_deep` texture key; boss (`bossWave: 14`) uses `enemy_boss` texture key.

**Do not implement:** AdaptationManager, AdaptationPanel, sample tracking (P3).

**Files to modify:**
- `src/sim/CombatResolver.ts`
- `src/render/EnemyRenderer.ts`
- `src/sim/__tests__/CombatResolver.test.ts` (add 3 tests from v1 §T24)

**Verification (CI):** `npm run typecheck` zero errors; `npm test` all passing including new contamination + scrubber tests. **Invariant check:** `src/sim/` files must have zero Phaser imports after this change.

**Branch:** `chatgpt/p2-deep-enemy-mechanics`; PR titled "P2: Deep enemy mechanics (contamination, squad disruption, boss panic)"; CI green.

**Jeff+Claude review focus:** spore scrubber cleanup formula correct? `onDeath`/`onReach` wired in the right place in the kill/goal-reach paths? No regression to existing CombatResolver tests?

---

### P3 — Study Chamber + Adaptations _(ChatGPT packet)_

**Prerequisite:** P2 merged.
**v1 reference:** §T25

**Repo + branch:** `j-kuman/formicarium`, branch `main`

**Read first:**
- `IMPLEMENTATION_PLAN.md` §T25 (AdaptationManager spec), §6 `data/adaptations.json`
- `src/sim/GameSim.ts` (how to wire a new subsystem into tick())
- `src/ui/BuildPanel.ts` (how defenses are filtered by `requiresAdaptation`)
- `src/ui/SelectionPanel.ts` (where to add AdaptationPanel trigger)
- `data/adaptations.json` (already exists — verify it matches v1 §6 schema verbatim)

**Implement:**
1. `src/sim/AdaptationManager.ts` — new file. Tracks `state.samples` (already in GameState as `Map<string, number>`). On `ENEMY_DIED` event: if enemy has `sampleDrop`, increment sample count. Each tick: for each adaptation in `data/adaptations.json`, if all `requires` samples are met and not yet in `state.unlockedAdaptations`, auto-unlock and emit `ADAPTATION_UNLOCKED`.
2. Wire `AdaptationManager` into `GameSim.tick()`: call `onEnemyDied` when processing `ENEMY_DIED` events; call `tick()` in the fixed-step loop.
3. `src/ui/AdaptationPanel.ts` — new file. Shown when study_chamber is selected. Lists each adaptation with sample progress bars. On `ADAPTATION_UNLOCKED`: panel updates to show "unlocked" state.
4. `src/ui/SelectionPanel.ts` — when selected node type is `study`, show AdaptationPanel instead of the standard defense list.
5. `src/ui/BuildPanel.ts` — verify that defenses with `requiresAdaptation` are already filtered out if the adaptation isn't in `state.unlockedAdaptations`. If not, add the filter.

**Files to create/modify:**
- `src/sim/AdaptationManager.ts` (new)
- `src/sim/GameSim.ts` (wire AdaptationManager)
- `src/ui/AdaptationPanel.ts` (new)
- `src/ui/SelectionPanel.ts` (update)
- `src/ui/BuildPanel.ts` (verify/update filter)

**Verification (CI):** `npm run typecheck` zero errors; `npm test` all passing. Add a unit test for AdaptationManager: killing N enemies with sampleDrop increments sample count; when requirement met, `ADAPTATION_UNLOCKED` fires; spore_scrubber appears as placeable after unlock.

**Branch:** `chatgpt/p3-adaptations`; PR titled "P3: Study chamber + adaptation unlock system"; CI green.

**Jeff+Claude review focus:** are samples accumulated via the event queue (not a direct call from sim)? Does BuildPanel filter correctly for locked adaptations? Is AdaptationPanel wired to the correct selection type?

---

### T26 — Act 2 Balance Pass _(Jeff+Claude lane)_

**Prerequisite:** P3 merged.

Same protocol as T22 — Jeff plays waves 10–14, Claude monitors:
```
node scripts/diag-watch.mjs --duration 180
```

**Pass criteria (from v1 §T26):**
- Waves 10–13 survivable with zero adaptations but punishing
- Wave 14 boss: survivable with ≥2 adaptations + squad at queen; very difficult with zero adaptations
- Two-front defense creates tension without feeling impossible

**Tune only:** `data/waves.json` (counts, intervalTicks), `data/enemies.json` (hp, speed)

---

### P4 — Resolution Screen + Domain Expansion _(ChatGPT packet)_

**Prerequisite:** T26 signed off.
**v1 reference:** §T27

**Repo + branch:** `j-kuman/formicarium`, branch `main`

**Read first:**
- `IMPLEMENTATION_PLAN.md` §T27 (full spec — victory sequence, domain expansion, game-over screen, wave-10 snapshot)
- `src/scenes/UIScene.ts` (add victory + game-over screens)
- `src/render/MapRenderer.ts` (deep node amber tint when `state.claimedDeepNodes`)
- `src/render/EnemyRenderer.ts` (enemy retreat animation on VICTORY)
- `src/sim/GameSim.ts` (add wave-10 state snapshot for "Try Act 2 Again")

**Implement per v1 §T27 spec — derive all text copy from the spec verbatim.**

**Branch:** `chatgpt/p4-resolution-screen`; PR titled "P4: Victory sequence + resolution screen + domain expansion"; CI green.

**Jeff+Claude review focus:** wave-10 snapshot saved before wave-10 tick runs (not after); "Try Act 2 Again" resets correctly; deep amber tint on `claimedDeepNodes` correct node check.

---

## 4. PR Review Protocol (Jeff+Claude lane)

For every ChatGPT PR, before merge:

1. **CI must be green** (typecheck + vitest). Do not merge a red PR.
2. **Claude reads the diff** and checks:
   - No Phaser imports in `src/sim/` (sim purity — load-bearing)
   - No hardcoded stats, costs, or balance values in TypeScript (must be in JSON)
   - No variable `realDeltaMs` passed into game logic (fixed-step only)
   - New events emitted correctly (not calling consumers directly)
   - `waveEnemiesRemaining` decrements on both kill AND goal-reach paths (if touched)
3. **Jeff verifies the PR description** describes the change correctly (ChatGPT sometimes writes PRs that describe intent, not actual behavior)
4. **After merge:** Jeff runs the game to the relevant section; Claude monitors via Playwright if any behavioral regression is suspected

---

## 5. Packet Generation Protocol

When ready to dispatch a packet to ChatGPT:
1. Copy the packet spec from §3 verbatim (it's written as a self-contained prompt)
2. Prepend: "You are implementing a feature for the Formicarium Defense game. Read the files listed below, then implement exactly what's specified. Do not add features beyond the scope. Raise a PR when CI is green."
3. ChatGPT reads the repo, implements, raises PR
4. Jeff+Claude reviews per §4

---

## 6. Reconciliation with v1 / Codex Return (2026-06-25)

When Codex comes back online:
- **P1–P4 merged:** Codex lane is free; any remaining work after T27 (future acts, polish) goes to Codex as new tasks in v1 format
- **P1–P4 in flight:** Check PRs against the parked branch `codex/park-t23-breach-resume-wip`. If there's overlap with P1, close the Codex branch and take the ChatGPT PR. Codex resumes on P2+ content not yet merged.
- **Invariants to re-verify on first Codex session post-merge:** sim purity (zero Phaser imports in src/sim/), fixed-timestep check (`npm test` all green), no new hardcoded stats

---

## 7. What Is NOT in Scope (inherited from v1 §1)

- Act 3 (basement) — text teaser only, in P4 resolution screen copy
- Procedural generation, save/load, multiplayer, mobile
- Individual ant pathfinding (squads are badges)
- Pheromone resource (scaffolded in types, not wired)
