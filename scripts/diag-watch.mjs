// scripts/diag-watch.mjs
// Autonomous sim state watcher. Opens a headless Chromium, loads the game, polls window.__sim.
//
// Usage: node scripts/diag-watch.mjs [options]
//   --port N       dev server port (default 5173)
//   --duration N   seconds to run (default 120)
//   --visible      show the browser window (use if headless throttles Phaser)
//
// Output: live state snapshots to stdout.
//   ✓SLOWED  = barricade slow is working
//   ✗BUG     = enemy is on a barricaded edge but slowFactor is 1 (broken)
//
// One-time setup: npx playwright install chromium

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = opt('--port', '5173');
const DURATION_S = Number(opt('--duration', '120'));
const HEADLESS = !flag('--visible');
const POLL_MS = 800;

console.log(`diag-watch | port=${PORT} duration=${DURATION_S}s headless=${HEADLESS}`);

const browser = await chromium.launch({
  headless: HEADLESS,
  args: HEADLESS ? [] : ['--window-size=900,700'],
});
const page = await browser.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.text().includes('[sim]') || msg.text().includes('slow')) {
    process.stdout.write(`  GAME ${msg.type().toUpperCase()}: ${msg.text()}\n`);
  }
});
page.on('pageerror', (err) => {
  process.stderr.write(`  PAGE ERROR: ${err.message}\n`);
});

process.stdout.write(`Connecting to http://localhost:${PORT}...\n`);
try {
  await page.goto(`http://localhost:${PORT}`, { timeout: 10_000 });
} catch {
  process.stderr.write(`✗ Could not reach localhost:${PORT}. Start the dev server first (npm run dev).\n`);
  await browser.close();
  process.exit(1);
}

process.stdout.write('Waiting for game to load (window.__sim)...\n');
try {
  await page.waitForFunction(() => window.__sim !== null && window.__sim !== undefined, {
    timeout: 20_000,
    polling: 500,
  });
} catch {
  process.stderr.write('✗ Timeout waiting for window.__sim. Game may have crashed during load.\n');
  await browser.close();
  process.exit(1);
}

process.stdout.write('✓ Game ready. Watching...\n\n');

const deadline = Date.now() + DURATION_S * 1_000;
let prevPhase = null;
let prevWave = -1;
let snapCount = 0;

while (Date.now() < deadline) {
  const snap = await page.evaluate(() => {
    const sim = window.__sim;
    if (!sim) return null;
    const s = sim.getState();
    return {
      tick: s.tick,
      phase: s.phase,
      wave: s.wave,
      queenHp: s.queenHp,
      resources: { food: s.resources.food, soil: s.resources.soil, resin: s.resources.resin },
      defenses: s.defenses.map((d) => ({
        typeId: d.typeId,
        nodeId: d.nodeId ?? null,
        edgeId: d.edgeId ?? null,
      })),
      enemies: s.enemies.map((e) => ({
        id: e.id,
        typeId: e.typeId,
        edgeId: e.edgeId,
        progress: Math.round(e.progress * 1000) / 1000,
        slowFactor: e.slowFactor,
        hp: Math.round(e.hp * 10) / 10,
      })),
    };
  });

  if (!snap) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    continue;
  }

  snapCount++;
  const phaseChanged = snap.phase !== prevPhase;
  const waveChanged = snap.wave !== prevWave;

  if (phaseChanged || waveChanged) {
    const ts = new Date().toTimeString().slice(0, 8);
    process.stdout.write(`\n[${ts}] ▶ ${snap.phase.toUpperCase()} | Wave ${snap.wave}/14 | Queen ${snap.queenHp}\n`);
    prevPhase = snap.phase;
    prevWave = snap.wave;
  }

  const barricadeEdges = new Set(
    snap.defenses.filter((d) => d.typeId === 'resin_barricade').map((d) => d.edgeId),
  );

  if (snap.phase === 'wave' && snap.enemies.length > 0) {
    const ts = new Date().toTimeString().slice(0, 8);
    process.stdout.write(`[${ts}] tick=${snap.tick} enemies=${snap.enemies.length}\n`);
    for (const e of snap.enemies) {
      const onBarricade = barricadeEdges.has(e.edgeId);
      const slowed = e.slowFactor < 1;
      const tag = onBarricade && slowed
        ? ` ✓SLOWED(${e.slowFactor})`
        : onBarricade && !slowed
          ? ` ✗BUG:on-barricade-not-slowed`
          : '';
      process.stdout.write(`  ${e.id}(${e.typeId}) edge=${e.edgeId} prog=${e.progress} hp=${e.hp}${tag}\n`);
    }
  } else if (snap.phase === 'build' && snapCount % 6 === 0) {
    const ts = new Date().toTimeString().slice(0, 8);
    const dStr = snap.defenses.map((d) => `${d.typeId}@${d.edgeId ?? d.nodeId}`).join(', ') || 'none';
    process.stdout.write(`[${ts}] BUILD tick=${snap.tick} food=${snap.resources.food} resin=${snap.resources.resin} defenses=[${dStr}]\n`);
  }

  await new Promise((r) => setTimeout(r, POLL_MS));
}

await browser.close();
process.stdout.write('\ndiag-watch done.\n');
