import Phaser from "phaser";

import { SoundManager } from "../audio/SoundManager";
import { CommandQueue } from "../input/CommandQueue";
import { GameSim } from "../sim/GameSim";
import type {
  AdaptationData,
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
  private soundManager: SoundManager | null = null;
  private breached = false;

  constructor() {
    super("UIScene");
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    this.hud = new HUD(
      this,
      this.commandQueue,
      this.cache.json.get("defenses") as DefenseData[],
      this.cache.json.get("units") as UnitData[],
      () => this.commandQueue.push({ type: "advance_phase" }),
      () => this.resetGame(),
      (muted) => this.soundManager?.setMuted(muted),
    );
    this.buildPanel = new BuildPanel(
      this,
      this.commandQueue,
      this.cache.json.get("defenses") as DefenseData[],
      this.cache.json.get("units") as UnitData[],
    );
    this.selectionPanel = new SelectionPanel(
      this,
      this.commandQueue,
      this.cache.json.get("defenses") as DefenseData[],
      this.cache.json.get("chambers") as ChamberData[],
      this.cache.json.get("units") as UnitData[],
      this.cache.json.get("adaptations") as AdaptationData[],
    );
    this.waveAlert = new WaveAlert(
      this,
      this.cache.json.get("waves") as WaveData[],
      this.cache.json.get("enemies") as EnemyData[],
    );
    this.soundManager = new SoundManager(this.sound);
    this.registerPlacementCancelInput();
  }

  sync(state: Readonly<GameState>, events: SimEvent[]): void {
    this.soundManager?.process(events);
    this.hud?.sync(state, events);
    this.buildPanel?.sync(state);
    this.selectionPanel?.sync(state);
    this.waveAlert?.sync(state, events);

    if (!this.breached && events.some((e) => e.type === "BREACH_TRIGGERED")) {
      this.breached = true;
      this.expandForBreach();
    }
  }

  private expandForBreach(): void {
    this.game.scale.resize(1200, 1100);
    const gameScene = this.scene.get("GameScene") as Phaser.Scene;
    gameScene.cameras.main.setBounds(0, 0, 1200, 1100);
    this.hud?.expandForBreach();
    this.buildPanel?.expandForBreach();
  }

  private resetGame(): void {
    this.commandQueue.flush();
    this.commandQueue.finishPlacement();
    this.game.canvas.style.cursor = "default";
    if (this.breached) {
      this.breached = false;
      this.game.scale.resize(1200, 900);
      const gameScene = this.scene.get("GameScene") as Phaser.Scene;
      gameScene.cameras.main.setBounds(0, 0, 1200, 900);
      gameScene.cameras.main.setScroll(0, 0);
      this.hud?.resetToPreBreach();
      this.buildPanel?.resetToPreBreach();
    } else {
      (this.scene.get("GameScene") as Phaser.Scene).cameras.main.setScroll(0, 0);
    }
    window.__sim = new GameSim({
      tuning: this.cache.json.get("tuning") as TuningData,
      map: this.cache.json.get("map") as MapData,
      waves: this.cache.json.get("waves") as WaveData[],
      enemies: this.cache.json.get("enemies") as EnemyData[],
      defenses: this.cache.json.get("defenses") as DefenseData[],
      chambers: this.cache.json.get("chambers") as ChamberData[],
      units: this.cache.json.get("units") as UnitData[],
      adaptations: this.cache.json.get("adaptations") as AdaptationData[],
    });
  }

  private registerPlacementCancelInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.cancelPlacement();
      }
    });
    this.input.keyboard?.on("keydown-ESC", () => this.cancelPlacement());
  }

  private cancelPlacement(): void {
    this.commandQueue.finishPlacement();
    this.commandQueue.push({ type: "deselect" });
    this.game.canvas.style.cursor = "default";
  }
}
