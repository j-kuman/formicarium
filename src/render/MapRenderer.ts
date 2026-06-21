import Phaser from "phaser";

import type { CommandQueue } from "../input/CommandQueue";
import type { DefenseData } from "../types/data";
import type { GameState, NodeState } from "../types/game";
import { getEdgeMidpoint, getPointOnEdge } from "./edgeGeometry";

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
  private readonly crackGraphics: Phaser.GameObjects.Graphics;
  private readonly defenseDataById: Map<string, DefenseData>;
  private readonly nodeViews = new Map<string, NodeView>();
  private readonly edgeHitZones = new Map<string, Phaser.GameObjects.Zone>();
  private currentState: Readonly<GameState> | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly commandQueue: CommandQueue,
    defenseData: DefenseData[],
  ) {
    this.defenseDataById = new Map(defenseData.map((defense) => [defense.id, defense]));
    this.edgeGraphics = this.scene.add.graphics();
    this.crackGraphics = this.scene.add.graphics();
  }

  init(state: Readonly<GameState>): void {
    for (const edge of state.edges.values()) {
      const zone = this.scene.add.zone(0, 0, 96, 44).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.leftButtonDown()) {
          return;
        }

        this.handleEdgeClick(edge.id);
      });
      this.edgeHitZones.set(edge.id, zone);
    }

    for (const node of state.nodes.values()) {
      const container = this.scene.add.container(node.x, node.y);
      const sprite = this.scene.add.image(0, 0, NODE_TEXTURES[node.type]);
      const hpBar = this.scene.add.graphics();
      const selection = this.scene.add.graphics();

      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.leftButtonDown()) {
          return;
        }

        this.handleNodeClick(node.id);
      });

      container.add([selection, sprite, hpBar]);
      this.nodeViews.set(node.id, { container, sprite, hpBar, selection });
    }

    this.update(state);
  }

  update(state: Readonly<GameState>): void {
    this.currentState = state;
    this.redrawEdges(state);
    this.redrawCrack(state);
    this.updateEdgeHitZones(state);

    for (const node of state.nodes.values()) {
      const view = this.nodeViews.get(node.id);
      if (!view) {
        continue;
      }

      this.applyNodeState(view, node, state);
    }
  }

  private applyNodeState(view: NodeView, node: NodeState, state: Readonly<GameState>): void {
    view.container.setPosition(node.x, node.y);
    view.container.setAlpha(node.visible ? 1 : 0);
    view.container.setVisible(node.visible);
    view.sprite.setTint(node.contaminated ? 0x8ee05f : 0xffffff);
    this.redrawHpBar(view.hpBar, node);
    this.redrawSelection(view.selection, node, state);
  }

  private handleNodeClick(nodeId: string): void {
    if (this.tryPlaceDefense("node", nodeId)) {
      return;
    }

    if (this.tryPlaceSquad("node", nodeId)) {
      return;
    }

    this.commandQueue.push({ type: "select_node", nodeId });
  }

  private handleEdgeClick(edgeId: string): void {
    if (this.tryPlaceDefense("edge", edgeId)) {
      return;
    }

    if (this.tryPlaceSquad("edge", edgeId)) {
      return;
    }

    this.commandQueue.push({ type: "select_edge", edgeId });
  }

  private tryPlaceDefense(kind: "node" | "edge", id: string): boolean {
    const defenseTypeId = this.commandQueue.getPlacementDefenseTypeId();
    const state = this.currentState;
    if (!defenseTypeId || !state) {
      return false;
    }

    const defenseData = this.defenseDataById.get(defenseTypeId);
    if (!defenseData || defenseData.placement !== kind || !this.hasAvailableSlot(state, kind, id)) {
      return true;
    }

    if (kind === "node") {
      this.commandQueue.push({ type: "place_defense", defenseTypeId, nodeId: id });
    } else {
      this.commandQueue.push({ type: "place_defense", defenseTypeId, edgeId: id });
    }

    this.commandQueue.finishPlacement();
    this.scene.game.canvas.style.cursor = "default";
    return true;
  }

  private tryPlaceSquad(kind: "node" | "edge", id: string): boolean {
    const request = this.commandQueue.getPlacementSquadRequest();
    const state = this.currentState;
    if (!request || !state) {
      return false;
    }

    if (!this.hasAvailableSquadLocation(state, kind, id)) {
      return true;
    }

    if (kind === "node") {
      this.commandQueue.push({ type: "spawn_squad", unitTypeId: request.unitTypeId, count: request.count, nodeId: id });
    } else {
      this.commandQueue.push({ type: "spawn_squad", unitTypeId: request.unitTypeId, count: request.count, edgeId: id });
    }

    this.commandQueue.finishPlacement();
    this.scene.game.canvas.style.cursor = "default";
    return true;
  }

  private hasAvailableSlot(state: Readonly<GameState>, kind: "node" | "edge", id: string): boolean {
    if (kind === "node") {
      const node = state.nodes.get(id);
      const occupiedSlots = state.defenses.filter((defense) => defense.nodeId === id).length;
      return Boolean(node?.visible && occupiedSlots < node.defenseSlots);
    }

    const edge = state.edges.get(id);
    const occupiedSlots = state.defenses.filter((defense) => defense.edgeId === id).length;
    return Boolean(edge?.visible && occupiedSlots < edge.defenseSlots);
  }

  private hasAvailableSquadLocation(state: Readonly<GameState>, kind: "node" | "edge", id: string): boolean {
    if (kind === "node") {
      const node = state.nodes.get(id);
      return Boolean(node?.visible && node.squadSlot);
    }

    return Boolean(state.edges.get(id)?.visible);
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
      const hasBarricade = state.defenses.some((d) => d.edgeId === edge.id && d.typeId === "resin_barricade");
      const color = edge.contaminated ? 0x7bbf45 : hasBarricade ? 0xc0392b : 0x6b4a2b;
      this.edgeGraphics.lineStyle(lineWidth, color, 0.82);
      this.edgeGraphics.beginPath();
      this.edgeGraphics.moveTo(nodeA.x, nodeA.y);
      for (let step = 1; step <= EDGE_CURVE_SEGMENTS; step += 1) {
        const point = getPointOnEdge(edge, nodeA, nodeB, step / EDGE_CURVE_SEGMENTS);
        this.edgeGraphics.lineTo(point.x, point.y);
      }
      this.edgeGraphics.strokePath();
    }
  }

  private redrawCrack(state: Readonly<GameState>): void {
    this.crackGraphics.clear();

    const hasCrackForeshadow = state.foreshadowEvents.some((event) => event.wave === 9 && event.type === "crack");
    if (!hasCrackForeshadow || state.breachTriggered) {
      return;
    }

    const queen = state.nodes.get("queen_chamber");
    if (!queen?.visible) {
      return;
    }

    const y = queen.y + 42;
    this.crackGraphics.lineStyle(3, 0x120f0d, 0.92);
    this.crackGraphics.beginPath();
    this.crackGraphics.moveTo(queen.x - 42, y);
    this.crackGraphics.lineTo(queen.x - 18, y + 8);
    this.crackGraphics.lineTo(queen.x + 2, y + 2);
    this.crackGraphics.lineTo(queen.x + 22, y + 13);
    this.crackGraphics.lineTo(queen.x + 44, y + 8);
    this.crackGraphics.strokePath();

    this.crackGraphics.lineStyle(1, 0x120f0d, 0.82);
    this.crackGraphics.beginPath();
    this.crackGraphics.moveTo(queen.x - 10, y + 5);
    this.crackGraphics.lineTo(queen.x - 18, y + 18);
    this.crackGraphics.moveTo(queen.x + 16, y + 9);
    this.crackGraphics.lineTo(queen.x + 12, y + 23);
    this.crackGraphics.strokePath();
  }

  private updateEdgeHitZones(state: Readonly<GameState>): void {
    for (const edge of state.edges.values()) {
      const zone = this.edgeHitZones.get(edge.id);
      if (!zone) {
        continue;
      }

      const midpoint = getEdgeMidpoint(state, edge.id);
      zone.setPosition(midpoint.x, midpoint.y);
      zone.setActive(edge.visible);
      zone.setVisible(edge.visible);
      if (zone.input) {
        zone.input.enabled = edge.visible;
      }
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

const EDGE_CURVE_SEGMENTS = 16;
