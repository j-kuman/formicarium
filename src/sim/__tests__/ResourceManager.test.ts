import { describe, expect, it } from "vitest";

import { ResourceManager } from "../ResourceManager";
import type { ChamberData, TuningData } from "../../types/data";
import type { GameState, NodeState } from "../../types/game";

describe("ResourceManager", () => {
  it("spend returns false and does not mutate state when resources insufficient", () => {
    const state = gameState({ resources: { food: 4, resin: 5, soil: 6 } });
    const manager = new ResourceManager();

    expect(manager.spend(state, { food: 5 })).toBe(false);
    expect(state.resources).toEqual({ food: 4, resin: 5, soil: 6 });
  });

  it("spend deducts correctly when resources sufficient", () => {
    const state = gameState({ resources: { food: 40, resin: 30, soil: 20 } });
    const manager = new ResourceManager();

    expect(manager.spend(state, { food: 10, resin: 5 })).toBe(true);
    expect(state.resources).toEqual({ food: 30, resin: 25, soil: 20 });
  });

  it("recovery income applies only during recovery phase", () => {
    const recovery = gameState({ phase: "recovery", phaseTick: 10, resources: { food: 10, resin: 10, soil: 10 } });
    const scout = gameState({ phase: "scout", phaseTick: 10, resources: { food: 10, resin: 10, soil: 10 } });
    const manager = new ResourceManager();

    manager.tick(recovery, tuning);
    manager.tick(scout, tuning);

    expect(recovery.resources).toEqual({ food: 18, resin: 12, soil: 14 });
    expect(scout.resources).toEqual({ food: 10, resin: 10, soil: 10 });
  });

  it("recovery income respects resource caps", () => {
    const state = gameState({ phase: "recovery", phaseTick: 10, resources: { food: 198, resin: 9998, soil: 9998 } });
    const manager = new ResourceManager();

    manager.tick(state, tuning);

    expect(state.resources).toEqual({ food: 200, resin: 9999, soil: 9999 });
  });

  it("food cap increases when food_store upgraded", () => {
    const state = gameState({
      resources: { food: 250, resin: 0, soil: 0 },
      nodes: new Map([["food_store", node("food_store", "food", 1)]]),
    });
    const manager = new ResourceManager();
    manager.tick(state, tuning);

    manager.recomputeCaps(state, chambers);
    manager.grant(state, { food: 100 });

    expect(state.resources.food).toBe(300);
  });

  it("grant adds reward resources and clamps each to its cap", () => {
    const state = gameState({ resources: { food: 195, resin: 9998, soil: 9990 } });
    const manager = new ResourceManager();
    manager.tick(state, tuning);

    manager.grant(state, { food: 50, resin: 5, soil: 5 });

    expect(state.resources).toEqual({ food: 200, resin: 9999, soil: 9995 });
  });
});

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "scout",
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

function node(id: string, type: NodeState["type"], upgradeLevel: number): NodeState {
  return {
    id,
    type,
    hp: 100,
    maxHp: 100,
    x: 0,
    y: 0,
    visible: true,
    defenseSlots: 1,
    squadSlot: true,
    upgradeLevel,
    contaminated: false,
    contaminationLevel: 0,
  };
}

const chambers: ChamberData[] = [
  {
    id: "food",
    name: "Food Store",
    hp: 80,
    defenseSlots: 1,
    squadSlot: true,
    passiveEffect: { type: "food_cap_bonus", amount: 100 },
    upgrade: {
      cost: { soil: 30 },
      passiveEffect: { type: "food_cap_bonus", amount: 100 },
    },
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
