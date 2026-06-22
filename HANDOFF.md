# HANDOFF.md — escalation state transfer between lanes

When a build lane (Codex or the ChatGPT connector) hits an escalation trigger
(see `AGENTS.md` → "Escalation & handoff"), it **stops and writes the Active
handoff below** instead of thrashing or conforming a test to a bug. The
orchestrator (Claude/Opus) picks it up, resolves it locally, records the outcome
in the escalation log, and clears the Active block. Then the implementer pulls and
continues. 

The point is to transfer **debugging state**, not a status report: what you tried,
why each attempt failed, and your current hypothesis — so the orchestrator starts
from the dead-ends, not from zero.

---

## Active handoff

_None — no open handoff._

<!-- TEMPLATE — copy this block, fill it in, and replace the "None" line above.

### [Txx] <one-line title> — <lane> → orchestrator
- **Trigger:** <which condition fired — non-obvious failure / N-strikes (#n) / conform-to-observed trap / cross-lane blocker / needs local+interactive debugging>
- **Where it stands:** branch `<name>`, PR #<n>, head commit `<sha>`
- **Goal:** <what the task was trying to achieve>
- **Symptom:** <the failure — exact assertion text / exception / link to the failing CI run>
- **Tried (and why each failed):**
  1. <attempt> → <result / why it didn't work>
  2. <attempt> → <result>
- **Current hypothesis:** <best guess at root cause, or "none — needs live state inspection">
- **Ask:** <the specific thing you need the orchestrator to do>

-->

---

## Escalation log (calibration data — append one row per resolved handoff)

This log is the **eval of the trigger itself**. Read the distribution: many
`premature` rows ⇒ the trigger is too loose (kicking work up that the lane could
have finished); many `thrash` rows (escalated only at the N-strikes backstop) ⇒
too tight (the lane spins before handing off). Tune toward mostly `real-bug`.

| Date | Lane | Task | Trigger | CI iters before escalating | Resolution | Verdict (real-bug / premature / thrash) |
|------|------|------|---------|----------------------------|------------|------------------------------------------|
| _none yet_ | | | | | | |
