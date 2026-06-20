# AGENTS.md — standing instructions for AI agents in this repo

**Formicarium** — a browser tower-defense game (Phaser 3 + TypeScript + Vite + Vitest). Before any task, read **`IMPLEMENTATION_PLAN.md`** (the single source of truth) and find your task's tier in the §10 "Implementer tier" table.

## Per-task tier — CODEX ONLY
*(Applies only to Codex/GPT-5.5, which has a switchable reasoning-effort setting. The ChatGPT connector lane runs at High throughout and ignores this section — skip it.)*

Before writing code, Codex looks up the task's tier in the §10 "Implementer tier" table and outputs one line first:
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

## Test integrity — green is not the goal, *correct* is
Tests assert **intended** behavior, not whatever the code currently does. When a test fails:
- If your test had a genuinely wrong expectation, fix the test.
- **But if the only way to make it pass is to change the expected value to match the code's *observed* behavior — STOP.** That is a code-vs-test judgment call, and silently conforming the test enshrines a bug: a green test that *defends* incorrect behavior, and that will later fail when someone fixes the bug. Flag it instead, e.g.: *"test expected 119 but the code produces 120; the module assigns 119 then `tick()` overwrites it — looks like a dead write. Confirm intent before I change anything."*
- Never weaken/delete a test, loosen an assertion, or edit CI/workflow config just to reach green. A red test catching a real bug is doing its job. **Reaching green by conforming to a bug is a defect, not a fix.**

## Coordination (parallel lanes)
A separate tooling/QA lane commits in parallel — additional unit tests plus isolated files under `scripts/` and `docs/`. Expect commits and files you did NOT create; that's normal, not corruption. Do not modify or depend on `scripts/` or `docs/` — they're not your tasks and never touch `src/`. (Git mechanics below.)

## Git hygiene (shared repo)
Codex and the local orchestrator (Claude) share the **same local working tree**; ChatGPT works remotely on GitHub. That shared tree is the sharp edge — these rules keep lanes from clobbering each other:
- **Branch + PR for everything; never commit to `main` directly.** `main` moves under you (other lanes, merges), so a direct push gets rejected non-fast-forward anyway. Integrate through PRs with CI as the shared gate.
- **`git pull --rebase` before you start and before you push.** Never assume local `main` is current.
- **Don't leave the working tree dirty when you yield it.** Commit to your branch (or `git stash`) before the other local lane runs git operations — uncommitted changes block its rebase/pull.
- **Prefer an isolated worktree for clean git ops over coordinating around a dirty shared tree.** When you need a clean checkout (a self-contained fix, a doc edit, anything that wants its own branch off current `main`) while the other lane holds uncommitted work, don't stash/rebase around them — spin up a sibling worktree and work there: `git worktree add -b <branch> ../formicarium-<slug> origin/main`. The other lane's dirty tree stays untouched, your branch is based on real `origin/main` (not a stale local `main`), and there's no dirty-tree-blocks-rebase dance. Remove it after merge: `git worktree remove ../formicarium-<slug>`. This *structurally eliminates* the shared-tree hazard the rules above only *manage* — prefer it whenever the work is separable.
- **Stage explicit paths — never `git add -A` / `git add .`** when the tree may hold another lane's uncommitted work, or you'll sweep their half-done changes into your commit. Sanity-check with `git show --stat HEAD` after committing.
- **One branch = one unit of work by one lane;** don't co-mingle two lanes on a branch. **Never force-push or rewrite history** on a shared branch or `main`.
- **Need a file another lane is mid-editing?** Don't reach into it — hand off (`HANDOFF.md`, cross-lane-blocker trigger).

## Escalation & handoff
You fix most failures yourself: write → run (CI or local) → read logs → fix → repeat. But at the seams where the orchestrator is irreplaceable, **STOP and hand off via `HANDOFF.md`** instead of thrashing or papering over the problem. Escalate when:
- **Non-obvious failure** — the error doesn't localize the cause; resolving it needs live state inspection / interactive debugging, not another blind guess.
- **N-strikes** — ~3 CI iterations on the *same* failure with no convergence (catches thrashing you won't self-detect).
- **Conform-to-observed trap** — a test failure whose only fix is to change the expectation to match the code's *observed* behavior (see "Test integrity"). That's a code-vs-test judgment call → escalate, don't conform.
- **Cross-lane blocker** — you need a change in a file another lane owns (e.g. a `src/` fix surfaced by a test-only task).

**How:** fill the **Active handoff** block in `HANDOFF.md` per its template — transfer *state* (what you tried and why each attempt failed + your current hypothesis), not just "it's broken" — commit it on your branch, and stop. The orchestrator resolves it, pushes the fix, records the outcome in the escalation log, and clears the block; then you pull and continue. Bias toward self-debug — escalation is the exception, or it floods the metered lane and defeats the point.
