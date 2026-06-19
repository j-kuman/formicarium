import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { GameState, NodeState } from "../types/game";

interface NodeView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  selection: Phaser.GameObjects.Graphics;
}

const NODE_TEXTURES: Record<NodeState["type"], string> = {
  queen: "node_queen",
  brood: "node_brood",
  food: "node_food",
  barracks: "node_barracks",
  junction: "node_junction",
  entrance: "node_entrance",
  study: "node_deep",
  deep_junction: "node_deep",
  deep_entrance: "node_deep",
};

export class MapRenderer {
  private readonly edgeGraphics: Phaser.GameObjects.Graphics;
  private readonly nodeViews = new Map<string, NodeView>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly commandQueue: CommandQueue,
  ) {
    this.edgeGraphics = this.scene.add.graphics();
  }

  init(state: Readonly<GameState>): void {
    for (const node of state.nodes.values()) {
      const container = this.scene.add.container(node.x, node.y);
      const sprite = this.scene.add.image(0, 0, NODE_TEXTURES[node.type]);
      const hpBar = this.scene.add.graphics();
      const selection = this.scene.add.graphics();

      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => {
        this.commandQueue.push({ type: "select_node", nodeId: node.id });
      });

      container.add([selection, sprite, hpBar]);
      this.nodeViews.set(node.id, { container, sprite, hpBar, selection });
    }

    this.update(state);
  }

  update(state: Readonly<GameState>): void {
    this.redrawEdges(state);

    for (const node of state.nodes.values()) {
      const view = this.nodeViews.get(node.id);
      if (!view) {
        continue;
      }

      view.container.setPosition(node.x, node.y);
      view.container.setAlpha(node.visible ? 1 : 0);
      view.container.setVisible(node.visible);
      view.sprite.setTint(node.contaminated ? 0x8ee05f : 0xffffff);
      this.redrawHpBar(view.hpBar, node);
      this.redrawSelection(view.selection, node, state);
    }
  }

  private redrawEdges(state: Readonly<GameState>): void {
    this.edgeGraphics.clear();

    for (const edge of state.edges.values()) {
      const nodeA = state.nodes.get(edge.nodeA);
      const nodeB = state.nodes.get(edge.nodeB);
      if (!nodeA || !nodeB || !edge.visible) {
        continue;
      }

      const lineWidth = edge.width === "large" ? 18 : 10;
      const color = edge.contaminated ? 0x7bbf45 : 0x6b4a2b;
      this.edgeGraphics.lineStyle(lineWidth, color, 0.82);
      this.edgeGraphics.beginPath();
      this.edgeGraphics.moveTo(nodeA.x, nodeA.y);
      this.edgeGraphics.lineTo(nodeB.x, nodeB.y);
      this.edgeGraphics.strokePath();
    }
  }

  private redrawHpBar(graphics: Phaser.GameObjects.Graphics, node: NodeState): void {
    graphics.clear();

    if (!node.visible || node.maxHp >= 9000 || node.hp >= node.maxHp) {
      return;
    }

    const width = 52;
    const height = 6;
    const x = -width / 2;
    const y = 34;
    const ratio = Phaser.Math.Clamp(node.hp / node.maxHp, 0, 1);

    graphics.fillStyle(0x1d1611, 0.9);
    graphics.fillRect(x, y, width, height);
    graphics.fillStyle(0x6fcf97, 1);
    graphics.fillRect(x, y, width * ratio, height);
  }

  private redrawSelection(
    graphics: Phaser.GameObjects.Graphics,
    node: NodeState,
    state: Readonly<GameState>,
  ): void {
    graphics.clear();

    if (!node.visible || state.selectedKind !== "node" || state.selectedId !== node.id) {
      return;
    }

    graphics.lineStyle(3, 0xf2f2f2, 0.9);
    graphics.strokeCircle(0, 0, this.selectionRadius(node.type));
  }

  private selectionRadius(type: NodeState["type"]): number {
    if (type === "queen") {
      return 46;
    }

    if (type === "entrance") {
      return 26;
    }

    return 40;
  }
}
