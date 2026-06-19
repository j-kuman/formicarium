import Phaser from "phaser";

import type { EnemyData } from "../types/data";
import type { EdgeState, EnemyInstance, GameState } from "../types/game";

export class EnemyRenderer {
  private readonly containers = new Map<string, Phaser.GameObjects.Container>();
  private readonly enemyDataById: Map<string, EnemyData>;

  constructor(
    private readonly scene: Phaser.Scene,
    enemyData: EnemyData[],
  ) {
    this.enemyDataById = new Map(enemyData.map((enemy) => [enemy.id, enemy]));
  }

  update(state: Readonly<GameState>): void {
    const liveEnemyIds = new Set(state.enemies.map((enemy) => enemy.id));

    for (const [enemyId, container] of this.containers) {
      if (!liveEnemyIds.has(enemyId)) {
        container.destroy(true);
        this.containers.delete(enemyId);
      }
    }

    for (const enemy of state.enemies) {
      const container = this.getOrCreateContainer(enemy);
      const point = this.getPointOnEdge(state, enemy.edgeId, enemy.progress);
      container.setPosition(point.x, point.y);
      container.setScale(Math.max(0.6, enemy.hp / enemy.maxHp));
      container.setVisible(Boolean(state.edges.get(enemy.edgeId)?.visible));
    }
  }

  private getOrCreateContainer(enemy: EnemyInstance): Phaser.GameObjects.Container {
    const existing = this.containers.get(enemy.id);
    if (existing) {
      return existing;
    }

    const enemyData = this.enemyDataById.get(enemy.typeId);
    const container = this.scene.add.container(0, 0);
    const texture = this.textureForEnemy(enemyData);

    if (enemyData?.tags.includes("swarm")) {
      container.add(this.scene.add.image(-6, 4, texture));
      container.add(this.scene.add.image(0, -5, texture));
      container.add(this.scene.add.image(6, 4, texture));
    } else {
      container.add(this.scene.add.image(0, 0, texture));
    }

    this.containers.set(enemy.id, container);
    return container;
  }

  private textureForEnemy(enemyData: EnemyData | undefined): string {
    if (enemyData?.tags.includes("boss")) {
      return "enemy_boss";
    }

    if (enemyData?.tags.includes("deep")) {
      return "enemy_deep";
    }

    return "enemy_surface";
  }

  private getPointOnEdge(
    state: Readonly<GameState>,
    edgeId: string,
    progress: number,
  ): Phaser.Math.Vector2 {
    const edge = state.edges.get(edgeId);
    if (!edge) {
      return new Phaser.Math.Vector2(0, 0);
    }

    const nodeA = state.nodes.get(edge.nodeA);
    const nodeB = state.nodes.get(edge.nodeB);
    if (!nodeA || !nodeB) {
      return new Phaser.Math.Vector2(0, 0);
    }

    const t = Phaser.Math.Clamp(progress, 0, 1);
    const control = this.controlPoint(edge, nodeA.x, nodeA.y, nodeB.x, nodeB.y);
    const inverse = 1 - t;
    const x = inverse * inverse * nodeA.x + 2 * inverse * t * control.x + t * t * nodeB.x;
    const y = inverse * inverse * nodeA.y + 2 * inverse * t * control.y + t * t * nodeB.y;

    return new Phaser.Math.Vector2(x, y);
  }

  private controlPoint(
    edge: EdgeState,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): Phaser.Math.Vector2 {
    const midpointX = (startX + endX) / 2;
    const midpointY = (startY + endY) / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy) || 1;
    const offset = edge.width === "large" ? 18 : 12;

    return new Phaser.Math.Vector2(midpointX - (dy / length) * offset, midpointY + (dx / length) * offset);
  }
}
