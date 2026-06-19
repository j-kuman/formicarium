import type { ChamberData, TuningData } from "../types/data";
import type { GameState, Resources } from "../types/game";
import type { SimEvent } from "../types/events";

export class ResourceManager {
  private baseCaps: Resources | null = null;
  private caps: Resources = {
    food: Number.MAX_SAFE_INTEGER,
    resin: Number.MAX_SAFE_INTEGER,
    soil: Number.MAX_SAFE_INTEGER,
  };

  tick(state: GameState, tuning: TuningData): SimEvent[] {
    this.ensureCaps(tuning);
    if (state.phase === "recovery" && state.phaseTick > 0 && state.phaseTick % 10 === 0) {
      const granted = this.grant(state, tuning.recoveryIncomePer10Ticks);
      if (resourceKeys.some((key) => granted[key] > 0)) {
        return [{ type: "RESOURCE_INCOME", tick: state.tick, payload: { resources: granted } }];
      }
    }
    return [];
  }

  spend(state: GameState, cost: Partial<Record<keyof Resources, number>>): boolean {
    if (!this.canAfford(state, cost)) {
      return false;
    }

    for (const key of resourceKeys) {
      state.resources[key] -= cost[key] ?? 0;
    }
    return true;
  }

  recomputeCaps(state: GameState, chambers: ChamberData[]): void {
    if (!this.baseCaps) {
      return;
    }

    let foodCap = this.baseCaps.food;
    const foodStoreUpgraded = [...state.nodes.values()].some((node) => node.type === "food" && node.upgradeLevel > 0);
    const foodChamber = chambers.find((chamber) => chamber.id === "food");
    const bonus = foodChamber?.upgrade?.passiveEffect;
    if (foodStoreUpgraded && bonus?.type === "food_cap_bonus") {
      foodCap += bonus.amount ?? 0;
    }

    this.caps = { ...this.baseCaps, food: foodCap };
    this.clamp(state);
  }

  grant(state: GameState, reward: Partial<Record<keyof Resources, number>>): Resources {
    const granted: Resources = { food: 0, soil: 0, resin: 0 };
    for (const key of resourceKeys) {
      const amount = reward[key] ?? 0;
      const before = state.resources[key];
      state.resources[key] = Math.min(this.caps[key], before + amount);
      granted[key] = state.resources[key] - before;
    }
    return granted;
  }

  private canAfford(state: GameState, cost: Partial<Record<keyof Resources, number>>): boolean {
    return resourceKeys.every((key) => state.resources[key] >= (cost[key] ?? 0));
  }

  private ensureCaps(tuning: TuningData): void {
    if (this.baseCaps) {
      return;
    }
    this.baseCaps = { ...tuning.resourceCaps };
    this.caps = { ...tuning.resourceCaps };
  }

  private clamp(state: GameState): void {
    for (const key of resourceKeys) {
      state.resources[key] = Math.min(this.caps[key], state.resources[key]);
    }
  }
}

const resourceKeys: Array<keyof Resources> = ["food", "soil", "resin"];
