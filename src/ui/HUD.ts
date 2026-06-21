import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { DefenseData, UnitData } from "../types/data";
import type { SimEvent } from "../types/events";
import type { GameState } from "../types/game";

export class HUD {
  private readonly resourcesText: Phaser.GameObjects.Text;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly queenHpText: Phaser.GameObjects.Text;
  private readonly queenHpFill: Phaser.GameObjects.Rectangle;
  private readonly buildPromptText: Phaser.GameObjects.Text;
  private readonly readyButton: Phaser.GameObjects.Container;
  private readonly muteText: Phaser.GameObjects.Text;
  private readonly cliffhangerOverlay: Phaser.GameObjects.Container;
  private muted = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly commandQueue: CommandQueue,
    defenses: DefenseData[],
    units: UnitData[],
    onReady: () => void,
    onPlayAgain: () => void,
    private readonly onMuteChange: (muted: boolean) => void,
  ) {
    const defenseNameById = new Map(defenses.map((defense) => [defense.id, defense.name]));
    const unitNameById = new Map(units.map((unit) => [unit.id, unit.name]));

    this.resourcesText = this.scene.add.text(24, 18, "", {
      color: "#f2f2f2",
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
    });
    this.phaseText = this.scene.add
      .text(1176, 18, "", {
        color: "#f2f2f2",
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        align: "right",
      })
      .setOrigin(1, 0);

    this.scene.add
      .rectangle(450, 28, QUEEN_BAR_WIDTH, QUEEN_BAR_HEIGHT, 0x1d1611, 0.92)
      .setOrigin(0, 0.5);
    this.queenHpFill = this.scene.add
      .rectangle(450, 28, QUEEN_BAR_WIDTH, QUEEN_BAR_HEIGHT, 0xeb5757, 1)
      .setOrigin(0, 0.5);
    this.queenHpText = this.scene.add
      .text(600, 28, "", {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        align: "center",
      })
      .setOrigin(0.5);

    this.buildPromptText = this.scene.add
      .text(24, 680, "", {
        color: "#f2f2f2",
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        backgroundColor: "rgba(5, 4, 3, 0.72)",
        padding: { x: 10, y: 7 },
      })
      .setDepth(1550)
      .setVisible(false);
    this.readyButton = this.createButton(1050, 828, "Ready", onReady);
    const muteToggle = this.createMuteToggle(1112, 64);
    this.muteText = muteToggle.text;
    this.cliffhangerOverlay = this.createCliffhangerOverlay(onPlayAgain);
    this.getPlacementName = () => {
      const defenseTypeId = this.commandQueue.getPlacementDefenseTypeId();
      if (defenseTypeId) {
        return defenseNameById.get(defenseTypeId) ?? defenseTypeId;
      }

      const squadRequest = this.commandQueue.getPlacementSquadRequest();
      if (squadRequest) {
        return unitNameById.get(squadRequest.unitTypeId) ?? squadRequest.unitTypeId;
      }

      return null;
    };
  }

  private readonly getPlacementName: () => string | null;

  sync(state: Readonly<GameState>, events: SimEvent[]): void {
    this.resourcesText.setText(
      `Food ${Math.floor(state.resources.food)} | Soil ${Math.floor(state.resources.soil)} | Resin ${Math.floor(
        state.resources.resin,
      )} | Squads ${state.squads.length}`,
    );
    this.phaseText.setText(`Wave ${state.wave}/14\n${state.phase.toUpperCase()}`);

    const hpRatio = state.queenMaxHp > 0 ? Phaser.Math.Clamp(state.queenHp / state.queenMaxHp, 0, 1) : 0;
    this.queenHpFill.setSize(QUEEN_BAR_WIDTH * hpRatio, QUEEN_BAR_HEIGHT);
    this.queenHpText.setText(`Queen ${Math.ceil(state.queenHp)} / ${state.queenMaxHp}`);

    if (events.some((event) => event.type === "QUEEN_HIT")) {
      this.pulseQueenHp();
    }
    this.showResourceIncome(events);

    this.readyButton.setVisible(state.phase !== "wave" && state.phase !== "ended");
    this.syncBuildPrompt(state);
    this.cliffhangerOverlay.setVisible(state.phase === "ended");
  }

  expandForBreach(): void {
    this.buildPromptText.setPosition(24, 910);
    this.readyButton.setPosition(1050, 1042);
  }

  resetToPreBreach(): void {
    this.buildPromptText.setPosition(24, 680);
    this.readyButton.setPosition(1050, 828);
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y).setDepth(1500);
    const background = this.scene.add
      .rectangle(0, 0, 132, 44, 0x2d9cdb, 0.95)
      .setStrokeStyle(2, 0xf2f2f2, 0.8)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(0, 0, label, {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "20px",
      })
      .setOrigin(0.5);

    background.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        onClick();
      }
    });
    container.add([background, text]);
    return container;
  }

  private syncBuildPrompt(state: Readonly<GameState>): void {
    if (state.phase !== "build") {
      this.buildPromptText.setVisible(false);
      return;
    }

    const placementName = this.getPlacementName();
    this.buildPromptText
      .setText(
        placementName
          ? `Click a glowing slot to place ${placementName}. Right-click / Esc to cancel.`
          : "Select a defense or unit below, then click a glowing slot.",
      )
      .setVisible(true);
  }

  private createCliffhangerOverlay(onPlayAgain: () => void): Phaser.GameObjects.Container {
    const overlay = this.scene.add.container(600, 450).setDepth(2500).setVisible(false);
    const background = this.scene.add.rectangle(0, 0, 1200, 900, 0x050403, 0.94);
    const title = this.scene.add
      .text(0, -96, "Something stirs below.\nThe colony holds its breath.", {
        color: "#f2f2f2",
        fontFamily: "Georgia, serif",
        fontSize: "34px",
        align: "center",
        lineSpacing: 10,
      })
      .setOrigin(0.5);
    const subtitle = this.scene.add
      .text(0, 24, "Cliffhanger - Act 2 coming in Segment 3", {
        color: "#bdbdbd",
        fontFamily: "Arial, sans-serif",
        fontSize: "20px",
      })
      .setOrigin(0.5);
    const playAgain = this.createButton(0, 116, "Play Again", onPlayAgain);

    overlay.add([background, title, subtitle, playAgain]);
    return overlay;
  }

  private createMuteToggle(x: number, y: number): { container: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text } {
    const container = this.scene.add.container(x, y).setDepth(1500);
    const background = this.scene.add
      .rectangle(0, 0, 112, 34, 0x1d1611, 0.94)
      .setStrokeStyle(1, 0xf2f2f2, 0.55)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(0, 0, "Sound", {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
      })
      .setOrigin(0.5);

    background.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.toggleMute();
      }
    });
    container.add([background, text]);
    return { container, text };
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.muteText.setText(this.muted ? "Muted" : "Sound");
    this.onMuteChange(this.muted);
  }

  private pulseQueenHp(): void {
    this.scene.tweens.killTweensOf(this.queenHpFill);
    this.queenHpFill.setAlpha(1);
    this.scene.tweens.add({
      targets: this.queenHpFill,
      alpha: 0.35,
      duration: 110,
      yoyo: true,
      repeat: 2,
      ease: "Quad.easeOut",
      onComplete: () => this.queenHpFill.setAlpha(1),
    });
  }

  private showResourceIncome(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type !== "RESOURCE_INCOME") {
        continue;
      }

      const resources = event.payload?.resources;
      if (!resources || typeof resources !== "object") {
        continue;
      }

      this.spawnIncomeText("food", Number((resources as Record<string, unknown>).food ?? 0), 76, 46);
      this.spawnIncomeText("soil", Number((resources as Record<string, unknown>).soil ?? 0), 174, 46);
      this.spawnIncomeText("resin", Number((resources as Record<string, unknown>).resin ?? 0), 278, 46);
    }
  }

  private spawnIncomeText(_resource: keyof GameState["resources"], amount: number, x: number, y: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const text = this.scene.add
      .text(x, y, `+${Math.floor(amount)}`, {
        color: "#a6f0a6",
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(1600);

    this.scene.tweens.add({
      targets: text,
      y: y - 28,
      alpha: 0,
      duration: 850,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy(),
    });
  }
}

const QUEEN_BAR_WIDTH = 300;
const QUEEN_BAR_HEIGHT = 18;
