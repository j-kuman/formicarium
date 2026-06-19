import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const tuning = readJson("data/tuning.json");
const enemies = readJsonArray("data/enemies.json", "enemies");
const waves = readJsonArray("data/waves.json", "waves");
const map = readJson("data/maps/act1_map.json");

const nodes = asArray(map.nodes, "map.nodes");
const edges = asArray(map.edges, "map.edges");

const nodeById = new Map(nodes.map((node) => [node.id, node]));
const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]));

const ticksPerSecond = numberOr(tuning.ticksPerSecond, 60);
const enemySpeedScale = numberOr(tuning.enemySpeedScale, 1);

const summaryRows = [];

for (const wave of [...waves].sort((a, b) => numberOr(a.wave, 0) - numberOr(b.wave, 0))) {
  const spawns = asArray(wave.spawns, `wave ${wave.wave}.spawns`);
  const arrivals = [];
  const warnings = [];

  let enemyCount = 0;

  for (const [spawnGroupIndex, spawn] of spawns.entries()) {
    const enemy = enemyById.get(spawn.enemy);
    const count = numberOr(spawn.count, 0);
    const intervalTicks = numberOr(spawn.intervalTicks, 0);

    enemyCount += count;

    if (!enemy) {
      warnings.push(`  ⚠ group ${spawnGroupIndex + 1}: enemy id "${spawn.enemy}" not found`);
      continue;
    }

    const targetPriority = spawn.target
      ? [spawn.target]
      : asArray(enemy.targetPriority, `${enemy.id}.targetPriority`);

    const resolvedTargetId = resolveTarget(targetPriority);

    if (!resolvedTargetId) {
      warnings.push(
        `  ⚠ ${enemy.name ?? enemy.id} x${count} -> ${targetPriority.join(", ") || "(missing target)"}: target alias did not resolve to a visible node`,
      );
      continue;
    }

    if (!nodeById.has(spawn.entrance)) {
      warnings.push(
        `  ⚠ ${enemy.name ?? enemy.id} x${count} -> ${targetPriority[0] ?? "(missing target)"}: entrance node "${spawn.entrance}" not found`,
      );
      continue;
    }

    const pathEdgeIds = findPath(spawn.entrance, resolvedTargetId);

    if (pathEdgeIds.length === 0 && spawn.entrance !== resolvedTargetId) {
      warnings.push(
        `  ⚠ ${enemy.name ?? enemy.id} x${count} -> ${targetPriority[0] ?? "(missing target)"} (${resolvedTargetId}): no path from ${spawn.entrance}`,
      );
      continue;
    }

    const pathLength = pathEdgeIds.reduce((sum, edgeId) => {
      const edge = edgeById.get(edgeId);
      return sum + numberOr(edge?.length, 0);
    }, 0);

    const traversalSec = traversalTimeSeconds(pathLength, enemy);
    const targetNode = nodeById.get(resolvedTargetId);

    for (let index = 0; index < count; index += 1) {
      const spawnTick = index * intervalTicks;
      const spawnSec = spawnTick / ticksPerSecond;
      const arrivalSec = spawnSec + traversalSec;

      arrivals.push({
        arrivalSec,
        spawnSec,
        enemyName: enemy.name ?? enemy.id,
        enemyId: enemy.id,
        spawnIndex: index + 1,
        count,
        targetAlias: targetPriority[0] ?? "(missing target)",
        targetNodeId: resolvedTargetId,
        targetType: targetNode?.type ?? "unknown",
        pathLength,
      });
    }
  }

  arrivals.sort((a, b) => {
    if (a.arrivalSec !== b.arrivalSec) {
      return a.arrivalSec - b.arrivalSec;
    }

    return a.spawnSec - b.spawnSec;
  });

  const queenArrivals = arrivals.filter((arrival) => arrival.targetType === "queen");
  const firstQueenArrivalSec = queenArrivals.length > 0 ? queenArrivals[0].arrivalSec : Number.POSITIVE_INFINITY;
  const waveDurationSec = arrivals.reduce(
    (latest, arrival) => Math.max(latest, arrival.arrivalSec),
    Number.NEGATIVE_INFINITY,
  );

  console.log("");
  console.log(`Wave ${wave.wave} — Act ${wave.act}`);
  console.log("  arrivals:");

  if (arrivals.length === 0) {
    console.log("  none");
  } else {
    for (const arrival of arrivals) {
      console.log(
        `  ${arrival.enemyName} #${arrival.spawnIndex}/${arrival.count} -> ${arrival.targetAlias} (${arrival.targetNodeId})  | spawn ${formatSeconds(arrival.spawnSec)}s  | arrival ${formatSeconds(arrival.arrivalSec)}s  | path ${formatNumber(arrival.pathLength)}px`,
      );
    }
  }

  for (const warning of warnings) {
    console.log(warning);
  }

  console.log(`  first-queen-arrival: ${formatSeconds(firstQueenArrivalSec)}s`);
  console.log(`  wave duration: ${formatSeconds(waveDurationSec)}s`);

  summaryRows.push({
    wave: wave.wave,
    firstQueenArrivalSec: Number.isFinite(firstQueenArrivalSec) ? formatNumber(firstQueenArrivalSec) : "n/a",
    waveDurationSec: Number.isFinite(waveDurationSec) ? formatNumber(waveDurationSec) : "n/a",
    enemyCount,
  });
}

console.log("");
console.log("SUMMARY");
console.table(summaryRows);

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function readJsonArray(relativePath, label) {
  return asArray(readJson(relativePath), label);
}

function asArray(value, label) {
  if (Array.isArray(value)) {
    return value;
  }

  console.warn(`Warning: expected ${label} to be an array; using empty array.`);
  return [];
}

// Mirrors Pathfinder.findPath:
// - returns [] if either node is missing
// - returns [] when start === goal
// - BFS by fewest hops
// - scans edges in insertion order
// - treats edges as undirected
function findPath(startNodeId, goalNodeId) {
  if (!nodeById.has(startNodeId) || !nodeById.has(goalNodeId)) {
    return [];
  }

  if (startNodeId === goalNodeId) {
    return [];
  }

  const visited = new Set([startNodeId]);
  const queue = [{ nodeId: startNodeId, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    for (const edge of edges) {
      if (edge.nodeA !== current.nodeId && edge.nodeB !== current.nodeId) {
        continue;
      }

      const nextNodeId = getOtherNode(edge, current.nodeId);

      if (visited.has(nextNodeId)) {
        continue;
      }

      const nextPath = [...current.path, edge.id];

      if (nextNodeId === goalNodeId) {
        return nextPath;
      }

      visited.add(nextNodeId);
      queue.push({ nodeId: nextNodeId, path: nextPath });
    }
  }

  return [];
}

function getOtherNode(edge, fromNodeId) {
  if (edge.nodeA === fromNodeId) {
    return edge.nodeB;
  }

  if (edge.nodeB === fromNodeId) {
    return edge.nodeA;
  }

  throw new Error(`Node ${fromNodeId} is not connected to edge ${edge.id}`);
}

// Mirrors Pathfinder.resolveTarget / balance.mjs:
// - aliases are node types
// - priority order wins
// - only visible nodes are eligible
// - first matching node in Map/array insertion order wins
function resolveTarget(priority) {
  for (const alias of priority) {
    for (const node of nodes) {
      if (node.visible && node.type === alias) {
        return node.id;
      }
    }
  }

  return null;
}

function traversalTimeSeconds(pathLength, enemy) {
  const speed = numberOr(enemy.speed, 0);

  if (speed <= 0 || enemySpeedScale <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return pathLength / (speed * enemySpeedScale);
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) {
    return "∞";
  }

  return formatNumber(value);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}