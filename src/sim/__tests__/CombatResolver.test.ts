import { describe, expect, it } from "vitest";

import { CombatResolver } from "../CombatResolver";
import { ResourceManager } from "../ResourceManager";
import type { DefenseData, TuningData } from "../../types/data";
import type { DefenseInstance, EdgeState, EnemyInstance, GameState, NodeState } from "../../types/game";

describe("CombatResolver", () => {
  it("enemy advances along edge each tick proportional to speed and deltaMs", () => {
    const state = gameState({ enemies: [enemy({ speed: 1 })] });

    resolver().tick(state, 1000);

    expect(state.enemies[0]?.progress).toBeCloseTo(0.01);
  });

  it("enemy transitions to next edge when progress is at least 1.0", () => {
    const state = gameState({ enemies: [enemy({ speed: 200 })] });

    resolver().tick(state, 1000);

    expect(state.enemies[0]?.edgeId).toBe("edge_mid_queen");
    expect(state.enemies[0]?.progress).toBe(0);
  });

  it("enemy reaching target node deals attack damage to node hp", () => {
    const state = gameState({ enemies: [enemy({ attack: 7, pathEdges: ["edge_mid_queen"], speed: 200 })] });

    resolver().tick(state, 1000);

    expect(state.nodes.get("queen_chamber")?.hp).toBe(193);
  });

  it("enemy reaching queen_chamber decrements queenHp", () => {
    const state = gameState({ enemies: [enemy({ attack: 11, pathEdges: ["edge_mid_queen"], speed: 200 })] });

    resolver().tick(state, 1000);

    expect(state.queenHp).toBe(189);
  });

  it("enemy death from hp depletion decrements waveEnemiesRemaining", () => {
    const state = gameState({
      enemies: [enemy({ hp: 1, speed: 0 })],
      defenses: [defense({ typeId: "guard_post", nodeId: "junction" })],
      waveEnemiesRemaining: 1,
    });

    resolver().tick(state, 1000);

    expect(state.enemies).toHaveLength(0);
    expect(state.waveEnemiesRemaining).toBe(0);
  });

  it("enemy goal-reach decrements waveEnemiesRemaining", () => {
    const state = gameState({
      enemies: [enemy({ pathEdges: ["edge_mid_queen"], speed: 200 })],
      waveEnemiesRemaining: 1,
    });

    resolver().tick(state, 1000);

    expect(state.waveEnemiesRemaining).toBe(0);
  });

  it("both death and goal-reach emit the correct SimEvent", () => {
    const killed = gameState({
      enemies: [enemy({ hp: 1, speed: 0 })],
      defenses: [defense({ typeId: "guard_post", nodeId: "junction" })],
    });
    const reached = gameState({ enemies: [enemy({ pathEdges: ["edge_mid_queen"], speed: 200 })] });

    expect(resolver().tick(killed, 1000).map((event) => event.type)).toContain("ENEMY_DIED");
    expect(resolver().tick(reached, 1000).map((event) => event.type)).toContain("ENEMY_REACHED_GOAL");
  });

  it("killing an enemy grants its reward to resources", () => {
    const state = gameState({
      enemies: [enemy({ hp: 1, speed: 0 })],
      defenses: [defense({ typeId: "guard_post", nodeId: "junction" })],
      resources: { food: 10, resin: 10, soil: 10 },
    });

    resolver().tick(state, 1000);

    expect(state.resources.food).toBe(12);
  });

  it("granted reward is clamped to resource caps", () => {
    const state = gameState({
      enemies: [enemy({ hp: 1, speed: 0 })],
      defenses: [defense({ typeId: "guard_post", nodeId: "junction" })],
      resources: { food: 199, resin: 9999, soil: 9999 },
    });
    const manager = new ResourceManager();
    manager.tick(state, tuning);

    new CombatResolver(enemyData, defenseData, manager).tick(state, 1000);

    expect(state.resources.food).toBe(200);
  });

  it("reaching goal grants no reward", () => {
    const state = gameState({
      enemies: [enemy({ pathEdges: ["edge_mid_queen"], speed: 200 })],
      resources: { food: 10, resin: 10, soil: 10 },
    });

    resolver().tick(state, 1000);

    expect(state.resources).toEqual({ food: 10, resin: 10, soil: 10 });
  });

  it("acid_sprayer applies a DoT that deals post-armor damage per tick and expires after dotDuration", () => {
    const state = gameState({
      enemies: [enemy({ armor: 2, hp: 20, speed: 0 })],
      defenses: [defense({ cooldownTicksRemaining: 0, typeId: "acid_sprayer", nodeId: "junction" })],
    });

    resolver().tick(state, 1000);

    expect(state.enemies[0]?.hp).toBe(14);
    expect(state.enemies[0]?.dotDamage).toBe(6);
    expect(state.enemies[0]?.dotTicksRemaining).toBe(2);
  });

  it("guard_post deals continuous per-tick damage and ignores cooldownTicks", () => {
    const state = gameState({
      enemies: [enemy({ armor: 0, hp: 30, speed: 0 })],
      defenses: [defense({ cooldownTicksRemaining: 999, typeId: "guard_post", nodeId: "junction" })],
    });

    resolver().tick(state, 1000);

    expect(state.enemies[0]?.hp).toBe(18);
  });

  it("armor reduces damage to floor of 0", () => {
    const lowDamageDefense: DefenseData = {
      id: "guard_post",
      name: "Guard Post",
      placement: "node",
      cost: {},
      hp: 1,
      effects: { dps: 5, cooldownTicks: 1 },
      tags: [],
    };
    const state = gameState({
      enemies: [enemy({ armor: 10, hp: 30, speed: 0 })],
      defenses: [defense({ typeId: "guard_post", nodeId: "junction" })],
    });

    new CombatResolver(enemyData, [lowDamageDefense]).tick(state, 1000);

    expect(state.enemies[0]?.hp).toBe(30);
  });

  it("resin_barricade sets slowFactor on enemies on its edge", () => {
    const state = gameState({
      enemies: [enemy({ edgeId: "edge_entrance_mid" })],
      defenses: [defense({ typeId: "resin_barricade", edgeId: "edge_entrance_mid" })],
    });

    resolver().tick(state, 1000);

    expect(state.enemies[0]?.slowFactor).toBe(0.65);
  });

  it("ignores_resin tag prevents slowFactor from resin_barricade", () => {
    const state = gameState({
      enemies: [enemy({ edgeId: "edge_entrance_mid", typeId: "pale_borer" })],
      defenses: [defense({ typeId: "resin_barricade", edgeId: "edge_entrance_mid" })],
    });

    resolver().tick(state, 1000);

    expect(state.enemies[0]?.slowFactor).toBe(1);
  });

  it("game over set when queenHp reaches 0", () => {
    const state = gameState({
      enemies: [enemy({ attack: 200, pathEdges: ["edge_mid_queen"], speed: 200 })],
      queenHp: 100,
    });

    const events = resolver().tick(state, 1000);

    expect(state.gameOver).toBe(true);
    expect(events.map((event) => event.type)).toContain("GAME_OVER");
  });
});

function resolver() {
  return new CombatResolver(enemyData, defenseData);
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "wave",
    act: 1,
    wave: 1,
    tick: 0,
    phaseTick: 0,
    resources: { food: 100, resin: 100, soil: 100 },
    nodes: new Map([
      ["entrance", node("entrance", "entrance")],
      ["junction", node("junction", "junction")],
      ["queen_chamber", node("queen_chamber", "queen", 200)],
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
    waveEnemiesRemaining: 1,
    selectedId: null,
    selectedKind: null,
    ...overrides,
  };
}

function node(id: string, type: NodeState["type"], hp = 100): NodeState {
  return {
    id,
    type,
    hp,
    maxHp: hp,
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

function defense(overrides: Partial<DefenseInstance> = {}): DefenseInstance {
  return {
    id: "defense_1",
    typeId: "guard_post",
    nodeId: null,
    edgeId: null,
    upgradeLevel: 0,
    cooldownTicksRemaining: 0,
    hp: 100,
    maxHp: 100,
    ...overrides,
  };
}

const enemyData = [
  {
    id: "mite_swarm",
    name: "Mite Swarm",
    hp: 8,
    attack: 5,
    speed: 1.8,
    armor: 0,
    targetPriority: ["queen"],
    tags: ["surface"],
    act: 1,
    reward: { food: 2 },
  },
  {
    id: "pale_borer",
    name: "Pale Borer",
    hp: 35,
    attack: 15,
    speed: 0.9,
    armor: 5,
    targetPriority: ["queen"],
    tags: ["deep", "ignores_resin"],
    act: 2,
    reward: { soil: 8 },
  },
];

const defenseData: DefenseData[] = [
  {
    id: "guard_post",
    name: "Guard Post",
    placement: "node",
    cost: {},
    hp: 120,
    effects: { dps: 12, cooldownTicks: 1 },
    tags: ["melee"],
  },
  {
    id: "acid_sprayer",
    name: "Acid Sprayer",
    placement: "node",
    cost: {},
    hp: 60,
    effects: { dps: 8, dotDuration: 3, cooldownTicks: 60 },
    tags: ["damage", "dot"],
  },
  {
    id: "resin_barricade",
    name: "Resin Barricade",
    placement: "edge",
    cost: {},
    hp: 80,
    effects: { slowFactor: 0.65 },
    tags: ["slow"],
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
};
