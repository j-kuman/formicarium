import Phaser from "phaser";

import type { EnemyData } from "../types/data";
import type { EnemyInstance, GameState } from "../types/game";
import { getPointOnStateEdge } from "./edgeGeometry";

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
      const point = getPointOnStateEdge(state, enemy.edgeId, enemy.progress);
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
}
