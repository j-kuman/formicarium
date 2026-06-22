import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { DefenseData, UnitData } from "../types/data";
import type { GameState, Resources } from "../types/game";

interface DefenseButton {
  defense: DefenseData;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface UnitButton {
  unit: UnitData;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  countText: Phaser.GameObjects.Text;
  count: number;
}

export class BuildPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly tooltip: Phaser.GameObjects.Text;
  private readonly buttons: DefenseButton[];
  private readonly unitButtons: UnitButton[];
  private currentState: Readonly<GameState> | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly commandQueue: CommandQueue,
    defenses: DefenseData[],
    units: UnitData[],
  ) {
    this.container = this.scene.add.container(24, 716).setDepth(1550);
    this.tooltip = this.scene.add
      .text(0, -34, "", {
        color: "#f2f2f2",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
      })
      .setVisible(false);
    this.container.add(this.tooltip);

    this.buttons = defenses.map((defense, index) => this.createDefenseButton(defense, index));
    this.unitButtons = units.slice(0, 3).map((unit, index) => this.createUnitButton(unit, index));
  }

  sync(state: Readonly<GameState>): void {
    this.currentState = state;
    this.container.setVisible(state.phase === "build");

    for (const button of this.buttons) {
      const unlocked = this.defenseUnlocked(state, button.defense);
      const enabled = unlocked && this.canUseDefense(state, button.defense);
      button.container.setVisible(unlocked);
      button.background.setFillStyle(enabled ? 0x1f6f8b : 0x3a3a3a, enabled ? 0.92 : 0.62);
      button.label.setAlpha(enabled ? 1 : 0.45);
    }

    for (const button of this.unitButtons) {
      const enabled = this.canUseUnit(state, button.unit, button.count);
      button.background.setFillStyle(enabled ? 0x4a5534 : 0x3a3a3a, enabled ? 0.92 : 0.62);
      button.label.setAlpha(enabled ? 1 : 0.45);
      button.countText.setAlpha(enabled ? 1 : 0.45);
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

    background.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        return;
      }

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

  private createUnitButton(unit: UnitData, index: number): UnitButton {
    const container = this.scene.add.container(index * 170, 72);
    const background = this.scene.add
      .rectangle(0, 0, 150, 58, 0x4a5534, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xf2f2f2, 0.45)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add.text(12, 9, this.unitButtonLabel(unit, 1), {
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      wordWrap: { width: 96 },
    });
    const countText = this.scene.add
      .text(126, 29, "x1", {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const button: UnitButton = { unit, container, background, label, countText, count: 1 };

    background.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        return;
      }

      if (!this.currentState || !this.canUseUnit(this.currentState, unit, button.count)) {
        return;
      }

      this.commandQueue.startSquadPlacement(unit.id, button.count);
      this.scene.game.canvas.style.cursor = "copy";
    });
    background.on("pointerup", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
    });
    background.on("pointerover", () => {
      this.tooltip.setText(`${unit.name}: ${this.costLabel(this.scaleCost(unit.costPerUnit, button.count))}`).setVisible(true);
    });
    background.on("pointerout", () => {
      this.tooltip.setVisible(false);
    });
    countText.setInteractive({ useHandCursor: true });
    countText.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        return;
      }

      button.count = this.nextCount(button.count);
      label.setText(this.unitButtonLabel(unit, button.count));
      countText.setText(`x${button.count}`);
      if (this.currentState) {
        this.sync(this.currentState);
      }
    });

    container.add([background, label, countText]);
    this.container.add(container);
    return button;
  }

  private buttonLabel(defense: DefenseData): string {
    return `${defense.name}\n${this.costLabel(defense.cost)}`;
  }

  private canUseDefense(state: Readonly<GameState>, defense: DefenseData): boolean {
    return this.defenseUnlocked(state, defense) && this.canAfford(state.resources, defense.cost);
  }

  private defenseUnlocked(state: Readonly<GameState>, defense: DefenseData): boolean {
    return !defense.requiresAdaptation || state.unlockedAdaptations.has(defense.requiresAdaptation);
  }

  private canUseUnit(state: Readonly<GameState>, unit: UnitData, count: number): boolean {
    const unlocked = !unit.requiresBarracks || [...state.nodes.values()].some((node) => node.visible && node.type === "barracks");
    return unlocked && this.canAfford(state.resources, this.scaleCost(unit.costPerUnit, count));
  }

  private canAfford(resources: Resources, cost: Partial<Record<keyof Resources, number>>): boolean {
    return Object.entries(cost).every(([resource, amount]) => resources[resource as keyof Resources] >= (amount ?? 0));
  }

  private costLabel(cost: Partial<Record<keyof Resources, number>>): string {
    return Object.entries(cost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(", ");
  }

  private unitButtonLabel(unit: UnitData, count: number): string {
    return `${unit.name}\n${this.costLabel(this.scaleCost(unit.costPerUnit, count))}`;
  }

  private scaleCost(cost: Partial<Record<keyof Resources, number>>, count: number): Partial<Record<keyof Resources, number>> {
    const scaled: Partial<Record<keyof Resources, number>> = {};
    for (const [resource, amount] of Object.entries(cost)) {
      scaled[resource as keyof Resources] = (amount ?? 0) * count;
    }
    return scaled;
  }

  private nextCount(count: number): number {
    if (count === 1) {
      return 3;
    }
    if (count === 3) {
      return 5;
    }
    return 1;
  }
}
