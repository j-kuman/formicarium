import { describe, expect, it } from "vitest";

import { PhaseController } from "../PhaseController";
import type { InputCommand } from "../../types/commands";
import type { TuningData, WaveData } from "../../types/data";
import type { GameState, Phase } from "../../types/game";

describe("PhaseController", () => {
  it("scout advances to build on advance_phase command", () => {
    const state = gameState({ phase: "scout" });
    const events = tick(state, [{ type: "advance_phase" }]);

    expect(state.phase).toBe("build");
    expect(events[0]?.type).toBe("PHASE_TRANSITION");
  });

  it("scout advances to build automatically after warningTicks", () => {
    const state = gameState({ phase: "scout", phaseTick: 299 });
    tick(state);

    expect(state.phase).toBe("build");
  });

  it("build advances to wave on advance_phase", () => {
    const state = gameState({ phase: "build" });
    tick(state, [{ type: "advance_phase" }]);

    expect(state.phase).toBe("wave");
  });

  it("build advances to wave automatically after buildPhaseDurationTicks", () => {
    const state = gameState({ phase: "build", phaseTick: 299 });
    const events = tick(state);

    expect(state.phase).toBe("wave");
    expect(events[0]).toMatchObject({
      type: "PHASE_TRANSITION",
      fromPhase: "build",
      toPhase: "wave",
      wave: 1,
    });
  });

  it("phaseTick increments on non-transition ticks and resets on transition", () => {
    const nonTransitionState = gameState({ phase: "scout", phaseTick: 10 });
    const nonTransitionEvents = tick(nonTransitionState);

    expect(nonTransitionEvents).toEqual([]);
    expect(nonTransitionState.phaseTick).toBe(11);

    const transitionState = gameState({ phase: "scout", phaseTick: 299 });
    tick(transitionState);

    expect(transitionState.phase).toBe("build");
    expect(transitionState.phaseTick).toBe(0);
  });

  it("ended phase is terminal", () => {
    const state = gameState({ phase: "ended", phaseTick: 17, wave: 2, waveEnemiesRemaining: 0 });
    const before = { ...state };
    const events = tick(state, [{ type: "advance_phase" }]);

    expect(events).toEqual([]);
    expect(state).toEqual(before);
  });

  it("wave advances to recovery when waveEnemiesRemaining reaches 0", () => {
    const state = gameState({ phase: "wave", waveEnemiesRemaining: 0 });
    tick(state);

    expect(state.phase).toBe("recovery");
  });

  it("recovery advances to scout after recoveryPhaseDurationTicks when next wave exists", () => {
    const state = gameState({ phase: "recovery", phaseTick: 119, wave: 1 });
    tick(state);

    expect(state.phase).toBe("scout");
  });

  it("recovery holds during breach reveal countdown", () => {
    const state = gameState({
      phase: "recovery",
      phaseTick: 119,
      wave: 1,
      breachTriggered: true,
      deepNodesVisible: false,
    });
    const events = tick(state);

    expect(events).toEqual([]);
    expect(state.phase).toBe("recovery");
    expect(state.phaseTick).toBe(120);
    expect(state.wave).toBe(1);
  });

  it("recovery advances to ended after recoveryPhaseDurationTicks when no next wave exists", () => {
    const state = gameState({ phase: "recovery", phaseTick: 119, wave: 2 });
    tick(state);

    expect(state.phase).toBe("ended");
  });

  it("wave number increments on recovery to scout transition", () => {
    const state = gameState({ phase: "recovery", phaseTick: 119, wave: 1 });
    tick(state);

    expect(state.wave).toBe(2);
  });

  it("emits PHASE_TRANSITION to ended when entering cliffhanger", () => {
    const state = gameState({ phase: "recovery", phaseTick: 119, wave: 2 });
    const events = tick(state);

    expect(events[0]).toMatchObject({
      type: "PHASE_TRANSITION",
      fromPhase: "recovery",
      toPhase: "ended",
      wave: 2,
    });
  });

  it("emits PHASE_TRANSITION event on every transition", () => {
    for (const phase of ["scout", "build", "wave", "recovery"] satisfies Phase[]) {
      const state = transitionReadyState(phase);
      const events = tick(state, phase === "scout" || phase === "build" ? [{ type: "advance_phase" }] : []);

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("PHASE_TRANSITION");
    }
  });
});

function tick(state: GameState, commands: InputCommand[] = []) {
  return new PhaseController(waves).tick(state, commands, tuning);
}

function transitionReadyState(phase: Phase): GameState {
  if (phase === "wave") {
    return gameState({ phase, waveEnemiesRemaining: 0 });
  }
  if (phase === "recovery") {
    return gameState({ phase, phaseTick: 119, wave: 1 });
  }
  return gameState({ phase });
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "scout",
    act: 1,
    wave: 1,
    tick: 42,
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
    waveEnemiesRemaining: 1,
    selectedId: null,
    selectedKind: null,
    ...overrides,
  };
}

const waves: WaveData[] = [
  { wave: 1, act: 1, warningTicks: 300, spawns: [] },
  { wave: 2, act: 1, warningTicks: 200, spawns: [] },
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
