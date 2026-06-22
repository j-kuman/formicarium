import type { AdaptationData, EnemyData } from "../types/data";
import type { SimEvent } from "../types/events";
import type { GameState } from "../types/game";

export class AdaptationManager {
  private readonly enemyDataById: Map<string, EnemyData>;

  constructor(private readonly adaptations: AdaptationData[], enemies: EnemyData[]) {
    this.enemyDataById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  }

  onEnemyDied(state: GameState, enemyTypeId: string): SimEvent[] {
    const sampleDrop = this.enemyDataById.get(enemyTypeId)?.sampleDrop;
    if (!sampleDrop) {
      return [];
    }

    const count = (state.samples.get(sampleDrop) ?? 0) + 1;
    state.samples.set(sampleDrop, count);

    return [
      {
        type: "SAMPLE_COLLECTED",
        tick: state.tick,
        enemyTypeId,
        payload: { sampleId: sampleDrop, count },
      },
    ];
  }

  tick(state: GameState): SimEvent[] {
    const events: SimEvent[] = [];
    for (const adaptation of this.adaptations) {
      if (state.unlockedAdaptations.has(adaptation.id) || !this.requirementsMet(state, adaptation)) {
        continue;
      }

      state.unlockedAdaptations.add(adaptation.id);
      events.push({
        type: "ADAPTATION_UNLOCKED",
        tick: state.tick,
        payload: { adaptationId: adaptation.id, unlocks: adaptation.unlocks },
      });
    }

    return events;
  }

  private requirementsMet(state: GameState, adaptation: AdaptationData): boolean {
    return Object.entries(adaptation.requires).every(([sampleId, required]) => (state.samples.get(sampleId) ?? 0) >= required);
  }
}
