import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const mapsDir = path.join(dataDir, "maps");

const RESOURCE_KEYS = new Set(["food", "soil", "resin"]);
const STRUCTURAL_NODE_TYPES = new Set(["entrance", "deep_entrance", "junction", "deep_junction"]);

const errorsByGroup = new Map();
const warningsByGroup = new Map();

const dataFiles = readTopLevelDataFiles();
const enemies = readJsonArrayFromData("enemies.json", "enemies");
const waves = readJsonArrayFromData("waves.json", "waves");
const units = readJsonArrayFromData("units.json", "units");
const defenses = readJsonArrayFromData("defenses.json", "defenses");
const chambers = readJsonArrayFromData("chambers.json", "chambers");
const adaptations = readJsonArrayFromData("adaptations.json", "adaptations");
const tuning = readJsonObjectFromData("tuning.json", "tuning");
const maps = readMapFiles();

const enemyIds = uniqueIds(enemies, "enemy", "enemies.json", "Duplicates");
const unitIds = uniqueIds(units, "unit", "units.json", "Duplicates");
const defenseIds = uniqueIds(defenses, "defense", "defenses.json", "Duplicates");
const chamberIds = uniqueIds(chambers, "chamber", "chambers.json", "Duplicates");
const adaptationIds = uniqueIds(adaptations, "adaptation", "adaptations.json", "Duplicates");
const waveNumbers = uniqueNumbers(waves, "wave", "waves.json", "Duplicates");

const sampleIds = new Set(
  enemies
    .map((enemy) => enemy?.sampleDrop)
    .filter((sampleDrop) => typeof sampleDrop === "string" && sampleDrop.length > 0),
);
const adaptationRequirementIds = new Set([...enemyIds, ...sampleIds]);
const allNodeRefs = collectAllNodeRefs(maps);

validateMaps();
validateWaves();
validateEnemies();
validateDefenses();
validateUnits();
validateChambers();
validateAdaptations();
validateTuning();
warnUnusedEnemies();

printResults();

if (countGroupedItems(errorsByGroup) > 0) {
  process.exit(1);
}

function readTopLevelDataFiles() {
  if (!fs.existsSync(dataDir)) {
    addError("Files", "missing data/ directory");
    return new Map();
  }

  const files = new Map();
  for (const filename of fs.readdirSync(dataDir).sort()) {
    if (!filename.endsWith(".json")) {
      continue;
    }

    files.set(filename, readJson(path.join("data", filename)));
  }

  return files;
}

function readMapFiles() {
  if (!fs.existsSync(mapsDir)) {
    addError("Files", "missing data/maps/ directory");
    return [];
  }

  const mapFiles = [];
  for (const filename of fs.readdirSync(mapsDir).sort()) {
    if (!filename.endsWith(".json")) {
      continue;
    }

    const relativePath = path.join("data", "maps", filename);
    const data = readJson(relativePath);
    const nodes = asArray(data?.nodes, `${relativePath}.nodes`, "Maps");
    const edges = asArray(data?.edges, `${relativePath}.edges`, "Maps");
    const nodeIds = uniqueIds(nodes, "node", `${relativePath}.nodes`, "Duplicates");
    const edgeIds = uniqueIds(edges, "edge", `${relativePath}.edges`, "Duplicates");
    const nodeTypes = new Set(
      nodes
        .map((node) => node?.type)
        .filter((type) => typeof type === "string" && type.length > 0),
    );
    const nodeById = new Map(
      nodes
        .filter((node) => typeof node?.id === "string" && node.id.length > 0)
        .map((node) => [node.id, node]),
    );

    mapFiles.push({ relativePath, data, nodes, edges, nodeIds, edgeIds, nodeTypes, nodeById });
  }

  if (mapFiles.length === 0) {
    addError("Files", "data/maps/ contains no .json map files");
  }

  return mapFiles;
}

function readJsonArrayFromData(filename, label) {
  return asArray(dataFiles.get(filename), label, "Files");
}

function readJsonObjectFromData(filename, label) {
  const value = dataFiles.get(filename);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  addError("Files", `expected ${label} (${filename}) to be a JSON object`);
  return {};
}

function validateMaps() {
  for (const map of maps) {
    for (const edge of map.edges) {
      const label = `${map.relativePath} edge ${formatId(edge?.id)}`;

      if (!edge?.id) {
        continue;
      }

      if (!map.nodeIds.has(edge.nodeA)) {
        addError("Maps", `${label} nodeA references missing node ${formatId(edge.nodeA)}`);
      }

      if (!map.nodeIds.has(edge.nodeB)) {
        addError("Maps", `${label} nodeB references missing node ${formatId(edge.nodeB)}`);
      }
    }

    for (const node of map.nodes) {
      if (!node?.id || !node?.type || STRUCTURAL_NODE_TYPES.has(node.type)) {
        continue;
      }

      if (!chamberIds.has(node.type)) {
        addError(
          "Maps",
          `${map.relativePath} node ${formatId(node.id)} has chamber-like type ${formatId(node.type)} with no matching chamber id`,
        );
      }
    }
  }
}

function validateWaves() {
  const usedEnemyIds = new Set();

  for (const wave of waves) {
    const waveLabel = `wave ${formatId(wave?.wave)}`;
    const spawns = asArray(wave?.spawns, `${waveLabel}.spawns`, "Waves");

    for (const [spawnIndex, spawn] of spawns.entries()) {
      const label = `${waveLabel} spawn ${spawnIndex + 1}`;
      const enemyRef = spawn?.enemy ?? spawn?.typeId;

      if (typeof enemyRef !== "string" || enemyRef.length === 0) {
        addError("Waves", `${label} is missing enemy/typeId`);
      } else if (!enemyIds.has(enemyRef)) {
        addError("Waves", `${label} references missing enemy ${formatId(enemyRef)}`);
      } else {
        usedEnemyIds.add(enemyRef);
      }

      if (typeof spawn?.entrance !== "string" || spawn.entrance.length === 0) {
        addError("Waves", `${label} is missing entrance node id`);
        continue;
      }

      const mapsWithEntrance = maps.filter((map) => map.nodeIds.has(spawn.entrance));
      if (mapsWithEntrance.length === 0) {
        addError("Waves", `${label} entrance references missing node ${formatId(spawn.entrance)}`);
        continue;
      }

      for (const map of mapsWithEntrance) {
        const entrance = map.nodeById.get(spawn.entrance);
        if (entrance?.type !== "entrance" && entrance?.type !== "deep_entrance") {
          addError(
            "Waves",
            `${label} entrance ${formatId(spawn.entrance)} in ${map.relativePath} has type ${formatId(entrance?.type)}, expected entrance/deep_entrance`,
          );
        }
      }

      if (typeof spawn?.target !== "string" || spawn.target.length === 0) {
        addError("Waves", `${label} is missing target node id/type`);
        continue;
      }

      const targetMatches = mapsWithEntrance
        .map((map) => ({ map, target: resolveNodeRefInMap(spawn.target, map) }))
        .filter((match) => match.target);

      if (targetMatches.length === 0) {
        addError(
          "Waves",
          `${label} target ${formatId(spawn.target)} does not resolve to a node id/type in any map containing entrance ${formatId(spawn.entrance)}`,
        );
        continue;
      }

      const hasPath = targetMatches.some((match) => {
        const pathEdgeIds = findPath(spawn.entrance, match.target.id, match.map);
        return pathEdgeIds.length > 0 || spawn.entrance === match.target.id;
      });

      if (!hasPath) {
        addError(
          "Waves",
          `${label} has no map path from entrance ${formatId(spawn.entrance)} to target ${formatId(spawn.target)}`,
        );
      }
    }
  }

  for (const enemy of enemies) {
    if (enemy?.id && !usedEnemyIds.has(enemy.id)) {
      addWarning("Waves", `enemy ${formatId(enemy.id)} is not referenced by any wave spawn`);
    }
  }
}

function validateEnemies() {
  for (const enemy of enemies) {
    const label = `enemy ${formatId(enemy?.id)}`;

    validateResourceMap(enemy?.reward, `${label}.reward`, "Enemies");

    const targetPriority = asArray(enemy?.targetPriority, `${label}.targetPriority`, "Enemies");
    for (const target of targetPriority) {
      if (!allNodeRefs.has(target)) {
        addError("Enemies", `${label} targetPriority references missing node id/type ${formatId(target)}`);
      }
    }
  }
}

function validateDefenses() {
  for (const defense of defenses) {
    const label = `defense ${formatId(defense?.id)}`;

    validateResourceMap(defense?.cost, `${label}.cost`, "Defenses");
    validateResourceMap(defense?.upgrade?.cost, `${label}.upgrade.cost`, "Defenses", { optional: true });

    if (defense?.requiresAdaptation && !adaptationIds.has(defense.requiresAdaptation)) {
      addError(
        "Defenses",
        `${label} requires missing adaptation ${formatId(defense.requiresAdaptation)}`,
      );
    }
  }
}

function validateUnits() {
  for (const unit of units) {
    const label = `unit ${formatId(unit?.id)}`;

    validateResourceMap(unit?.costPerUnit, `${label}.costPerUnit`, "Units");

    if (unit?.requiresBarracks && !chamberIds.has("barracks")) {
      addError("Units", `${label} requires barracks, but chambers.json has no barracks chamber`);
    }
  }
}

function validateChambers() {
  for (const chamber of chambers) {
    const label = `chamber ${formatId(chamber?.id)}`;

    validateResourceMap(chamber?.upgrade?.cost, `${label}.upgrade.cost`, "Chambers", { optional: true });
  }
}

function validateAdaptations() {
  for (const adaptation of adaptations) {
    const label = `adaptation ${formatId(adaptation?.id)}`;
    const requires = adaptation?.requires;

    if (!requires || typeof requires !== "object" || Array.isArray(requires)) {
      addError("Adaptations", `${label}.requires must be an object`);
    } else {
      for (const requirementId of Object.keys(requires)) {
        if (!adaptationRequirementIds.has(requirementId)) {
          addError(
            "Adaptations",
            `${label}.requires references missing enemy/sample ${formatId(requirementId)}`,
          );
        }
      }
    }

    validateUnlockRef(adaptation?.unlocks, `${label}.unlocks`);
  }
}

function validateUnlockRef(unlockRef, label) {
  if (typeof unlockRef !== "string" || unlockRef.length === 0) {
    addError("Adaptations", `${label} must be a non-empty string`);
    return;
  }

  const separatorIndex = unlockRef.indexOf(":");
  if (separatorIndex === -1) {
    addError("Adaptations", `${label} ${formatId(unlockRef)} is missing kind:id separator`);
    return;
  }

  const kind = unlockRef.slice(0, separatorIndex);
  const id = unlockRef.slice(separatorIndex + 1);

  if (id.length === 0) {
    addError("Adaptations", `${label} ${formatId(unlockRef)} is missing referenced id`);
    return;
  }

  if (kind === "defense") {
    if (!defenseIds.has(id)) {
      addError("Adaptations", `${label} references missing defense ${formatId(id)}`);
    }
    return;
  }

  if (kind === "unit") {
    if (!unitIds.has(id)) {
      addError("Adaptations", `${label} references missing unit ${formatId(id)}`);
    }
    return;
  }

  if (kind === "chamber") {
    if (!chamberIds.has(id)) {
      addError("Adaptations", `${label} references missing chamber ${formatId(id)}`);
    }
    return;
  }

  if (kind === "upgrade") {
    if (!defenseIds.has(id) && !hasDefenseUpgradeBase(id)) {
      addError("Adaptations", `${label} references missing defense upgrade target ${formatId(id)}`);
    }
    return;
  }

  if (kind === "passive") {
    // Passive unlocks have no dedicated data file yet; validate format only.
    return;
  }

  addError("Adaptations", `${label} has unknown unlock kind ${formatId(kind)}`);
}

function validateTuning() {
  validateResourceMap(tuning.startingResources, "tuning.startingResources", "Tuning");
  validateResourceMap(tuning.resourceCaps, "tuning.resourceCaps", "Tuning");
  validateResourceMap(tuning.recoveryIncomePer10Ticks, "tuning.recoveryIncomePer10Ticks", "Tuning");
}

function validateResourceMap(value, label, group, options = {}) {
  if (value == null && options.optional) {
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    addError(group, `${label} must be an object`);
    return;
  }

  for (const key of Object.keys(value)) {
    if (!RESOURCE_KEYS.has(key)) {
      addError(group, `${label} references unknown resource key ${formatId(key)}`);
    }
  }
}

function warnUnusedEnemies() {
  const waveEnemyIds = new Set();
  for (const wave of waves) {
    for (const spawn of asArray(wave?.spawns, `wave ${formatId(wave?.wave)}.spawns`, "Waves")) {
      const enemyRef = spawn?.enemy ?? spawn?.typeId;
      if (enemyIds.has(enemyRef)) {
        waveEnemyIds.add(enemyRef);
      }
    }
  }

  for (const enemy of enemies) {
    if (enemy?.id && !waveEnemyIds.has(enemy.id)) {
      addWarning("Enemies", `enemy ${formatId(enemy.id)} is never used by any wave`);
    }
  }
}

function collectAllNodeRefs(mapFiles) {
  const refs = new Set();
  for (const map of mapFiles) {
    for (const nodeId of map.nodeIds) {
      refs.add(nodeId);
    }
    for (const nodeType of map.nodeTypes) {
      refs.add(nodeType);
    }
  }
  return refs;
}

function resolveNodeRefInMap(nodeRef, map) {
  if (map.nodeById.has(nodeRef)) {
    return map.nodeById.get(nodeRef);
  }

  return map.nodes.find((node) => node?.type === nodeRef) ?? null;
}

function hasDefenseUpgradeBase(upgradeId) {
  if (defenseIds.has(upgradeId)) {
    return true;
  }

  const parts = upgradeId.split("_");
  while (parts.length > 1) {
    parts.pop();
    if (defenseIds.has(parts.join("_"))) {
      return true;
    }
  }

  return false;
}

// Mirrors Pathfinder.findPath:
// - returns [] if either node is missing
// - returns [] when start === goal
// - BFS by fewest hops
// - scans edges in insertion order
// - treats edges as undirected
// - ignores visibility for full-graph data pathability
function findPath(startNodeId, goalNodeId, map) {
  if (!map.nodeById.has(startNodeId) || !map.nodeById.has(goalNodeId)) {
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

    for (const edge of map.edges) {
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

function uniqueIds(items, singularLabel, collectionLabel, group) {
  const ids = new Set();
  const seen = new Set();

  for (const [index, item] of items.entries()) {
    if (!item || typeof item.id !== "string" || item.id.length === 0) {
      addError(group, `${collectionLabel}[${index}] is missing a string id`);
      continue;
    }

    if (seen.has(item.id)) {
      addError(group, `duplicate ${singularLabel} id ${formatId(item.id)} in ${collectionLabel}`);
      continue;
    }

    seen.add(item.id);
    ids.add(item.id);
  }

  return ids;
}

function uniqueNumbers(items, fieldName, collectionLabel, group) {
  const values = new Set();
  const seen = new Set();

  for (const [index, item] of items.entries()) {
    const value = item?.[fieldName];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      addError(group, `${collectionLabel}[${index}] is missing numeric ${fieldName}`);
      continue;
    }

    if (seen.has(value)) {
      addError(group, `duplicate ${fieldName} ${formatId(value)} in ${collectionLabel}`);
      continue;
    }

    seen.add(value);
    values.add(value);
  }

  return values;
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    addError("Files", `failed to read/parse ${relativePath}: ${error.message}`);
    return null;
  }
}

function asArray(value, label, group) {
  if (Array.isArray(value)) {
    return value;
  }

  addError(group, `expected ${label} to be an array`);
  return [];
}

function addError(group, message) {
  addGroupedItem(errorsByGroup, group, message);
}

function addWarning(group, message) {
  addGroupedItem(warningsByGroup, group, message);
}

function addGroupedItem(map, group, message) {
  if (!map.has(group)) {
    map.set(group, []);
  }
  map.get(group).push(message);
}

function countGroupedItems(map) {
  let count = 0;
  for (const items of map.values()) {
    count += items.length;
  }
  return count;
}

function formatId(value) {
  return `"${String(value)}"`;
}

function printResults() {
  const errorCount = countGroupedItems(errorsByGroup);
  const warningCount = countGroupedItems(warningsByGroup);

  console.log("DATA VALIDATION");
  console.log(`  data files loaded: ${dataFiles.size}`);
  console.log(`  map files loaded: ${maps.length}`);
  console.log(`  enemies: ${enemyIds.size}`);
  console.log(`  waves: ${waveNumbers.size}`);
  console.log(`  units: ${unitIds.size}`);
  console.log(`  defenses: ${defenseIds.size}`);
  console.log(`  chambers: ${chamberIds.size}`);
  console.log(`  adaptations: ${adaptationIds.size}`);
  console.log("");

  printGrouped("ERRORS", errorsByGroup, "ERROR");
  console.log("");
  printGrouped("WARNINGS", warningsByGroup, "WARNING");
  console.log("");

  if (errorCount === 0) {
    console.log(`clean: ${warningCount} warnings`);
  } else {
    console.log(`${errorCount} errors, ${warningCount} warnings`);
  }
}

function printGrouped(title, groups, prefix) {
  console.log(title);
  if (groups.size === 0) {
    console.log("  none");
    return;
  }

  for (const [group, messages] of groups) {
    console.log(`  ${group}`);
    for (const message of messages) {
      console.log(`    ${prefix}: ${message}`);
    }
  }
}
