import Phaser from "phaser";

import { SFX_DATA } from "../audio/sfxData";
import { GameSim } from "../sim/GameSim";
import type {
  AdaptationData,
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
      this.load.svg(asset.key, this.svgLoaderUrl(asset.url), { width: asset.width, height: asset.height });
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
      adaptations: this.cache.json.get("adaptations") as AdaptationData[],
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

  private svgLoaderUrl(url: string): string {
    if (!url.startsWith("data:image/svg+xml")) {
      return url;
    }

    const commaIndex = url.indexOf(",");
    const payload = commaIndex >= 0 ? url.slice(commaIndex + 1) : "";
    const svgText = url.includes(";base64,") ? atob(payload) : decodeURIComponent(payload);
    return URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
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
    graphics.lineStyle(3, color, 1);
    graphics.strokeCircle(radius, radius, radius - 2);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }
}

const SURFACE_SVG_TEXTURES = [
  {
    key: "node_queen",
    width: 96,
    height: 96,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Cdefs%3E%3CradialGradient id='g' cx='50%25' cy='42%25' r='56%25'%3E%3Cstop offset='0%25' stop-color='%23ffd8b1'/%3E%3Cstop offset='72%25' stop-color='%23b77a38'/%3E%3Cstop offset='100%25' stop-color='%235b3518'/%3E%3C/radialGradient%3E%3C/defs%3E%3Cellipse cx='48' cy='50' rx='34' ry='29' fill='url(%23g)' stroke='%23f2c56d' stroke-width='4'/%3E%3Ccircle cx='38' cy='44' r='4' fill='%23231810'/%3E%3Ccircle cx='58' cy='44' r='4' fill='%23231810'/%3E%3Cpath d='M34 60c9 8 19 8 28 0' stroke='%23231810' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
  },
  {
    key: "node_brood",
    width: 84,
    height: 84,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 84 84'%3E%3Cellipse cx='42' cy='44' rx='30' ry='25' fill='%23f2c94c' stroke='%238a6c23' stroke-width='4'/%3E%3Ccircle cx='30' cy='38' r='5' fill='%23fff3b0'/%3E%3Ccircle cx='47' cy='50' r='6' fill='%23fff3b0'/%3E%3Ccircle cx='55' cy='34' r='4' fill='%23fff3b0'/%3E%3C/svg%3E",
  },
  {
    key: "node_food",
    width: 78,
    height: 78,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 78 78'%3E%3Crect x='13' y='18' width='52' height='43' rx='14' fill='%236fcf97' stroke='%232b6e42' stroke-width='4'/%3E%3Cpath d='M22 46c10-11 22-13 34-3' stroke='%23f7fff8' stroke-width='5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
  },
  {
    key: "node_barracks",
    width: 82,
    height: 82,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 82 82'%3E%3Cpath d='M12 60 41 13l29 47z' fill='%23d46a3a' stroke='%237b351d' stroke-width='5'/%3E%3Cpath d='M30 58V42h22v16' fill='%23f2994a' stroke='%237b351d' stroke-width='4'/%3E%3C/svg%3E",
  },
  {
    key: "node_junction",
    width: 72,
    height: 72,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72'%3E%3Ccircle cx='36' cy='36' r='25' fill='%23856a4a' stroke='%23412d1b' stroke-width='4'/%3E%3Cpath d='M20 36h32M36 20v32' stroke='%23d8b077' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E",
  },
  {
    key: "node_entrance",
    width: 64,
    height: 64,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cellipse cx='32' cy='38' rx='24' ry='16' fill='%23201611' stroke='%23704a2b' stroke-width='5'/%3E%3Cpath d='M14 38c8-15 26-20 36-3' stroke='%23916a43' stroke-width='5' fill='none'/%3E%3C/svg%3E",
  },
  {
    key: "enemy_surface",
    width: 32,
    height: 32,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cellipse cx='16' cy='17' rx='10' ry='7' fill='%23231f20'/%3E%3Ccircle cx='10' cy='13' r='4' fill='%23333233'/%3E%3Ccircle cx='22' cy='13' r='4' fill='%23333233'/%3E%3Cpath d='M7 22 1 27M25 22l6 5M11 24l-2 7M21 24l2 7' stroke='%23231f20' stroke-width='2'/%3E%3C/svg%3E",
  },
  {
    key: "defense_resin_barricade",
    width: 52,
    height: 28,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 52 28'%3E%3Crect x='4' y='7' width='44' height='14' rx='6' fill='%23c0392b' stroke='%23751d16' stroke-width='4'/%3E%3Ccircle cx='16' cy='14' r='4' fill='%23ff8a80'/%3E%3Ccircle cx='31' cy='14' r='3' fill='%23ff8a80'/%3E%3C/svg%3E",
  },
  {
    key: "defense_acid_sprayer",
    width: 48,
    height: 48,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='17' fill='%2327ae60' stroke='%23105d33' stroke-width='4'/%3E%3Cpath d='M24 8v32M10 24h28' stroke='%23d7ffd9' stroke-width='4'/%3E%3C/svg%3E",
  },
  {
    key: "defense_guard_post",
    width: 52,
    height: 52,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 52 52'%3E%3Cpath d='M26 6 44 18v22H8V18z' fill='%23f2994a' stroke='%23854c16' stroke-width='4'/%3E%3Cpath d='M19 40V24h14v16' fill='%23fff0c2'/%3E%3C/svg%3E",
  },
  {
    key: "enemy_boss",
    width: 42,
    height: 42,
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 42 42'%3E%3Cpath d='M21 2 40 21 21 40 2 21z' fill='%23eb5757' stroke='%237a1212' stroke-width='4'/%3E%3Cpath d='M12 21h18M21 12v18' stroke='%23fff0f0' stroke-width='3'/%3E%3C/svg%3E",
  },
];
