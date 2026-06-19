import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const errors = [];
const warnings = [];

const enemies = readJsonArray("data/enemies.json", "enemies");
const waves = readJsonArray("data/waves.json", "waves");
const map = readJson("data/maps/act1_map.json");
const defenses = readJsonArray("data/defenses.json", "defenses");
const adaptations = readJsonArray("data/adaptations.json", "adaptations");

const nodes = asArray(map.nodes, "map.nodes");
const edges = asArray(map.edges, "map.edges");

const nodeIds = uniqueIds(nodes, "node", "map.nodes");
const edgeIds = uniqueIds(edges, "edge", "map.edges");
const enemyIds = uniqueIds(enemies, "enemy", "enemies");
const adaptationIds = uniqueIds(adaptations, "adaptation", "adaptations");

const nodeById = new Map(nodes.filter((node) => typeof node.id === "string").map((node) => [node.id, node]));
const usedEnemyIds = new Set();

validateEdges();
validateWaves();
validateDefenseAdaptations();
warnOrphanNodes();
warnUnusedEnemies();

printResults();

if (errors.length > 0) {
  process.exit(1);
}

function validateEdges() {
  for (const edge of edges) {
    if (!edge?.id) {
      continue;
    }

    if (!nodeIds.has(edge.nodeA)) {
      errors.push(`edge "${edge.id}" nodeA references missing node "${edge.nodeA}"`);
    }

    if (!nodeIds.has(edge.nodeB)) {
      errors.push(`edge "${edge.id}" nodeB references missing node "${edge.nodeB}"`);
    }
  }
}

function validateWaves() {
  for (const wave of waves) {
    const spawns = asArray(wave.spawns, `wave ${wave.wave}.spawns`);

    for (const [spawnIndex, spawn] of spawns.entries()) {
      const label = `wave ${wave.wave} spawn ${spawnIndex + 1}`;

      if (!enemyIds.has(spawn.enemy)) {
        errors.push(`${label} references missing enemy "${spawn.enemy}"`);
      } else {
        usedEnemyIds.add(spawn.enemy);
      }

      const entrance = nodeById.get(spawn.entrance);
      if (!entrance) {
        errors.push(`${label} references missing entrance node "${spawn.entrance}"`);
      } else if (entrance.type !== "entrance" && entrance.type !== "deep_entrance") {
        errors.push(
          `${label} entrance "${spawn.entrance}" has type "${entrance.type}", expected "entrance" or "deep_entrance"`,
        );
      }

      if (!spawn.target) {
        errors.push(`${label} is missing target alias`);
        continue;
      }

      const resolvedTarget = resolveTarget(spawn.target);
      if (!resolvedTarget) {
        errors.push(`${label} target alias "${spawn.target}" does not match any node type`);
        continue;
      }

      if (!entrance) {
        continue;
      }

      const pathEdgeIds = findPath(spawn.entrance, resolvedTarget.id);
      if (pathEdgeIds.length === 0 && spawn.entrance !== resolvedTarget.id) {
        errors.push(
          `${label} has no path from entrance "${spawn.entrance}" to target "${spawn.target}" (${resolvedTarget.id})`,
        );
      }
    }
  }
}

function validateDefenseAdaptations() {
  for (const defense of defenses) {
    if (!defense?.requiresAdaptation) {
      continue;
    }

    if (!adaptationIds.has(defense.requiresAdaptation)) {
      errors.push(
        `defense "${defense.id}" requires missing adaptation "${defense.requiresAdaptation}"`,
      );
    }
  }
}

function warnOrphanNodes() {
  const degreeByNodeId = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (degreeByNodeId.has(edge.nodeA)) {
      degreeByNodeId.set(edge.nodeA, degreeByNodeId.get(edge.nodeA) + 1);
    }

    if (degreeByNodeId.has(edge.nodeB)) {
      degreeByNodeId.set(edge.nodeB, degreeByNodeId.get(edge.nodeB) + 1);
    }
  }

  for (const [nodeId, degree] of degreeByNodeId) {
    if (degree === 0) {
      warnings.push(`node "${nodeId}" is orphaned with no connected edge`);
    }
  }
}

function warnUnusedEnemies() {
  for (const enemy of enemies) {
    if (enemy?.id && !usedEnemyIds.has(enemy.id)) {
      warnings.push(`enemy "${enemy.id}" is never used by any wave`);
    }
  }
}

// Data validator target resolution intentionally uses the full map, not visibility,
// so hidden deep-map targets can still be integrity-checked before breach reveal.
function resolveTarget(alias) {
  return nodes.find((node) => node.type === alias) ?? null;
}

// Mirrors Pathfinder.findPath:
// - returns [] if either node is missing
// - returns [] when start === goal
// - BFS by fewest hops
// - scans edges in insertion order
// - treats edges as undirected
// - ignores visibility for full-graph data pathability
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

function uniqueIds(items, singularLabel, collectionLabel) {
  const ids = new Set();
  const seen = new Set();

  for (const [index, item] of items.entries()) {
    if (!item || typeof item.id !== "string" || item.id.length === 0) {
      errors.push(`${collectionLabel}[${index}] is missing a string id`);
      continue;
    }

    if (seen.has(item.id)) {
      errors.push(`duplicate ${singularLabel} id "${item.id}"`);
      continue;
    }

    seen.add(item.id);
    ids.add(item.id);
  }

  return ids;
}

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

  errors.push(`expected ${label} to be an array`);
  return [];
}

function printResults() {
  console.log("ERRORS");
  if (errors.length === 0) {
    console.log("  none");
  } else {
    for (const error of errors) {
      console.log(`  ERROR: ${error}`);
    }
  }

  console.log("");
  console.log("WARNINGS");
  if (warnings.length === 0) {
    console.log("  none");
  } else {
    for (const warning of warnings) {
      console.log(`  WARNING: ${warning}`);
    }
  }

  console.log("");
  console.log(`${errors.length} errors, ${warnings.length} warnings`);
}