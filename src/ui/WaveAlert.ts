import Phaser from "phaser";

import type { EnemyData, WaveData } from "../types/data";
import type { SimEvent } from "../types/events";
import type { GameState } from "../types/game";

export class WaveAlert {
  private readonly panel: Phaser.GameObjects.Container;
  private readonly popupLayer: Phaser.GameObjects.Container;
  private readonly enemyDataById: Map<string, EnemyData>;
  private lastScoutWave: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly waves: WaveData[],
    enemies: EnemyData[],
  ) {
    this.enemyDataById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
    this.panel = this.scene.add.container(410, 68).setDepth(1450).setVisible(false);
    this.popupLayer = this.scene.add.container(0, 0).setDepth(2600);
  }

  sync(state: Readonly<GameState>, events: SimEvent[]): void {
    if (state.phase === "scout") {
      if (this.lastScoutWave !== state.wave) {
        this.lastScoutWave = state.wave;
        this.renderScoutPanel(state.wave);
      }
      this.panel.setVisible(true);
    } else {
      this.panel.setVisible(false);
      this.lastScoutWave = null;
    }

    for (const event of events) {
      if (event.type === "FORESHADOW_EVENT") {
        this.showPopup(event.message ?? "Something shifts below.", false);
      } else if (event.type === "BREACH_TRIGGERED") {
        this.showPopup(
          "The floor splits. Something moves below.\n\nThe colony has never been attacked from below. Old defenses will not hold.",
          true,
        );
      }
    }
  }

  private renderScoutPanel(waveNumber: number): void {
    this.panel.removeAll(true);

    const wave = this.waves.find((entry) => entry.wave === waveNumber);
    if (!wave) {
      return;
    }

    const background = this.scene.add
      .rectangle(0, 0, 380, 118, 0x120f0d, 0.88)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x4f4a45, 0.9);
    const title = this.scene.add.text(16, 12, `Incoming Wave ${wave.wave}`, {
      color: "#f2f2f2",
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
    });

    this.panel.add([background, title]);
    this.renderComposition(wave);

    if (this.targetsQueen(wave)) {
      this.panel.add(
        this.scene.add.text(236, 14, "QUEEN TARGETED", {
          color: "#ffcf6e",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
        }),
      );
    }

    if (wave.foreshadowMessage) {
      this.panel.add(
        this.scene.add.text(16, 82, wave.foreshadowMessage, {
          color: "#bdbdbd",
          fontFamily: "Arial, sans-serif",
          fontSize: "13px",
          wordWrap: { width: 340 },
        }),
      );
    }
  }

  private renderComposition(wave: WaveData): void {
    const counts = new Map<string, number>();
    for (const spawn of wave.spawns) {
      counts.set(spawn.enemy, (counts.get(spawn.enemy) ?? 0) + spawn.count);
    }

    let x = 18;
    for (const [enemyTypeId, count] of counts) {
      const enemy = this.enemyDataById.get(enemyTypeId);
      const icon = this.scene.add.image(x, 58, this.textureForEnemy(enemy)).setScale(0.85);
      const label = this.scene.add.text(x + 18, 48, `x${count}`, {
        color: "#f2f2f2",
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
      });

      this.panel.add([icon, label]);
      x += 70;
    }
  }

  private targetsQueen(wave: WaveData): boolean {
    return wave.spawns.some((spawn) => {
      const enemy = this.enemyDataById.get(spawn.enemy);
      return enemy?.tags.includes("priority_queen") || enemy?.targetPriority[0] === "queen";
    });
  }

  private textureForEnemy(enemyData: EnemyData | undefined): string {
    if (enemyData?.tags.includes("boss")) {
      return "enemy_boss";
    }

    if (enemyData?.tags.includes("deep")) {
      return "enemy_deep";
    }

    return "enemy_surface";
  }

  private showPopup(message: string, fullScreen: boolean): void {
    this.popupLayer.removeAll(true);

    const width = fullScreen ? 1200 : 720;
    const height = fullScreen ? 900 : 210;
    const centerX = 600;
    const centerY = fullScreen ? 450 : 250;
    const background = this.scene.add
      .rectangle(centerX, centerY, width, height, 0x050403, fullScreen ? 0.94 : 0.92)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(centerX, centerY - 16, message, {
        color: "#f2f2f2",
        fontFamily: "Georgia, serif",
        fontSize: fullScreen ? "30px" : "24px",
        align: "center",
        wordWrap: { width: fullScreen ? 760 : 620 },
        lineSpacing: 8,
      })
      .setOrigin(0.5);
    const dismiss = this.scene.add
      .text(centerX, centerY + (fullScreen ? 170 : 74), "Dismiss", {
        color: "#ffcf6e",
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
      })
      .setOrigin(0.5);

    background.on("pointerdown", () => this.popupLayer.removeAll(true));
    dismiss.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.popupLayer.removeAll(true));
    this.popupLayer.add([background, text, dismiss]);
  }
}
