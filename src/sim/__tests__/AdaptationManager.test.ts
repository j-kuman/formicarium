import { describe, expect, it } from "vitest";

import { AdaptationManager } from "../AdaptationManager";
import type { AdaptationData, DefenseData, EnemyData } from "../../types/data";
import type { GameState } from "../../types/game";

describe("AdaptationManager", () => {
  it("collects sample drops, unlocks adaptations when requirements are met, and makes linked defenses placeable", () => {
    const state = gameState();
    const manager = new AdaptationManager(adaptations, enemies);

    expect(manager.onEnemyDied(state, "spore_mite")).toHaveLength(1);
    expect(manager.onEnemyDied(state, "spore_mite")).toHaveLength(1);
    expect(state.samples.get("fungal_sample")).toBe(2);
    expect(manager.tick(state)).toEqual([]);
    expect(placeableDefenses(state).map((defense) => defense.id)).not.toContain("spore_scrubber");

    const sampleEvents = manager.onEnemyDied(state, "spore_mite");
    const unlockEvents = manager.tick(state);

    expect(state.samples.get("fungal_sample")).toBe(3);
    expect(sampleEvents[0]).toMatchObject({
      type: "SAMPLE_COLLECTED",
      enemyTypeId: "spore_mite",
      payload: { sampleId: "fungal_sample", count: 3 },
    });
    expect(state.unlockedAdaptations.has("spore_scrubber_unlock")).toBe(true);
    expect(unlockEvents).toContainEqual(
      expect.objectContaining({
        type: "ADAPTATION_UNLOCKED",
        payload: expect.objectContaining({ adaptationId: "spore_scrubber_unlock", unlocks: "defense:spore_scrubber" }),
      }),
    );
    expect(placeableDefenses(state).map((defense) => defense.id)).toContain("spore_scrubber");
  });
});

function placeableDefenses(state: Readonly<GameState>): DefenseData[] {
  return defenses.filter((defense) => !defense.requiresAdaptation || state.unlockedAdaptations.has(defense.requiresAdaptation));
}

function gameState(): GameState {
  return {
    phase: "wave",
    act: 2,
    wave: 10,
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
    breachTriggered: true,
    deepNodesVisible: true,
    claimedDeepNodes: false,
    gameOver: false,
    victory: false,
    waveEnemiesRemaining: 0,
    selectedId: null,
    selectedKind: null,
  };
}

const adaptations: AdaptationData[] = [
  {
    id: "spore_scrubber_unlock",
    name: "Spore Scrubbers",
    requires: { fungal_sample: 3 },
    unlocks: "defense:spore_scrubber",
  },
];

const enemies: EnemyData[] = [
  {
    id: "spore_mite",
    name: "Spore Mite",
    hp: 6,
    attack: 3,
    speed: 1.5,
    armor: 0,
    targetPriority: ["brood", "junction"],
    tags: ["deep", "swarm", "contaminates"],
    act: 2,
    reward: { food: 1 },
    sampleDrop: "fungal_sample",
  },
];

const defenses: DefenseData[] = [
  {
    id: "guard_post",
    name: "Guard Post",
    placement: "node",
    cost: { soil: 30, food: 15 },
    hp: 120,
    effects: { dps: 12, cooldownTicks: 1 },
    tags: ["melee", "blocker"],
  },
  {
    id: "spore_scrubber",
    name: "Spore Scrubber",
    placement: "node",
    cost: { soil: 20, food: 10 },
    hp: 50,
    effects: { cleanRatePerTick: 0.025 },
    tags: ["deep", "adaptation", "cleanse"],
    requiresAdaptation: "spore_scrubber_unlock",
  },
];
