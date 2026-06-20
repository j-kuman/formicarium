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

    for (const asset of SURFACE_SVG_TEXTURES) {
      this.load.svg(asset.key, asset.url, { width: asset.width, height: asset.height });
    }
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
    this.circleTexture("node_deep", 28, 0x9b51e0);
    this.triangleTexture("enemy_deep", 20, 0x9b51e0);
    this.circleTexture("unit_worker", 9, 0x6fcf97);
    this.triangleTexture("unit_soldier", 18, 0xf2994a);
    this.diamondTexture("unit_major_ant", 20, 0xeb5757);
    this.ringTexture("squad_frame_hold", 28, 0xf2f2f2);
    this.ringTexture("squad_frame_intercept", 28, 0xf2994a);
    this.ringTexture("squad_frame_retreat", 28, 0x56ccf2);
    this.ringTexture("squad_frame_repair", 28, 0x6fcf97);
    this.ringTexture("squad_frame_patrol", 28, 0xf2c94c);
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

  private ringTexture(key: string, radius: number, color: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.lineStyle(4, color, 1);
    graphics.fillStyle(0x050403, 0.72);
    graphics.fillCircle(radius, radius, radius - 2);
    graphics.strokeCircle(radius, radius, radius - 2);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }
}

const SURFACE_SVG_TEXTURES = [
  {
    key: "node_queen",
    url: new URL("../../assets/textures/node_queen.svg", import.meta.url).href,
    width: 80,
    height: 80,
  },
  {
    key: "node_brood",
    url: new URL("../../assets/textures/node_brood.svg", import.meta.url).href,
    width: 70,
    height: 70,
  },
  {
    key: "node_food",
    url: new URL("../../assets/textures/node_food.svg", import.meta.url).href,
    width: 70,
    height: 70,
  },
  {
    key: "node_barracks",
    url: new URL("../../assets/textures/node_barracks.svg", import.meta.url).href,
    width: 70,
    height: 70,
  },
  {
    key: "node_junction",
    url: new URL("../../assets/textures/node_junction.svg", import.meta.url).href,
    width: 56,
    height: 56,
  },
  {
    key: "node_entrance",
    url: new URL("../../assets/textures/node_entrance.svg", import.meta.url).href,
    width: 40,
    height: 40,
  },
  {
    key: "enemy_surface",
    url: new URL("../../assets/textures/enemy_surface.svg", import.meta.url).href,
    width: 20,
    height: 20,
  },
  {
    key: "enemy_boss",
    url: new URL("../../assets/textures/enemy_boss.svg", import.meta.url).href,
    width: 40,
    height: 40,
  },
  {
    key: "defense_barricade",
    url: new URL("../../assets/textures/defense_barricade.svg", import.meta.url).href,
    width: 30,
    height: 8,
  },
  {
    key: "defense_acid",
    url: new URL("../../assets/textures/defense_acid.svg", import.meta.url).href,
    width: 20,
    height: 20,
  },
  {
    key: "defense_guard",
    url: new URL("../../assets/textures/defense_guard.svg", import.meta.url).href,
    width: 20,
    height: 20,
  },
] as const;
