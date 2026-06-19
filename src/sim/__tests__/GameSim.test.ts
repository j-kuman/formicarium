import { describe, expect, it } from "vitest";

import { GameSim } from "../GameSim";
import type { ChamberData, DefenseData, EnemyData, MapData, TuningData, UnitData, WaveData } from "../../types/data";

describe("GameSim", () => {
  it("builds initial state from map and tuning data", () => {
    const sim = buildSim();
    const state = sim.getState();

    expect(state.phase).toBe("scout");
    expect(state.resources).toEqual(tuning.startingResources);
    expect(state.nodes.get("queen_chamber")?.type).toBe("queen");
    expect(state.queenHp).toBe(200);
  });

  it("does not advance the sim before one nominal fixed step accumulates", () => {
    const sim = buildSim();

    sim.tick(10, []);

    expect(sim.getState().tick).toBe(0);
  });

  it("advances by fixed steps independent of one large frame", () => {
    const sim = buildSim();

    sim.tick(1000 / tuning.ticksPerSecond, []);

    expect(sim.getState().tick).toBe(1);
  });

  it("processes select and deselect commands", () => {
    const sim = buildSim();
    const step = 1000 / tuning.ticksPerSecond;

    sim.tick(step, [{ type: "select_node", nodeId: "queen_chamber" }]);
    expect(sim.getState().selectedId).toBe("queen_chamber");
    expect(sim.getState().selectedKind).toBe("node");

    sim.tick(step, [{ type: "deselect" }]);
    expect(sim.getState().selectedId).toBeNull();
    expect(sim.getState().selectedKind).toBeNull();
  });

  it("places a defense when slot and resources are valid", () => {
    const sim = buildSim();
    const step = 1000 / tuning.ticksPerSecond;

    sim.tick(step, [{ type: "place_defense", defenseTypeId: "guard_post", nodeId: "junction" }]);

    expect(sim.getState().defenses).toHaveLength(1);
    expect(sim.getState().resources.food).toBe(85);
    expect(sim.getState().resources.soil).toBe(70);
  });

  it("starts a wave when build advances to wave", () => {
    const sim = buildSim();
    const step = 1000 / tuning.ticksPerSecond;

    sim.tick(step, [{ type: "advance_phase" }]);
    const events = sim.tick(step, [{ type: "advance_phase" }]);

    expect(sim.getState().phase).toBe("wave");
    expect(sim.getState().waveEnemiesRemaining).toBe(1);
    expect(events.map((event) => event.type)).toContain("WAVE_STARTED");
  });
});

function buildSim() {
  return new GameSim({ chambers, defenses, enemies, map, tuning, units, waves });
}

const tuning: TuningData = {
  ticksPerSecond: 60,
  startingResources: { food: 100, resin: 100, soil: 100 },
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

const map: MapData = {
  mapWidth: 1200,
  mapHeight: 900,
  viewportHeight: 900,
  nodes: [
    {
      id: "entrance",
      type: "entrance",
      x: 0,
      y: 0,
      visible: true,
      defenseSlots: 0,
      squadSlot: false,
      hp: 9999,
      maxHp: 9999,
    },
    {
      id: "junction",
      type: "junction",
      x: 100,
      y: 100,
      visible: true,
      defenseSlots: 1,
      squadSlot: true,
      hp: 100,
      maxHp: 100,
    },
    {
      id: "queen_chamber",
      type: "queen",
      x: 200,
      y: 200,
      visible: true,
      defenseSlots: 1,
      squadSlot: true,
      hp: 200,
      maxHp: 200,
    },
  ],
  edges: [
    {
      id: "edge_entrance_junction",
      nodeA: "entrance",
      nodeB: "junction",
      width: "large",
      length: 100,
      visible: true,
      defenseSlots: 1,
      hp: 100,
      maxHp: 100,
    },
    {
      id: "edge_junction_queen",
      nodeA: "junction",
      nodeB: "queen_chamber",
      width: "large",
      length: 100,
      visible: true,
      defenseSlots: 1,
      hp: 100,
      maxHp: 100,
    },
  ],
};

const waves: WaveData[] = [
  {
    wave: 1,
    act: 1,
    warningTicks: 300,
    spawns: [{ enemy: "mite_swarm", count: 1, entrance: "entrance", target: "queen", intervalTicks: 60 }],
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
    tags: ["surface"],
    act: 1,
    reward: { food: 2 },
  },
];

const defenses: DefenseData[] = [
  {
    id: "guard_post",
    name: "Guard Post",
    placement: "node",
    cost: { food: 15, soil: 30 },
    hp: 120,
    effects: { dps: 12, cooldownTicks: 1 },
    tags: ["melee"],
  },
];

const chambers: ChamberData[] = [];
const units: UnitData[] = [];
