import Phaser from "phaser";

import { CommandQueue } from "../input/CommandQueue";
import { DefenseRenderer } from "../render/DefenseRenderer";
import { EnemyRenderer } from "../render/EnemyRenderer";
import { MapRenderer } from "../render/MapRenderer";
import type { GameSim } from "../sim/GameSim";
import type { DefenseData, EnemyData } from "../types/data";

export class GameScene extends Phaser.Scene {
  private sim!: GameSim;
  private commandQueue!: CommandQueue;
  private mapRenderer!: MapRenderer;
  private enemyRenderer!: EnemyRenderer;
  private defenseRenderer!: DefenseRenderer;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.sim = window.__sim as GameSim;
    this.commandQueue = new CommandQueue();
    this.mapRenderer = new MapRenderer(this, this.commandQueue);
    this.enemyRenderer = new EnemyRenderer(this, this.cache.json.get("enemies") as EnemyData[]);
    this.defenseRenderer = new DefenseRenderer(this, this.cache.json.get("defenses") as DefenseData[]);
    this.cameras.main.setBackgroundColor("#050403");
    this.cameras.main.setBounds(0, 0, 1200, 1100);
    this.mapRenderer.init(this.sim.getState());
  }

  update(_time: number, delta: number): void {
    const events = this.sim.tick(delta, this.commandQueue.flush());
    void events;
    const state = this.sim.getState();
    this.mapRenderer.update(state);
    this.enemyRenderer.update(state);
    this.defenseRenderer.update(state);
  }
}
