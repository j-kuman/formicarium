import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { DefenseData } from "../types/data";
import type { GameState, Resources } from "../types/game";

interface DefenseButton {
  defense: DefenseData;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class BuildPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly tooltip: Phaser.GameObjects.Text;
  private readonly buttons: DefenseButton[];
  private currentState: Readonly<GameState> | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly commandQueue: CommandQueue,
    defenses: DefenseData[],
  ) {
    this.container = this.scene.add.container(24, 788).setDepth(1550);
    this.tooltip = this.scene.add
      .text(0, -34, "", {
        color: "#f2f2f2",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
      })
      .setVisible(false);
    this.container.add(this.tooltip);

    this.buttons = defenses
      .filter((defense) => !defense.requiresAdaptation)
      .slice(0, 3)
      .map((defense, index) => this.createDefenseButton(defense, index));
  }

  sync(state: Readonly<GameState>): void {
    this.currentState = state;
    this.container.setVisible(state.phase === "build");

    for (const button of this.buttons) {
      const enabled = this.canUseDefense(state, button.defense);
      button.background.setFillStyle(enabled ? 0x1f6f8b : 0x3a3a3a, enabled ? 0.92 : 0.62);
      button.label.setAlpha(enabled ? 1 : 0.45);
    }
  }

  private createDefenseButton(defense: DefenseData, index: number): DefenseButton {
    const container = this.scene.add.container(index * 170, 0);
    const background = this.scene.add
      .rectangle(0, 0, 150, 56, 0x1f6f8b, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xf2f2f2, 0.55)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add.text(12, 9, this.buttonLabel(defense), {
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      wordWrap: { width: 126 },
    });

    background.on("pointerdown", () => {
      if (!this.currentState || !this.canUseDefense(this.currentState, defense)) {
        return;
      }

      this.commandQueue.startPlacement(defense.id);
      this.scene.game.canvas.style.cursor = "crosshair";
    });
    background.on("pointerover", () => {
      this.tooltip.setText(`${defense.name}: ${this.costLabel(defense.cost)}`).setVisible(true);
    });
    background.on("pointerout", () => {
      this.tooltip.setVisible(false);
    });

    container.add([background, label]);
    this.container.add(container);
    return { defense, container, background, label };
  }

  private buttonLabel(defense: DefenseData): string {
    return `${defense.name}\n${this.costLabel(defense.cost)}`;
  }

  private canUseDefense(state: Readonly<GameState>, defense: DefenseData): boolean {
    const unlocked = !defense.requiresAdaptation || state.unlockedAdaptations.has(defense.requiresAdaptation);
    return unlocked && this.canAfford(state.resources, defense.cost);
  }

  private canAfford(resources: Resources, cost: Partial<Record<keyof Resources, number>>): boolean {
    return Object.entries(cost).every(([resource, amount]) => resources[resource as keyof Resources] >= (amount ?? 0));
  }

  private costLabel(cost: Partial<Record<keyof Resources, number>>): string {
    return Object.entries(cost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(", ");
  }
}
