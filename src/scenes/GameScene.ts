import Phaser from "phaser";

import { CommandQueue } from "../input/CommandQueue";
import { MapRenderer } from "../render/MapRenderer";
import type { GameSim } from "../sim/GameSim";

export class GameScene extends Phaser.Scene {
  private sim!: GameSim;
  private commandQueue!: CommandQueue;
  private mapRenderer!: MapRenderer;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.sim = window.__sim as GameSim;
    this.commandQueue = new CommandQueue();
    this.mapRenderer = new MapRenderer(this, this.commandQueue);
    this.cameras.main.setBackgroundColor("#050403");
    this.cameras.main.setBounds(0, 0, 1200, 1100);
    this.mapRenderer.init(this.sim.getState());
  }

  update(_time: number, delta: number): void {
    const events = this.sim.tick(delta, this.commandQueue.flush());
    void events;
    this.mapRenderer.update(this.sim.getState());
  }
}
