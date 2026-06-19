import { describe, expect, it } from "vitest";

import { Pathfinder } from "../Pathfinder";
import { WaveSpawner } from "../WaveSpawner";
import type { EnemyData, WaveData } from "../../types/data";
import type { EdgeState, GameState, NodeState } from "../../types/game";

describe("WaveSpawner", () => {
  it("startWave sets waveEnemiesRemaining to total spawn count", () => {
    const { spawner, state } = buildFixture();

    spawner.startWave(state, 1);

    expect(state.waveEnemiesRemaining).toBe(3);
  });

  it("enemies spawn at correct tick intervals", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);

    spawner.tick(state);
    expect(state.enemies).toHaveLength(1);

    state.tick = 59;
    spawner.tick(state);
    expect(state.enemies).toHaveLength(1);

    state.tick = 60;
    spawner.tick(state);
    expect(state.enemies).toHaveLength(2);
  });

  it("spawn target alias is resolved to a concrete node id before pathing", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);

    spawner.tick(state);

    expect(state.enemies[0]?.targetNodeId).toBe("queen_chamber");
  });

  it("spawned enemy has correct pathEdges from entrance to resolved target", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);

    spawner.tick(state);

    expect(state.enemies[0]?.pathEdges).toEqual(["edge_entrance_mid", "edge_mid_queen"]);
  });

  it("spawned enemy initial edgeId is first edge in path", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);

    spawner.tick(state);

    expect(state.enemies[0]?.edgeId).toBe("edge_entrance_mid");
  });

  it("emits WAVE_STARTED event on first spawn", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);

    const firstEvents = spawner.tick(state);
    state.tick = 60;
    const secondEvents = spawner.tick(state);

    expect(firstEvents).toContainEqual({ type: "WAVE_STARTED", tick: 0, wave: 1 });
    expect(secondEvents).toEqual([]);
  });

  it("startWave with an unknown wave number zeroes remaining and returns no events", () => {
    const { spawner, state } = buildFixture();
    state.waveEnemiesRemaining = 99;

    const events = spawner.startWave(state, 999);

    expect(state.waveEnemiesRemaining).toBe(0);
    expect(events).toEqual([]);
  });

  it("spawns every enemy across the wave then stops", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);

    for (const t of [0, 60, 120]) {
      state.tick = t;
      spawner.tick(state);
    }
    expect(state.enemies).toHaveLength(3);

    state.tick = 240;
    expect(spawner.tick(state)).toEqual([]);
    expect(state.enemies).toHaveLength(3);
  });

  it("spawned enemy carries stats from enemy data", () => {
    const { spawner, state } = buildFixture();
    spawner.startWave(state, 1);
    spawner.tick(state);

    expect(state.enemies[0]).toMatchObject({
      typeId: "mite_swarm",
      hp: 8,
      maxHp: 8,
      speed: 1.8,
      attack: 5,
      armor: 0,
      slowFactor: 1,
    });
  });

  it("totals counts across multiple spawn groups", () => {
    const { state } = buildFixture();
    const pathfinder = new Pathfinder(state.nodes, state.edges);
    const multiWave: WaveData[] = [
      {
        wave: 1,
        act: 1,
        warningTicks: 300,
        spawns: [
          { enemy: "mite_swarm", count: 2, entrance: "entrance", target: "queen", intervalTicks: 30 },
          { enemy: "mite_swarm", count: 3, entrance: "entrance", target: "queen", intervalTicks: 20 },
        ],
      },
    ];
    const spawner = new WaveSpawner(multiWave, enemies, pathfinder);

    spawner.startWave(state, 1);

    expect(state.waveEnemiesRemaining).toBe(5);
  });
});

function buildFixture() {
  const nodes = new Map<string, NodeState>([
    ["entrance", node("entrance", "entrance")],
    ["junction", node("junction", "junction")],
    ["queen_chamber", node("queen_chamber", "queen")],
  ]);
  const edges = new Map<string, EdgeState>([
    ["edge_entrance_mid", edge("edge_entrance_mid", "entrance", "junction")],
    ["edge_mid_queen", edge("edge_mid_queen", "junction", "queen_chamber")],
  ]);
  const pathfinder = new Pathfinder(nodes, edges);
  const state = gameState({ edges, nodes });

  return {
    spawner: new WaveSpawner(waves, enemies, pathfinder),
    state,
  };
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "wave",
    act: 1,
    wave: 1,
    tick: 0,
    phaseTick: 0,
    resources: { food: 100, resin: 100, soil: 100 },
    nodes: new Map(),
    edges: new Map(),
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

function node(id: string, type: NodeState["type"]): NodeState {
  return {
    id,
    type,
    hp: 100,
    maxHp: 100,
    x: 0,
    y: 0,
    visible: true,
    defenseSlots: 1,
    squadSlot: false,
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
    defenseSlots: 0,
    hp: 100,
    maxHp: 100,
    contaminated: false,
  };
}

const waves: WaveData[] = [
  {
    wave: 1,
    act: 1,
    warningTicks: 300,
    spawns: [{ enemy: "mite_swarm", count: 3, entrance: "entrance", target: "queen", intervalTicks: 60 }],
  },
];

const enemies: EnemyData[] = [
  {
    id: "mite_swarm",
    name: "Mite Swarm",
    hp: 8,
    attack: 5,
    speed: 1.8,
    armor: 0,
    targetPriority: ["queen"],
    tags: ["swarm"],
    act: 1,
    reward: { food: 2 },
  },
];
