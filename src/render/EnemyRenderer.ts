import Phaser from "phaser";

import type { EnemyData, TuningData } from "../types/data";
import type { SimEvent } from "../types/events";
import type { EnemyInstance, GameState } from "../types/game";
import { getPointOnStateEdge } from "./edgeGeometry";

export class EnemyRenderer {
  private readonly containers = new Map<string, Phaser.GameObjects.Container>();
  private readonly dyingEnemies = new Map<string, number>();
  private readonly fadingEnemies = new Set<string>();
  private readonly enemyDataById: Map<string, EnemyData>;

  constructor(
    private readonly scene: Phaser.Scene,
    enemyData: EnemyData[],
    private readonly tuning: TuningData,
  ) {
    this.enemyDataById = new Map(enemyData.map((enemy) => [enemy.id, enemy]));
  }

  update(state: Readonly<GameState>, events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === "ENEMY_DIED" && event.enemyId && this.containers.has(event.enemyId)) {
        this.dyingEnemies.set(event.enemyId, event.tick + this.tuning.enemyDeathLingerTicks);
      }
    }

    const liveEnemyIds = new Set(state.enemies.map((enemy) => enemy.id));

    for (const [enemyId, container] of this.containers) {
      if (!liveEnemyIds.has(enemyId)) {
        const lingerUntilTick = this.dyingEnemies.get(enemyId);
        if (this.fadingEnemies.has(enemyId)) {
          continue;
        } else if (lingerUntilTick && state.tick < lingerUntilTick) {
          container.setAlpha(0.6);
        } else if (lingerUntilTick) {
          this.fadeOut(enemyId, container);
        } else {
          container.destroy(true);
          this.containers.delete(enemyId);
        }
      }
    }

    for (const enemy of state.enemies) {
      const container = this.getOrCreateContainer(enemy);
      const point = getPointOnStateEdge(state, enemy.edgeId, enemy.progress);
      container.setPosition(point.x, point.y);
      container.setScale(Math.max(0.6, enemy.hp / enemy.maxHp));
      container.setAlpha(1);
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
    if (enemyData?.bossWave === 14 || enemyData?.tags.includes("boss")) {
      return "enemy_boss";
    }

    if (enemyData?.act === 2 || enemyData?.tags.includes("deep")) {
      return "enemy_deep";
    }

    return "enemy_surface";
  }

  private fadeOut(enemyId: string, container: Phaser.GameObjects.Container): void {
    this.dyingEnemies.delete(enemyId);
    this.fadingEnemies.add(enemyId);
    if (!this.containers.has(enemyId)) {
      return;
    }

    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      scaleX: container.scaleX * 0.75,
      scaleY: container.scaleY * 0.75,
      duration: 220,
      ease: "Quad.easeIn",
      onComplete: () => {
        container.destroy(true);
        this.containers.delete(enemyId);
        this.fadingEnemies.delete(enemyId);
      },
    });
  }
}
