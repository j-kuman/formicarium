import Phaser from "phaser";

import type { AdaptationData } from "../types/data";
import type { GameState } from "../types/game";

export class AdaptationPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly adaptations: AdaptationData[],
  ) {}

  render(container: Phaser.GameObjects.Container, state: Readonly<GameState>, startY: number): void {
    container.add(
      this.scene.add.text(18, startY, "Adaptations", {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
      }),
    );

    if (this.adaptations.length === 0) {
      container.add(
        this.scene.add.text(18, startY + 28, "No adaptations discovered", {
          color: "#bdbdbd",
          fontFamily: "Arial, sans-serif",
          fontSize: "13px",
        }),
      );
      return;
    }

    this.adaptations.forEach((adaptation, index) => {
      this.renderAdaptation(container, state, adaptation, startY + 32 + index * 58);
    });
  }

  private renderAdaptation(
    container: Phaser.GameObjects.Container,
    state: Readonly<GameState>,
    adaptation: AdaptationData,
    y: number,
  ): void {
    const unlocked = state.unlockedAdaptations.has(adaptation.id);
    container.add(
      this.scene.add.text(18, y, `${adaptation.name}${unlocked ? " — unlocked" : ""}`, {
        color: unlocked ? "#6fcf97" : "#f2f2f2",
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        wordWrap: { width: 262 },
      }),
    );

    const requirements = Object.entries(adaptation.requires);
    requirements.forEach(([sampleId, required], index) => {
      const count = state.samples.get(sampleId) ?? 0;
      const ratio = Phaser.Math.Clamp(count / required, 0, 1);
      const rowY = y + 22 + index * 18;
      container.add(
        this.scene.add.text(18, rowY, `${this.sampleLabel(sampleId)}: ${count}/${required}`, {
          color: "#bdbdbd",
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
        }),
      );

      container.add(this.scene.add.rectangle(150, rowY + 7, 96, 6, 0x2b2520, 0.95).setOrigin(0, 0.5));
      container.add(this.scene.add.rectangle(150, rowY + 7, 96 * ratio, 6, unlocked ? 0x6fcf97 : 0xf2c94c, 0.95).setOrigin(0, 0.5));
    });
  }

  private sampleLabel(sampleId: string): string {
    return sampleId
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}
