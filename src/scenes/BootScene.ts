import Phaser from "phaser";

import { SFX_DATA } from "../audio/sfxData";
import { GameSim } from "../sim/GameSim";
import type {
  ChamberData,
  DefenseData,
  EnemyData,
  MapData,
  TuningData,
  UnitData,
  WaveData,
} from "../types/data";

declare global {
  interface Window {
    __sim: GameSim | null;
  }
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    for (const [key, dataUri] of Object.entries(SFX_DATA)) {
      this.load.audio(key, dataUri);
    }

    this.load.json("tuning", "tuning.json");
    this.load.json("enemies", "enemies.json");
    this.load.json("units", "units.json");
    this.load.json("defenses", "defenses.json");
    this.load.json("chambers", "chambers.json");
    this.load.json("waves", "waves.json");
    this.load.json("adaptations", "adaptations.json");
    this.load.json("map", "maps/act1_map.json");
  }

  create(): void {
    this.createTextures();

    window.__sim = new GameSim({
      tuning: this.cache.json.get("tuning") as TuningData,
      map: this.cache.json.get("map") as MapData,
      waves: this.cache.json.get("waves") as WaveData[],
      enemies: this.cache.json.get("enemies") as EnemyData[],
      defenses: this.cache.json.get("defenses") as DefenseData[],
      chambers: this.cache.json.get("chambers") as ChamberData[],
      units: this.cache.json.get("units") as UnitData[],
    });

    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  private createTextures(): void {
    this.circleTexture("node_queen", 40, 0xf2c94c);
    this.circleTexture("node_brood", 35, 0xf2994a);
    this.circleTexture("node_food", 35, 0x27ae60);
    this.circleTexture("node_barracks", 35, 0xeb5757);
    this.circleTexture("node_junction", 28, 0x828282);
    this.circleTexture("node_deep", 28, 0x9b51e0);
    this.circleTexture("node_entrance", 20, 0xf2f2f2);
    this.triangleTexture("enemy_surface", 20, 0xeb5757);
    this.triangleTexture("enemy_deep", 20, 0x9b51e0);
    this.diamondTexture("enemy_boss", 40, 0xeb5757);
    this.rectangleTexture("defense_barricade", 30, 8, 0x2f80ed);
    this.circleTexture("defense_acid", 10, 0x27ae60);
    this.rectangleTexture("defense_guard", 20, 20, 0xf2f2f2);
  }

  private circleTexture(key: string, radius: number, color: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color);
    graphics.fillCircle(radius, radius, radius);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }

  private triangleTexture(key: string, size: number, color: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color);
    graphics.fillTriangle(size / 2, 0, size, size, 0, size);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private diamondTexture(key: string, size: number, color: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const half = size / 2;
    graphics.fillStyle(color);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(half, 0),
        new Phaser.Geom.Point(size, half),
        new Phaser.Geom.Point(half, size),
        new Phaser.Geom.Point(0, half),
      ],
      true,
    );
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private rectangleTexture(key: string, width: number, height: number, color: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color);
    graphics.fillRect(0, 0, width, height);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
