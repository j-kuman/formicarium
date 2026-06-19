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
import { BuildPanel } from "../ui/BuildPanel";
import { HUD } from "../ui/HUD";
import { SelectionPanel } from "../ui/SelectionPanel";
import { WaveAlert } from "../ui/WaveAlert";

export class UIScene extends Phaser.Scene {
  public readonly commandQueue = new CommandQueue();
  private hud: HUD | null = null;
  private buildPanel: BuildPanel | null = null;
  private selectionPanel: SelectionPanel | null = null;
  private waveAlert: WaveAlert | null = null;

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
    this.buildPanel = new BuildPanel(this, this.commandQueue, this.cache.json.get("defenses") as DefenseData[]);
    this.selectionPanel = new SelectionPanel(
      this,
      this.commandQueue,
      this.cache.json.get("defenses") as DefenseData[],
      this.cache.json.get("chambers") as ChamberData[],
    );
    this.waveAlert = new WaveAlert(
      this,
      this.cache.json.get("waves") as WaveData[],
      this.cache.json.get("enemies") as EnemyData[],
    );
  }

  sync(state: Readonly<GameState>, events: SimEvent[]): void {
    this.hud?.sync(state, events);
    this.buildPanel?.sync(state);
    this.selectionPanel?.sync(state);
    this.waveAlert?.sync(state, events);
  }

  private resetGame(): void {
    this.commandQueue.flush();
    this.commandQueue.finishPlacement();
    this.game.canvas.style.cursor = "default";
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
