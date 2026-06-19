import { describe, expect, it } from "vitest";

import { BreachController } from "../BreachController";
import type { TuningData, WaveData } from "../../types/data";
import type { EdgeState, GameState, NodeState } from "../../types/game";

describe("BreachController", () => {
  it("foreshadow event queued and emitted on wave 7 start", () => {
    const state = gameState();
    const events = controller().onWaveStart(state, 7);

    expect(state.foreshadowEvents[0]).toMatchObject({ type: "tremor", wave: 7 });
    expect(events[0]).toMatchObject({ type: "FORESHADOW_EVENT", foreshadowType: "tremor" });
  });

  it("foreshadow event queued and emitted on wave 8 start", () => {
    const state = gameState();
    const events = controller().onWaveStart(state, 8);

    expect(state.foreshadowEvents[0]).toMatchObject({ type: "worker_refusal", wave: 8 });
    expect(events[0]).toMatchObject({ type: "FORESHADOW_EVENT", foreshadowType: "worker_refusal" });
  });

  it("foreshadow event queued and emitted on wave 9 start", () => {
    const state = gameState();
    const events = controller().onWaveStart(state, 9);

    expect(state.foreshadowEvents[0]).toMatchObject({ type: "crack", wave: 9 });
    expect(events[0]).toMatchObject({ type: "FORESHADOW_EVENT", foreshadowType: "crack" });
  });

  it("triggerBreach sets breachTriggered true and emits BREACH_TRIGGERED", () => {
    const state = gameState();
    const events = controller().triggerBreach(state);

    expect(state.breachTriggered).toBe(true);
    expect(events).toContainEqual({ type: "BREACH_TRIGGERED", tick: 0 });
  });

  it("deep nodes remain invisible until breachRevealDelayTicks elapses", () => {
    const state = gameState();
    const breach = controller();
    breach.triggerBreach(state);

    breach.tick(state);
    breach.tick(state);

    expect(state.nodes.get("deep_junction")?.visible).toBe(false);
    expect(state.edges.get("deep_edge")?.visible).toBe(false);
  });

  it("deep nodes set visible true after delay and DEEP_NODES_REVEALED emitted", () => {
    const state = gameState();
    const breach = controller();
    breach.triggerBreach(state);

    breach.tick(state);
    breach.tick(state);
    const events = breach.tick(state);

    expect(state.nodes.get("deep_junction")?.visible).toBe(true);
    expect(state.edges.get("deep_edge")?.visible).toBe(true);
    expect(state.deepNodesVisible).toBe(true);
    expect(events).toContainEqual({ type: "DEEP_NODES_REVEALED", tick: 0 });
  });

  it("triggerBreach does not set state.phase or start wave 10", () => {
    const state = gameState({ phase: "recovery", wave: 9 });
    controller().triggerBreach(state);

    expect(state.phase).toBe("recovery");
    expect(state.wave).toBe(9);
  });

  it("triggerVictory sets victory true and claimedDeepNodes true", () => {
    const state = gameState();
    const events = controller().triggerVictory(state);

    expect(state.victory).toBe(true);
    expect(state.claimedDeepNodes).toBe(true);
    expect(events).toContainEqual({ type: "VICTORY", tick: 0 });
  });

  it("onWaveStart with no foreshadow returns no events and queues nothing", () => {
  const state = gameState();
  const events = controller().onWaveStart(state, 6);

  expect(events).toEqual([]);
  expect(state.foreshadowEvents).toHaveLength(0);
});

it("recognized temperature foreshadow type is passed through", () => {
  const state = gameState();
  const breach = new BreachController(
    [
      ...waves,
      {
        wave: 10,
        act: 1,
        warningTicks: 240,
        foreshadow: "temperature",
        foreshadowMessage: "Temperature rising in the lower tunnels.",
        spawns: [],
      },
    ],
    tuning,
  );

  const events = breach.onWaveStart(state, 10);

  expect(state.foreshadowEvents[0]).toMatchObject({ type: "temperature", wave: 10 });
  expect(events[0]).toMatchObject({ type: "FORESHADOW_EVENT", foreshadowType: "temperature" });
});

it("unrecognized foreshadow type falls back to scout_warning", () => {
  const state = gameState();
  const breach = new BreachController(
    [
      ...waves,
      {
        wave: 10,
        act: 1,
        warningTicks: 240,
        foreshadow: "rumble",
        foreshadowMessage: "Something is moving below.",
        spawns: [],
      },
    ],
    tuning,
  );

  const events = breach.onWaveStart(state, 10);

  expect(state.foreshadowEvents[0]).toMatchObject({ type: "scout_warning", wave: 10 });
  expect(events[0]).toMatchObject({ type: "FORESHADOW_EVENT", foreshadowType: "scout_warning" });
});

it("foreshadow event message falls back to raw foreshadow string", () => {
  const state = gameState();
  const breach = new BreachController(
    [
      ...waves,
      {
        wave: 10,
        act: 1,
        warningTicks: 240,
        foreshadow: "temperature",
        spawns: [],
      },
    ],
    tuning,
  );

  const events = breach.onWaveStart(state, 10);

  expect(state.foreshadowEvents[0]).toMatchObject({ message: "temperature" });
  expect(events[0]).toMatchObject({ type: "FORESHADOW_EVENT", message: "temperature" });
});

it("tick before breach is a no-op while reveal delay is not active", () => {
  const state = gameState();

  const events = controller().tick(state);

  expect(events).toEqual([]);
  expect(state.nodes.get("deep_junction")?.visible).toBe(false);
  expect(state.edges.get("deep_edge")?.visible).toBe(false);
  expect(state.deepNodesVisible).toBe(false);
});
});

function controller() {
  return new BreachController(waves, tuning);
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "scout",
    act: 1,
    wave: 1,
    tick: 0,
    phaseTick: 0,
    resources: { food: 100, resin: 100, soil: 100 },
    nodes: new Map([
      ["queen_chamber", node("queen_chamber", "queen", true)],
      ["deep_junction", node("deep_junction", "deep_junction", false)],
    ]),
    edges: new Map([
      ["surface_edge", edge("surface_edge", true)],
      ["deep_edge", edge("deep_edge", false)],
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

function node(id: string, type: NodeState["type"], visible: boolean): NodeState {
  return {
    id,
    type,
    hp: 100,
    maxHp: 100,
    x: 0,
    y: 0,
    visible,
    defenseSlots: 1,
    squadSlot: false,
    upgradeLevel: 0,
    contaminated: false,
    contaminationLevel: 0,
  };
}

function edge(id: string, visible: boolean): EdgeState {
  return {
    id,
    nodeA: "queen_chamber",
    nodeB: "deep_junction",
    width: "large",
    length: 100,
    visible,
    defenseSlots: 1,
    hp: 100,
    maxHp: 100,
    contaminated: false,
  };
}

const waves: WaveData[] = [
  {
    wave: 7,
    act: 1,
    warningTicks: 240,
    foreshadow: "tremor",
    foreshadowMessage: "Vibrations detected below mapped colony.",
    spawns: [],
  },
  {
    wave: 8,
    act: 1,
    warningTicks: 240,
    foreshadow: "worker_refusal",
    foreshadowMessage: "Workers refuse to enter lower tunnels.",
    spawns: [],
  },
  {
    wave: 9,
    act: 1,
    warningTicks: 240,
    foreshadow: "crack",
    foreshadowMessage: "Hairline fractures observed beneath the queen chamber.",
    afterWaveEvent: "underbreach_trigger",
    spawns: [],
  },
];

const tuning: TuningData = {
  ticksPerSecond: 60,
  startingResources: { food: 120, resin: 40, soil: 80 },
  resourceCaps: { food: 200, resin: 9999, soil: 9999 },
  recoveryIncomePer10Ticks: { food: 8, resin: 2, soil: 4 },
  recoveryPhaseDurationTicks: 120,
  buildPhaseDurationTicks: 300,
  breachRevealDelayTicks: 3,
  cameraShakeDurationMs: 1000,
  cameraShakeIntensity: 0.02,
  breachFlashDurationMs: 500,
  breachCameraScrollDurationMs: 2000,
  enemyDeathLingerTicks: 60,
  patrolIntervalTicks: 60,
  squadRetaliationDpsMultiplier: 0.5,
};
