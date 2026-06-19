import Phaser from "phaser";

import { CommandQueue } from "../input/CommandQueue";
import { GameSim } from "../sim/GameSim";
import type {
  ChamberData,
  DefenseData,
  EnemyData,
  MapData,
  TuningData,
  UnitData,
  WaveData,
} from "../types/data";
import type { SimEvent } from "../types/events";
import type { GameState } from "../types/game";
import { HUD } from "../ui/HUD";

export class UIScene extends Phaser.Scene {
  public readonly commandQueue = new CommandQueue();
  private hud: HUD | null = null;

  constructor() {
    super("UIScene");
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    this.hud = new HUD(
      this,
      () => this.commandQueue.push({ type: "advance_phase" }),
      () => this.resetGame(),
    );
  }

  sync(state: Readonly<GameState>, events: SimEvent[]): void {
    this.hud?.sync(state, events);
  }

  private resetGame(): void {
    this.commandQueue.flush();
    window.__sim = new GameSim({
      tuning: this.cache.json.get("tuning") as TuningData,
      map: this.cache.json.get("map") as MapData,
      waves: this.cache.json.get("waves") as WaveData[],
      enemies: this.cache.json.get("enemies") as EnemyData[],
      defenses: this.cache.json.get("defenses") as DefenseData[],
      chambers: this.cache.json.get("chambers") as ChamberData[],
      units: this.cache.json.get("units") as UnitData[],
    });
  }
}
