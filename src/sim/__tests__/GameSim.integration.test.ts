import { describe, expect, it } from "vitest";

import { GameSim } from "../GameSim";
import type { InputCommand } from "../../types/commands";
import type { ChamberData, DefenseData, EnemyData, MapData, TuningData, UnitData, WaveData } from "../../types/data";
import type { EdgeState, GameState, NodeState, SquadInstance } from "../../types/game";
import type { SimEvent } from "../../types/events";

interface Frame {
  deltaMs: number;
  commands: InputCommand[];
}

describe("GameSim integration foundation", () => {
  it("replays the same command stream to the same final state and event stream", () => {
    const step = nominalDeltaMs();
    const frames: Frame[] = [
      { deltaMs: step, commands: [{ type: "select_node", nodeId: "junction" }] },
      { deltaMs: step, commands: [{ type: "spawn_squad", unitTypeId: "soldier", count: 1, nodeId: "junction" }] },
      { deltaMs: step, commands: [{ type: "set_squad_stance", squadId: "squad_1", stance: "intercept" }] },
      { deltaMs: step, commands: [{ type: "advance_phase" }] },
      { deltaMs: step, commands: [{ type: "advance_phase" }] },
      ...Array.from({ length: tuning.recoveryPhaseDurationTicks + tuning.buildPhaseDurationTicks }, () => ({
        deltaMs: step,
        commands: [],
      })),
    ];

    const first = runFrames(frames);
    const second = runFrames(frames);

    expect(second.events).toEqual(first.events);
    expect(second.state).toEqual(first.state);
  });

  it("runs Segment-2 squad mechanics end-to-end without relying on balance numbers", () => {
    const sim = buildSim({
      waves: [
        {
          wave: 1,
          act: 1,
          warningTicks: tuning.buildPhaseDurationTicks,
          spawns: [
            { enemy: "training_beetle", count: 1, entrance: "entrance", target: "queen", intervalTicks: 0 },
            { enemy: "pheromone_leech", count: 1, entrance: "entrance", target: "junction", intervalTicks: 0 },
          ],
        },
      ],
    });

    runTick(sim, [{ type: "spawn_squad", unitTypeId: "soldier", count: 1, nodeId: "queen_chamber" }]);
    runTick(sim, [{ type: "spawn_squad", unitTypeId: "worker", count: 1, nodeId: "junction" }]);
    runTick(sim, [{ type: "assign_squad", squadId: "squad_1", nodeId: "junction" }]);

    const assignedSoldier = getSquad(sim, "squad_1");
    expect(assignedSoldier.assignedNodeId).toBe("junction");

    runTick(sim, [{ type: "advance_phase" }]);
    const firstWaveEvents = runTick(sim, [{ type: "advance_phase" }]);

    const trainingEnemy = sim.getState().enemies.find((enemy) => enemy.typeId === "training_beetle");
    expect(trainingEnemy?.hp).toBeLessThan(trainingEnemy?.maxHp ?? Number.NEGATIVE_INFINITY);
    expect(firstWaveEvents.map((event) => event.type)).toContain("SQUAD_PANICKED");
    expect(getSquad(sim, "squad_1").stance).toBe("retreat");

    const damagedJunctionHp = sim.getState().nodes.get("junction")?.hp ?? 0;
    expect(damagedJunctionHp).toBeLessThan(sim.getState().nodes.get("junction")?.maxHp ?? 0);

    runTick(sim, [
      { type: "assign_squad", squadId: "squad_1", nodeId: "junction" },
      { type: "set_squad_stance", squadId: "squad_1", stance: "hold" },
    ]);

    const recoveryEvents = runUntil(sim, (events) => events.some(isTransition("wave", "recovery")));
    expect(recoveryEvents.some(isTransition("wave", "recovery"))).toBe(true);
    expect(sim.getState().phase).toBe("recovery");

    runTick(sim, [
      { type: "assign_squad", squadId: "squad_2", nodeId: "junction" },
      { type: "set_squad_stance", squadId: "squad_2", stance: "repair" },
    ]);
    runTick(sim, []);

    expect(sim.getState().nodes.get("junction")?.hp).toBeGreaterThan(damagedJunctionHp);
  });

  it("emits the Segment-1 phase transition sequence through ended", () => {
    const sim = buildSim({ waves: [{ wave: 1, act: 1, warningTicks: tuning.ticksPerSecond, spawns: [] }] });

    const events: SimEvent[] = [];
    while (sim.getState().phase !== "ended") {
      const phase = sim.getState().phase;
      events.push(...runTick(sim, phase === "scout" || phase === "build" ? [{ type: "advance_phase" }] : []));
    }

    const phasePairs = events
      .filter((event) => event.type === "PHASE_TRANSITION")
      .map((event) => `${event.fromPhase}->${event.toPhase}`);

    expect(phasePairs).toEqual(["scout->build", "build->wave", "wave->recovery", "recovery->ended"]);
  });
});

function runFrames(frames: Frame[]): { state: ReturnType<typeof snapshotState>; events: SimEvent[] } {
  const sim = buildSim();
  const events = frames.flatMap((frame) => sim.tick(frame.deltaMs, frame.commands));
  return { state: snapshotState(sim.getState()), events };
}

function runTick(sim: GameSim, commands: InputCommand[]): SimEvent[] {
  return sim.tick(nominalDeltaMs(), commands);
}

function runUntil(sim: GameSim, done: (events: SimEvent[]) => boolean): SimEvent[] {
  for (let step = 0; step < MAX_INTEGRATION_STEPS; step += 1) {
    const events = runTick(sim, []);
    if (done(events)) {
      return events;
    }
  }

  throw new Error("GameSim integration scenario did not reach the expected state");
}

function isTransition(fromPhase: string, toPhase: string): (event: SimEvent) => boolean {
  return (event) => event.type === "PHASE_TRANSITION" && event.fromPhase === fromPhase && event.toPhase === toPhase;
}

function getSquad(sim: GameSim, squadId: string): Readonly<SquadInstance> {
  const squad = sim.getState().squads.find((entry) => entry.id === squadId);
  if (!squad) {
    throw new Error(`Expected squad ${squadId} to exist`);
  }
  return squad;
}

function buildSim(overrides: Partial<GameSimData> = {}): GameSim {
  return new GameSim({
    tuning,
    map,
    waves: defaultWaves,
    enemies,
    defenses,
    chambers,
    units,
    ...overrides,
  });
}

function nominalDeltaMs(): number {
  return 1000 / tuning.ticksPerSecond;
}

function snapshotState(state: Readonly<GameState>) {
  return {
    phase: state.phase,
    act: state.act,
    wave: state.wave,
    tick: state.tick,
    phaseTick: state.phaseTick,
    resources: { ...state.resources },
    nodes: sortedEntries(state.nodes, snapshotNode),
    edges: sortedEntries(state.edges, snapshotEdge),
    enemies: state.enemies.map((enemy) => ({ ...enemy })).sort(byId),
    squads: state.squads.map((squad) => ({ ...squad })).sort(byId),
    defenses: state.defenses.map((defense) => ({ ...defense })).sort(byId),
    queenHp: state.queenHp,
    queenMaxHp: state.queenMaxHp,
    samples: [...state.samples.entries()].sort(([left], [right]) => left.localeCompare(right)),
    unlockedAdaptations: [...state.unlockedAdaptations].sort(),
    foreshadowEvents: state.foreshadowEvents.map((event) => ({ ...event })),
    breachTriggered: state.breachTriggered,
    deepNodesVisible: state.deepNodesVisible,
    claimedDeepNodes: state.claimedDeepNodes,
    gameOver: state.gameOver,
    victory: state.victory,
    waveEnemiesRemaining: state.waveEnemiesRemaining,
    selectedId: state.selectedId,
    selectedKind: state.selectedKind,
  };
}

function sortedEntries<T, U>(entries: ReadonlyMap<string, T>, snapshot: (entry: T) => U): U[] {
  return [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => snapshot(entry));
}

function snapshotNode(node: NodeState) {
  return { ...node };
}

function snapshotEdge(edge: EdgeState) {
  return { ...edge };
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

interface GameSimData {
  tuning: TuningData;
  map: MapData;
  waves: WaveData[];
  enemies: EnemyData[];
  defenses: DefenseData[];
  chambers: ChamberData[];
  units: UnitData[];
}

const tuning: TuningData = {
  ticksPerSecond: 1,
  startingResources: { food: 100, resin: 100, soil: 100 },
  resourceCaps: { food: 200, resin: 200, soil: 200 },
  recoveryIncomePer10Ticks: { food: 0, resin: 0, soil: 0 },
  recoveryPhaseDurationTicks: 6,
  buildPhaseDurationTicks: 4,
  breachRevealDelayTicks: 3,
  cameraShakeDurationMs: 100,
  cameraShakeIntensity: 0.01,
  breachFlashDurationMs: 100,
  breachCameraScrollDurationMs: 100,
  enemyDeathLingerTicks: 1,
  patrolIntervalTicks: 2,
  squadRetaliationDpsMultiplier: 0,
  squadPanicRetreatTicks: 3,
  enemySpeedScale: 10,
};

const map: MapData = {
  mapWidth: 300,
  mapHeight: 200,
  viewportHeight: 200,
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
      y: 0,
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
      y: 0,
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
      length: 10,
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
      length: 10,
      visible: true,
      defenseSlots: 1,
      hp: 100,
      maxHp: 100,
    },
  ],
};

const defaultWaves: WaveData[] = [
  {
    wave: 1,
    act: 1,
    warningTicks: tuning.buildPhaseDurationTicks,
    spawns: [{ enemy: "training_beetle", count: 1, entrance: "entrance", target: "queen", intervalTicks: 0 }],
  },
];

const enemies: EnemyData[] = [
  {
    id: "training_beetle",
    name: "Training Beetle",
    hp: 12,
    attack: 0,
    speed: 0,
    armor: 0,
    targetPriority: ["queen"],
    tags: ["surface"],
    act: 1,
    reward: {},
  },
  {
    id: "pheromone_leech",
    name: "Pheromone Leech",
    hp: 10,
    attack: 5,
    speed: 1,
    armor: 0,
    targetPriority: ["junction"],
    tags: ["deep", "disrupts_squads"],
    act: 2,
    reward: {},
    onReach: "panic_nearby_squads",
  },
];

const defenses: DefenseData[] = [];
const chambers: ChamberData[] = [];
const units: UnitData[] = [
  {
    id: "soldier",
    name: "Soldier",
    hp: 30,
    attack: 5,
    speed: 1,
    role: "melee",
    costPerUnit: { food: 1 },
  },
  {
    id: "worker",
    name: "Worker",
    hp: 10,
    attack: 0,
    speed: 1,
    role: "repair",
    repairRatePerTick: 2,
    costPerUnit: { food: 1 },
  },
];

const MAX_INTEGRATION_STEPS = 100;
