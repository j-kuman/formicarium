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
  private overlayLayer: Phaser.GameObjects.Container | null = null;
  private breached = false;
  private victorySequenceStarted = false;
  private gameOverShown = false;

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

    if (!this.gameOverShown && events.some((e) => e.type === "GAME_OVER")) {
      this.gameOverShown = true;
      this.showGameOverScreen();
    }

    if (!this.victorySequenceStarted && events.some((e) => e.type === "VICTORY")) {
      this.startVictorySequence();
    }
  }

  private expandForBreach(): void {
    this.game.scale.resize(1200, 1100);
    const gameScene = this.scene.get("GameScene") as Phaser.Scene;
    gameScene.cameras.main.setBounds(0, 0, 1200, 1100);
    this.hud?.expandForBreach();
    this.buildPanel?.expandForBreach();
  }

  private startVictorySequence(): void {
    this.victorySequenceStarted = true;
    this.breached = true;
    this.expandForBreach();
    this.clearEndScreen();

    const gameScene = this.scene.get("GameScene") as Phaser.Scene;
    const camera = gameScene.cameras.main;
    camera.setBounds(0, 0, 1200, 1100);
    camera.pan(600, 550, 2000, "Sine.easeInOut");
    camera.zoomTo(0.82, 2000, "Sine.easeInOut");

    const layer = this.add.container(0, 0).setDepth(3200);
    const fade = this.add.rectangle(600, 550, 1200, 1100, 0x000000, 0).setOrigin(0.5);
    layer.add(fade);
    this.overlayLayer = layer;

    this.tweens.add({
      targets: fade,
      alpha: 1,
      delay: 2000,
      duration: 2000,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (this.victorySequenceStarted) {
          this.showVictoryScreen();
        }
      },
    });
  }

  private showVictoryScreen(): void {
    const layer = this.createEndScreenLayer();
    const body = `THE UNDERBREACH IS YOURS.\n\nThe Glass-Pale Centipede fell. The deep invaders have been driven back\ninto the furthest cracks and forgotten places.\n\nWorkers descend through the breach — not to repair, but to claim.\nNew chambers grow where the pale things once nested.\nThe colony breathes in two tiers now.\n\nSomething lies further still. Beyond the living soil.\nA wall of stone. The smell of grease and old metal.\nThe sound of something enormous, moving slowly.\n\n[ THE BASEMENT AWAITS — Act 3 ]`;
    layer.add(
      this.add
        .text(600, 170, body, {
          color: "#f2f2f2",
          fontFamily: "Georgia, serif",
          fontSize: "28px",
          align: "center",
          wordWrap: { width: 850 },
          lineSpacing: 8,
        })
        .setOrigin(0.5, 0),
    );
    this.addEndButton(layer, 470, 905, "[ Play Again ]", () => this.resetGame());
    this.addEndButton(layer, 730, 905, "[ Main Menu ]", () => this.resetGame());
  }

  private showGameOverScreen(): void {
    const layer = this.createEndScreenLayer();
    layer.add(
      this.add
        .text(600, 360, "THE QUEEN HAS FALLEN.", {
          color: "#f2f2f2",
          fontFamily: "Georgia, serif",
          fontSize: "34px",
          align: "center",
        })
        .setOrigin(0.5),
    );
    this.addEndButton(layer, 435, 470, "[ Try Act 2 Again ]", () => this.tryAct2Again());
    this.addEndButton(layer, 765, 470, "[ Restart from Wave 1 ]", () => this.resetGame());
  }

  private createEndScreenLayer(): Phaser.GameObjects.Container {
    this.clearEndScreen();
    const layer = this.add.container(0, 0).setDepth(3300);
    layer.add(this.add.rectangle(600, 550, 1200, 1100, 0x000000, 0.96).setOrigin(0.5));
    this.overlayLayer = layer;
    return layer;
  }

  private addEndButton(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const background = this.add
      .rectangle(x, y, 230, 48, 0x120f0d, 0.92)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xf2c94c, 0.86)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        color: "#f2c94c",
        fontFamily: "Arial, sans-serif",
        fontSize: "17px",
      })
      .setOrigin(0.5);
    background.on("pointerdown", onClick);
    text.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
    layer.add([background, text]);
  }

  private tryAct2Again(): void {
    this.commandQueue.flush();
    this.commandQueue.finishPlacement();
    this.commandQueue.push({ type: "deselect" });
    this.game.canvas.style.cursor = "default";
    this.victorySequenceStarted = false;
    this.gameOverShown = false;
    this.clearEndScreen();

    if (!window.__sim?.resetToWave10Snapshot()) {
      this.resetGame();
      return;
    }

    this.breached = true;
    this.expandForBreach();
    const gameScene = this.scene.get("GameScene") as Phaser.Scene;
    gameScene.cameras.main.setZoom(1);
    gameScene.cameras.main.setScroll(0, 0);
  }

  private resetGame(): void {
    this.commandQueue.flush();
    this.commandQueue.finishPlacement();
    this.commandQueue.push({ type: "deselect" });
    this.game.canvas.style.cursor = "default";
    this.victorySequenceStarted = false;
    this.gameOverShown = false;
    this.clearEndScreen();

    const gameScene = this.scene.get("GameScene") as Phaser.Scene;
    gameScene.cameras.main.setZoom(1);
    if (this.breached) {
      this.breached = false;
      this.game.scale.resize(1200, 900);
      gameScene.cameras.main.setBounds(0, 0, 1200, 900);
      gameScene.cameras.main.setScroll(0, 0);
      this.hud?.resetToPreBreach();
      this.buildPanel?.resetToPreBreach();
    } else {
      gameScene.cameras.main.setScroll(0, 0);
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

  private clearEndScreen(): void {
    if (!this.overlayLayer) {
      return;
    }

    this.overlayLayer.destroy(true);
    this.overlayLayer = null;
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
