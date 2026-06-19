import Phaser from "phaser";

import type { MapData, TuningData } from "../types/data";
import type { SimEvent } from "../types/events";
import type { GameState, NodeState } from "../types/game";

export class EffectRenderer {
  private readonly redOverlay: Phaser.GameObjects.Rectangle;
  private readonly blackOverlay: Phaser.GameObjects.Rectangle;
  private breachSequenceActive = false;
  private victorySequenceActive = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tuning: TuningData,
    private readonly map: MapData,
  ) {
    this.redOverlay = this.scene.add
      .rectangle(0, 0, this.map.mapWidth, this.map.viewportHeight, 0xeb5757, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(900)
      .setAlpha(0);
    this.blackOverlay = this.scene.add
      .rectangle(0, 0, this.map.mapWidth, this.map.viewportHeight, 0x000000, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(950)
      .setAlpha(0);
  }

  process(events: SimEvent[], state: Readonly<GameState>): void {
    for (const event of events) {
      if (event.type === "FORESHADOW_EVENT") {
        this.scene.cameras.main.shake(this.tuning.cameraShakeDurationMs, this.tuning.cameraShakeIntensity);
        this.showNarrative(event.message ?? "Something shifts below.");
      } else if (event.type === "QUEEN_HIT") {
        this.showQueenHitOverlay();
      } else if (event.type === "NODE_CONTAMINATED" && event.nodeId) {
        this.showContaminationBurst(state, event.nodeId);
      } else if (event.type === "BREACH_TRIGGERED") {
        this.startBreachSequence();
        this.showNarrative(event.message ?? "The floor splits. Something moves below.");
      } else if (event.type === "DEEP_NODES_REVEALED") {
        this.fadeInDeepMap(state);
      } else if (event.type === "VICTORY") {
        this.startVictorySequence();
      }
    }
  }

  private showQueenHitOverlay(): void {
    this.scene.tweens.killTweensOf(this.redOverlay);
    this.redOverlay.setAlpha(0.3);
    this.scene.tweens.add({
      targets: this.redOverlay,
      alpha: 0,
      duration: 300,
      ease: "Quad.easeOut",
    });
  }

  private showContaminationBurst(state: Readonly<GameState>, nodeId: string): void {
    const node = state.nodes.get(nodeId);
    if (!node) {
      return;
    }

    for (let index = 0; index < 10; index += 1) {
      const particle = this.scene.add.circle(node.x, node.y, 3, 0x7bbf45, 0.9).setDepth(700);
      const angle = (Math.PI * 2 * index) / 10;
      const distance = 18 + (index % 3) * 8;
      this.scene.tweens.add({
        targets: particle,
        x: node.x + Math.cos(angle) * distance,
        y: node.y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 500,
        ease: "Quad.easeOut",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private startBreachSequence(): void {
    if (this.breachSequenceActive) {
      return;
    }

    this.breachSequenceActive = true;
    const camera = this.scene.cameras.main;
    const targetScrollY = Math.max(0, this.map.mapHeight - this.map.viewportHeight);

    this.scene.tweens.killTweensOf(this.blackOverlay);
    this.blackOverlay.setAlpha(0);
    this.scene.tweens.add({
      targets: this.blackOverlay,
      alpha: 1,
      duration: this.tuning.breachFlashDurationMs,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.scene.tweens.add({
          targets: camera,
          scrollY: targetScrollY,
          duration: this.tuning.breachCameraScrollDurationMs,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.scene.tweens.add({
              targets: this.blackOverlay,
              alpha: 0,
              duration: 1000,
              ease: "Quad.easeOut",
              onComplete: () => {
                this.breachSequenceActive = false;
              },
            });
          },
        });
      },
    });
  }

  private fadeInDeepMap(state: Readonly<GameState>): void {
    const deepTop = this.deepMapTop(state);
    const revealOverlay = this.scene.add
      .rectangle(0, deepTop, this.map.mapWidth, this.map.mapHeight - deepTop, 0x050403, 1)
      .setOrigin(0, 0)
      .setDepth(650);

    this.scene.tweens.add({
      targets: revealOverlay,
      alpha: 0,
      duration: 1500,
      ease: "Quad.easeOut",
      onComplete: () => revealOverlay.destroy(),
    });
  }

  private deepMapTop(state: Readonly<GameState>): number {
    const deepNodes = [...state.nodes.values()].filter((node) => this.isDeepNode(node));
    if (deepNodes.length === 0) {
      return this.map.viewportHeight;
    }

    return Math.max(0, Math.min(...deepNodes.map((node) => node.y)) - 80);
  }

  private isDeepNode(node: NodeState): boolean {
    return node.type === "deep_entrance" || node.type === "deep_junction" || node.type === "study";
  }

  private startVictorySequence(): void {
    if (this.victorySequenceActive) {
      return;
    }

    this.victorySequenceActive = true;
    this.showNarrative("The colony endures.");
  }

  private showNarrative(message: string): void {
    const centerX = this.map.mapWidth / 2;
    const panelWidth = Math.min(760, this.map.mapWidth - 80);
    const panel = this.scene.add
      .rectangle(centerX, 128, panelWidth, 72, 0x120f0d, 0.86)
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(1);
    const text = this.scene.add
      .text(centerX, 128, message, {
        color: "#f2f2f2",
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        align: "center",
        wordWrap: { width: panelWidth - 60 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setAlpha(1);

    this.scene.tweens.add({
      targets: [panel, text],
      alpha: 0,
      delay: 2200,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => {
        panel.destroy();
        text.destroy();
      },
    });
  }
}
