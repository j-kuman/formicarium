import Phaser from "phaser";

import { CommandQueue } from "../input/CommandQueue";
import { DefenseRenderer } from "../render/DefenseRenderer";
import { EffectRenderer } from "../render/EffectRenderer";
import { EnemyRenderer } from "../render/EnemyRenderer";
import { MapRenderer } from "../render/MapRenderer";
import type { GameSim } from "../sim/GameSim";
import type { DefenseData, EnemyData, MapData, TuningData } from "../types/data";
import type { UIScene } from "./UIScene";

export class GameScene extends Phaser.Scene {
  private sim!: GameSim;
  private uiScene!: UIScene;
  private commandQueue!: CommandQueue;
  private mapRenderer!: MapRenderer;
  private enemyRenderer!: EnemyRenderer;
  private defenseRenderer!: DefenseRenderer;
  private effectRenderer!: EffectRenderer;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.sim = window.__sim as GameSim;
    this.uiScene = this.scene.get("UIScene") as UIScene;
    this.commandQueue = this.uiScene.commandQueue;
    this.mapRenderer = new MapRenderer(this, this.commandQueue, this.cache.json.get("defenses") as DefenseData[]);
    this.enemyRenderer = new EnemyRenderer(
      this,
      this.cache.json.get("enemies") as EnemyData[],
      this.cache.json.get("tuning") as TuningData,
    );
    this.defenseRenderer = new DefenseRenderer(
      this,
      this.cache.json.get("defenses") as DefenseData[],
      this.commandQueue,
    );
    this.effectRenderer = new EffectRenderer(
      this,
      this.cache.json.get("tuning") as TuningData,
      this.cache.json.get("map") as MapData,
    );
    this.cameras.main.setBackgroundColor("#050403");
    this.cameras.main.setBounds(0, 0, 1200, 1100);
    this.mapRenderer.init(this.sim.getState());
  }

  update(_time: number, delta: number): void {
    if (window.__sim && this.sim !== window.__sim) {
      this.sim = window.__sim as GameSim;
    }

    const events = this.sim.tick(delta, this.commandQueue.flush());
    const state = this.sim.getState();
    this.effectRenderer.process(events, state);
    this.uiScene.sync(state, events);
    this.mapRenderer.update(state);
    this.enemyRenderer.update(state, events);
    this.defenseRenderer.update(state);
  }
}
