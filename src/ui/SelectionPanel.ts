import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { ChamberData, DefenseData } from "../types/data";
import type { DefenseInstance, GameState, Resources } from "../types/game";

export class SelectionPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly defenseDataById: Map<string, DefenseData>;
  private readonly chamberDataById: Map<string, ChamberData>;
  private lastRenderKey: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly commandQueue: CommandQueue,
    defenses: DefenseData[],
    chambers: ChamberData[],
  ) {
    this.defenseDataById = new Map(defenses.map((defense) => [defense.id, defense]));
    this.chamberDataById = new Map(chambers.map((chamber) => [chamber.id, chamber]));
    this.container = this.scene.add.container(872, 92).setDepth(1600).setVisible(false);
  }

  sync(state: Readonly<GameState>): void {
    if (!state.selectedId || !state.selectedKind) {
      this.container.setVisible(false);
      this.lastRenderKey = null;
      return;
    }

    const renderKey = this.renderKey(state);
    this.container.setVisible(true);
    if (renderKey === this.lastRenderKey) {
      return;
    }

    this.lastRenderKey = renderKey;
    this.container.removeAll(true);
    this.addPanelBackground();

    if (state.selectedKind === "node") {
      this.renderNodeSelection(state);
    } else {
      this.renderEdgeSelection(state);
    }
  }

  private renderKey(state: Readonly<GameState>): string {
    const selectedDefenses = state.defenses
      .filter((defense) => defense.nodeId === state.selectedId || defense.edgeId === state.selectedId)
      .map((defense) => `${defense.id}:${defense.typeId}:${defense.upgradeLevel}:${defense.hp}:${defense.maxHp}`)
      .join("|");
    const selectedNode = state.selectedKind === "node" ? state.nodes.get(state.selectedId ?? "") : null;
    const selectedEdge = state.selectedKind === "edge" ? state.edges.get(state.selectedId ?? "") : null;

    return [
      state.selectedKind,
      state.selectedId,
      selectedNode ? `${selectedNode.hp}:${selectedNode.maxHp}:${selectedNode.upgradeLevel}` : "",
      selectedEdge ? `${selectedEdge.hp}:${selectedEdge.maxHp}` : "",
      selectedDefenses,
      state.resources.food,
      state.resources.soil,
      state.resources.resin,
    ].join(";");
  }

  private renderNodeSelection(state: Readonly<GameState>): void {
    const node = state.nodes.get(state.selectedId ?? "");
    if (!node) {
      return;
    }

    const chamber = this.chamberDataById.get(node.type);
    this.addText(18, 16, chamber?.name ?? node.id, 20, "#ffffff");
    this.addText(18, 50, `HP ${Math.ceil(node.hp)} / ${node.maxHp}`, 15);
    this.addText(18, 74, `Defense slots ${this.occupiedNodeSlots(state, node.id)} / ${node.defenseSlots}`, 15);

    let rowY = 112;
    if (chamber?.upgrade && node.upgradeLevel === 0 && this.canAfford(state.resources, chamber.upgrade.cost)) {
      this.addButton(18, rowY, "Upgrade chamber", () => {
        this.commandQueue.push({ type: "upgrade_chamber", nodeId: node.id });
      });
      rowY += 44;
    }

    this.renderDefenseRows(
      state.defenses.filter((defense) => defense.nodeId === node.id),
      state,
      rowY,
    );
  }

  private renderEdgeSelection(state: Readonly<GameState>): void {
    const edge = state.edges.get(state.selectedId ?? "");
    if (!edge) {
      return;
    }

    this.addText(18, 16, edge.id, 20, "#ffffff");
    this.addText(18, 50, `HP ${Math.ceil(edge.hp)} / ${edge.maxHp}`, 15);
    this.addText(18, 74, `Defense slots ${this.occupiedEdgeSlots(state, edge.id)} / ${edge.defenseSlots}`, 15);
    this.renderDefenseRows(
      state.defenses.filter((defense) => defense.edgeId === edge.id),
      state,
      112,
    );
  }

  private renderDefenseRows(defenses: DefenseInstance[], state: Readonly<GameState>, startY: number): void {
    if (defenses.length === 0) {
      this.addText(18, startY, "No defenses placed", 14, "#bdbdbd");
      return;
    }

    defenses.forEach((defense, index) => {
      const rowY = startY + index * 48;
      const defenseData = this.defenseDataById.get(defense.typeId);
      this.addText(18, rowY, `${defenseData?.name ?? defense.typeId} L${defense.upgradeLevel + 1}`, 14);
      this.addText(18, rowY + 20, `HP ${Math.ceil(defense.hp)} / ${defense.maxHp}`, 12, "#bdbdbd");

      if (defenseData?.upgrade && defense.upgradeLevel === 0 && this.canAfford(state.resources, defenseData.upgrade.cost)) {
        this.addButton(186, rowY + 4, "Upgrade", () => {
          this.commandQueue.push({ type: "upgrade_defense", defenseInstanceId: defense.id });
        });
      }
    });
  }

  private addPanelBackground(): void {
    const background = this.scene.add
      .rectangle(0, 0, 304, 330, 0x120f0d, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x4f4a45, 0.9);
    this.container.add(background);
  }

  private addText(x: number, y: number, text: string, fontSize: number, color = "#f2f2f2"): void {
    this.container.add(
      this.scene.add.text(x, y, text, {
        color,
        fontFamily: "Arial, sans-serif",
        fontSize: `${fontSize}px`,
        wordWrap: { width: 262 },
      }),
    );
  }

  private addButton(x: number, y: number, label: string, onClick: () => void): void {
    const button = this.scene.add.container(x, y);
    const background = this.scene.add
      .rectangle(0, 0, 96, 28, 0x2d9cdb, 0.95)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(48, 14, label, {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
      })
      .setOrigin(0.5);

    background.on("pointerdown", onClick);
    button.add([background, text]);
    this.container.add(button);
  }

  private occupiedNodeSlots(state: Readonly<GameState>, nodeId: string): number {
    return state.defenses.filter((defense) => defense.nodeId === nodeId).length;
  }

  private occupiedEdgeSlots(state: Readonly<GameState>, edgeId: string): number {
    return state.defenses.filter((defense) => defense.edgeId === edgeId).length;
  }

  private canAfford(resources: Resources, cost: Partial<Record<keyof Resources, number>>): boolean {
    return Object.entries(cost).every(([resource, amount]) => resources[resource as keyof Resources] >= (amount ?? 0));
  }
}
