import Phaser from "phaser";

import type { UnitData } from "../types/data";
import type { GameState, SquadInstance, SquadStance } from "../types/game";
import { getEdgeMidpoint } from "./edgeGeometry";

interface SquadView {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  pulsing: boolean;
}

const STANCE_FRAME_TEXTURES: Record<SquadStance, string> = {
  hold: "squad_frame_hold",
  intercept: "squad_frame_intercept",
  retreat: "squad_frame_retreat",
  repair: "squad_frame_repair",
  patrol: "squad_frame_patrol",
};

export class SquadRenderer {
  private readonly views = new Map<string, SquadView>();
  private readonly unitDataById: Map<string, UnitData>;

  constructor(
    private readonly scene: Phaser.Scene,
    unitData: UnitData[],
  ) {
    this.unitDataById = new Map(unitData.map((unit) => [unit.id, unit]));
  }

  update(state: Readonly<GameState>): void {
    const liveSquadIds = new Set(state.squads.map((squad) => squad.id));

    for (const [squadId, view] of this.views) {
      if (!liveSquadIds.has(squadId)) {
        view.container.destroy(true);
        this.views.delete(squadId);
      }
    }

    for (const squad of state.squads) {
      const view = this.getOrCreateView(squad);
      const position = this.getSquadPosition(state, squad);

      view.container.setPosition(position.x, position.y);
      view.container.setVisible(this.isSquadVisible(state, squad));
      view.frame.setTexture(STANCE_FRAME_TEXTURES[squad.stance]);
      view.icon.setTexture(this.textureForUnit(squad.typeId));
      view.count.setText(String(squad.count));
      this.syncPulse(view, squad.inCombat === true);
    }
  }

  private getOrCreateView(squad: SquadInstance): SquadView {
    const existing = this.views.get(squad.id);
    if (existing) {
      return existing;
    }

    const container = this.scene.add.container(0, 0).setDepth(540);
    const frame = this.scene.add.image(0, 0, STANCE_FRAME_TEXTURES[squad.stance]);
    const icon = this.scene.add.image(0, -2, this.textureForUnit(squad.typeId));
    const count = this.scene.add
      .text(15, 14, String(squad.count), {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    container.add([frame, icon, count]);
    const view = { container, frame, icon, count, pulsing: false };
    this.views.set(squad.id, view);
    return view;
  }

  private getSquadPosition(state: Readonly<GameState>, squad: SquadInstance): Phaser.Math.Vector2 {
    if (squad.assignedNodeId) {
      const node = state.nodes.get(squad.assignedNodeId);
      return new Phaser.Math.Vector2(node?.x ?? 0, node?.y ?? 0);
    }

    if (squad.assignedEdgeId) {
      return getEdgeMidpoint(state, squad.assignedEdgeId);
    }

    return new Phaser.Math.Vector2(0, 0);
  }

  private isSquadVisible(state: Readonly<GameState>, squad: SquadInstance): boolean {
    if (squad.assignedNodeId) {
      return Boolean(state.nodes.get(squad.assignedNodeId)?.visible);
    }

    if (squad.assignedEdgeId) {
      return Boolean(state.edges.get(squad.assignedEdgeId)?.visible);
    }

    return false;
  }

  private textureForUnit(typeId: string): string {
    const unit = this.unitDataById.get(typeId);
    if (unit?.id === "worker") {
      return "unit_worker";
    }
    if (unit?.id === "major_ant") {
      return "unit_major_ant";
    }
    return "unit_soldier";
  }

  private syncPulse(view: SquadView, inCombat: boolean): void {
    if (!inCombat) {
      if (view.pulsing) {
        this.scene.tweens.killTweensOf(view.container);
        view.container.setScale(1);
        view.pulsing = false;
      }
      return;
    }

    if (view.pulsing) {
      return;
    }

    view.pulsing = true;
    this.scene.tweens.add({
      targets: view.container,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 140,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}
