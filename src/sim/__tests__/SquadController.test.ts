import { describe, expect, it } from "vitest";

import { Pathfinder } from "../Pathfinder";
import { SquadController } from "../SquadController";
import type { TuningData, UnitData } from "../../types/data";
import type { EdgeState, EnemyInstance, GameState, NodeState, SquadInstance } from "../../types/game";

describe("SquadController", () => {
  it("workers in repair stance restore assigned node hp during recovery", () => {
    const state = gameState({
      phase: "recovery",
      nodes: new Map([
        ["junction", node("junction", "junction", 50, 100)],
        ["queen_chamber", node("queen_chamber", "queen", 200, 200)],
      ]),
      squads: [squad({ typeId: "worker", count: 4, assignedNodeId: "junction", stance: "repair" })],
    });

    controller(state).tick(state, 1000);

    expect(state.nodes.get("junction")?.hp).toBe(52);
  });

  it("intercept reassigns a squad to a nearby enemy edge", () => {
    const state = gameState({
      squads: [squad({ assignedNodeId: "junction", stance: "intercept" })],
      enemies: [enemy({ edgeId: "edge_entrance_mid" })],
    });

    controller(state).tick(state, 1000);

    expect(state.squads[0]?.assignedNodeId).toBeNull();
    expect(state.squads[0]?.assignedEdgeId).toBe("edge_entrance_mid");
  });

  it("retreat moves a squad one graph step toward the queen chamber", () => {
    const state = gameState({
      squads: [squad({ assignedNodeId: "entrance", stance: "retreat" })],
    });

    controller(state).tick(state, 1000);

    expect(state.squads[0]?.assignedNodeId).toBe("junction");
  });
});

function controller(state: GameState): SquadController {
  return new SquadController(units, new Pathfinder(state.nodes, state.edges), tuning);
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "wave",
    act: 1,
    wave: 1,
    tick: 1,
    phaseTick: 0,
    resources: { food: 100, resin: 100, soil: 100 },
    nodes: new Map([
      ["entrance", node("entrance", "entrance")],
      ["junction", node("junction", "junction")],
      ["queen_chamber", node("queen_chamber", "queen", 200, 200)],
    ]),
    edges: new Map([
      ["edge_entrance_mid", edge("edge_entrance_mid", "entrance", "junction")],
      ["edge_mid_queen", edge("edge_mid_queen", "junction", "queen_chamber")],
    ]),
    enemies: [],
    squads: [],
    defenses: [],
    queenHp: 200,
    queenMaxHp: 200,
    samples: new Map(),
    unlockedAdaptations: new Set(),
    foreshadowEvents: [],
    breachTriggered: false,
    deepNodesVisible: false,
    claimedDeepNodes: false,
    gameOver: false,
    victory: false,
    waveEnemiesRemaining: 0,
    selectedId: null,
    selectedKind: null,
    ...overrides,
  };
}

function node(id: string, type: NodeState["type"], hp = 100, maxHp = hp): NodeState {
  return {
    id,
    type,
    hp,
    maxHp,
    x: 0,
    y: 0,
    visible: true,
    defenseSlots: 1,
    squadSlot: true,
    upgradeLevel: 0,
    contaminated: false,
    contaminationLevel: 0,
  };
}

function edge(id: string, nodeA: string, nodeB: string): EdgeState {
  return {
    id,
    nodeA,
    nodeB,
    width: "large",
    length: 100,
    visible: true,
    defenseSlots: 1,
    hp: 100,
    maxHp: 100,
    contaminated: false,
  };
}

function enemy(overrides: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    id: "enemy_1",
    typeId: "mite_swarm",
    hp: 10,
    maxHp: 10,
    edgeId: "edge_entrance_mid",
    progress: 0,
    pathEdges: ["edge_entrance_mid", "edge_mid_queen"],
    targetNodeId: "queen_chamber",
    attack: 5,
    armor: 0,
    speed: 1,
    slowFactor: 1,
    dotDamage: 0,
    dotTicksRemaining: 0,
    act: 1,
    ...overrides,
  };
}

function squad(overrides: Partial<SquadInstance> = {}): SquadInstance {
  return {
    id: "squad_1",
    typeId: "soldier",
    count: 2,
    assignedNodeId: "junction",
    assignedEdgeId: null,
    stance: "hold",
    hp: 60,
    maxHp: 60,
    inCombat: false,
    ...overrides,
  };
}

const units: UnitData[] = [
  {
    id: "worker",
    name: "Worker",
    hp: 10,
    attack: 2,
    speed: 1.5,
    role: "repair",
    repairRatePerTick: 0.5,
    costPerUnit: { food: 8 },
  },
  {
    id: "soldier",
    name: "Soldier",
    hp: 30,
    attack: 10,
    speed: 1.2,
    role: "melee",
    costPerUnit: { food: 15 },
  },
];

const tuning: TuningData = {
  ticksPerSecond: 60,
  startingResources: { food: 120, resin: 40, soil: 80 },
  resourceCaps: { food: 200, resin: 9999, soil: 9999 },
  recoveryIncomePer10Ticks: { food: 8, resin: 2, soil: 4 },
  recoveryPhaseDurationTicks: 120,
  buildPhaseDurationTicks: 300,
  breachRevealDelayTicks: 180,
  cameraShakeDurationMs: 1000,
  cameraShakeIntensity: 0.02,
  breachFlashDurationMs: 500,
  breachCameraScrollDurationMs: 2000,
  enemyDeathLingerTicks: 60,
  patrolIntervalTicks: 60,
  squadRetaliationDpsMultiplier: 0.5,
  squadPanicRetreatTicks: 100,
};
