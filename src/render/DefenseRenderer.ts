import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { DefenseData } from "../types/data";
import type { DefenseInstance, EdgeState, GameState, NodeState } from "../types/game";
import { getEdgeMidpoint, getPointOnStateEdge } from "./edgeGeometry";

interface DefenseView {
  container: Phaser.GameObjects.Container;
  hpBar: Phaser.GameObjects.Graphics;
}

export class DefenseRenderer {
  private readonly views = new Map<string, DefenseView>();
  private readonly defenseDataById: Map<string, DefenseData>;
  private readonly slotGraphics: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    defenseData: DefenseData[],
    private readonly commandQueue: CommandQueue,
  ) {
    this.defenseDataById = new Map(defenseData.map((defense) => [defense.id, defense]));
    this.slotGraphics = this.scene.add.graphics();
  }

  update(state: Readonly<GameState>): void {
    const liveDefenseIds = new Set(state.defenses.map((defense) => defense.id));

    for (const [defenseId, view] of this.views) {
      if (!liveDefenseIds.has(defenseId)) {
        view.container.destroy(true);
        this.views.delete(defenseId);
      }
    }

    for (const defense of state.defenses) {
      const view = this.getOrCreateView(defense);
      const position = this.getDefensePosition(state, defense);

      view.container.setPosition(position.x, position.y);
      view.container.setVisible(this.isDefenseVisible(state, defense));
      this.redrawHpBar(view.hpBar, defense);
    }

    this.redrawSlotIndicators(state);
  }

  private getOrCreateView(defense: DefenseInstance): DefenseView {
    const existing = this.views.get(defense.id);
    if (existing) {
      return existing;
    }

    const container = this.scene.add.container(0, 0);
    const sprite = this.scene.add.image(0, 0, this.textureForDefense(defense.typeId));
    const hpBar = this.scene.add.graphics();

    container.add([sprite, hpBar]);

    const view = { container, hpBar };
    this.views.set(defense.id, view);
    return view;
  }

  private textureForDefense(typeId: string): string {
    const defenseData = this.defenseDataById.get(typeId);

    if (typeId === "resin_barricade" || defenseData?.tags.includes("slow")) {
      return "defense_barricade";
    }

    if (typeId === "acid_sprayer" || defenseData?.tags.includes("dot")) {
      return "defense_acid";
    }

    return "defense_guard";
  }

  private getDefensePosition(state: Readonly<GameState>, defense: DefenseInstance): Phaser.Math.Vector2 {
    if (defense.nodeId) {
      const node = state.nodes.get(defense.nodeId);
      return new Phaser.Math.Vector2(node?.x ?? 0, node?.y ?? 0);
    }

    if (defense.edgeId) {
      return getEdgeMidpoint(state, defense.edgeId);
    }

    return new Phaser.Math.Vector2(0, 0);
  }

  private isDefenseVisible(state: Readonly<GameState>, defense: DefenseInstance): boolean {
    if (defense.nodeId) {
      return Boolean(state.nodes.get(defense.nodeId)?.visible);
    }

    if (defense.edgeId) {
      return Boolean(state.edges.get(defense.edgeId)?.visible);
    }

    return false;
  }

  private redrawHpBar(graphics: Phaser.GameObjects.Graphics, defense: DefenseInstance): void {
    graphics.clear();

    if (defense.hp >= defense.maxHp) {
      return;
    }

    const width = 32;
    const height = 5;
    const x = -width / 2;
    const y = 18;
    const ratio = Phaser.Math.Clamp(defense.hp / defense.maxHp, 0, 1);

    graphics.fillStyle(0x1d1611, 0.9);
    graphics.fillRect(x, y, width, height);
    graphics.fillStyle(0x56ccf2, 1);
    graphics.fillRect(x, y, width * ratio, height);
  }

  private redrawSlotIndicators(state: Readonly<GameState>): void {
    this.slotGraphics.clear();

    if (state.phase !== "build") {
      return;
    }

    const placementDefenseTypeId = this.commandQueue.getPlacementDefenseTypeId();
    if (placementDefenseTypeId) {
      this.redrawPlacementSlots(state, placementDefenseTypeId);
      return;
    }

    if (!state.selectedId || !state.selectedKind) {
      return;
    }

    if (state.selectedKind === "node") {
      this.redrawNodeSlots(state);
    } else {
      this.redrawEdgeSlots(state);
    }
  }

  private redrawPlacementSlots(state: Readonly<GameState>, defenseTypeId: string): void {
    const defenseData = this.defenseDataById.get(defenseTypeId);
    if (!defenseData || !this.canAfford(state, defenseData)) {
      return;
    }

    if (defenseData.placement === "node") {
      for (const node of state.nodes.values()) {
        if (node.visible) {
          this.drawNodeSlots(state, node);
        }
      }
    } else {
      for (const edge of state.edges.values()) {
        if (edge.visible) {
          this.drawEdgeSlots(state, edge);
        }
      }
    }
  }

  private redrawNodeSlots(state: Readonly<GameState>): void {
    const node = state.nodes.get(state.selectedId ?? "");
    if (!node?.visible) {
      return;
    }

    this.drawNodeSlots(state, node);
  }

  private redrawEdgeSlots(state: Readonly<GameState>): void {
    const edge = state.edges.get(state.selectedId ?? "");
    if (!edge?.visible) {
      return;
    }

    this.drawEdgeSlots(state, edge);
  }

  private drawNodeSlots(state: Readonly<GameState>, node: NodeState): void {
    const occupiedSlots = state.defenses.filter((defense) => defense.nodeId === node.id).length;
    const availableSlots = Math.max(0, node.defenseSlots - occupiedSlots);

    for (let slotIndex = 0; slotIndex < availableSlots; slotIndex += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * slotIndex) / Math.max(1, availableSlots);
      const x = node.x + Math.cos(angle) * 46;
      const y = node.y + Math.sin(angle) * 46;
      this.drawSlotIndicator(x, y);
    }
  }

  private drawEdgeSlots(state: Readonly<GameState>, edge: EdgeState): void {
    const occupiedSlots = state.defenses.filter((defense) => defense.edgeId === edge.id).length;
    const availableSlots = Math.max(0, edge.defenseSlots - occupiedSlots);

    for (let slotIndex = 0; slotIndex < availableSlots; slotIndex += 1) {
      const progress = (slotIndex + 1) / (availableSlots + 1);
      const point = getPointOnStateEdge(state, edge.id, progress);
      this.drawSlotIndicator(point.x, point.y);
    }
  }

  private canAfford(state: Readonly<GameState>, defenseData: DefenseData): boolean {
    return Object.entries(defenseData.cost).every(([resource, amount]) => {
      return state.resources[resource as keyof GameState["resources"]] >= (amount ?? 0);
    });
  }

  private drawSlotIndicator(x: number, y: number): void {
    this.slotGraphics.lineStyle(2, 0xf2f2f2, 0.85);
    this.slotGraphics.fillStyle(0x2d9cdb, 0.28);
    this.slotGraphics.fillCircle(x, y, 9);
    this.slotGraphics.strokeCircle(x, y, 9);
  }
}
