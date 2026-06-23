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
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2096%2096'><radialGradient%20id='q'%20cx='50%25'%20cy='50%25'%20r='50%25'><stop%20offset='0%25'%20stop-color='%23ffc85a'/><stop%20offset='40%25'%20stop-color='%23d4820a'/><stop%20offset='100%25'%20stop-color='%235b3518'/><circle%20cx='48'%20cy='48'%20r='46'%20fill='url(%23q)'/><circle%20cx='48'%20cy='48'%20r='38'%20fill='none'%20stroke='%238b3a0f'%20stroke-width='3'%20opacity='0.5'/><circle%20cx='48'%20cy='48'%20r='28'%20fill='none'%20stroke='%23a0510d'%20stroke-width='4'%20stroke-dasharray='8%204'/><path%20d='M48%2020%20L58%2035%20L75%2035%20L62%2050%20L68%2068%20L48%2058%20L28%2068%20L34%2050%20L21%2035%20L38%2035%20Z'%20fill='%232d1b0e'%20stroke='%23f2c56d'%20stroke-width='2'/><circle%20cx='48'%20cy='48'%20r='12'%20fill='%23ffc85a'%20opacity='0.8'/>",
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
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2052%2028'><path%20d='M2%2024%20C%202%2010,%2010%204,%2026%204%20C%2042%204,%2050%2010,%2050%2024%20Z'%20fill='%23d4820a'%20stroke='%238b3a0f'%20stroke-width='2'/><circle%20cx='15'%20cy='16'%20r='6'%20fill='%23a0510d'%20opacity='0.7'/><circle%20cx='35'%20cy='18'%20r='8'%20fill='%23a0510d'%20opacity='0.7'/><ellipse%20cx='26'%20cy='12'%20rx='12'%20ry='5'%20fill='%23ffc85a'%20opacity='0.6'/><circle%20cx='12'%20cy='20'%20r='1.5'%20fill='%232d1b0e'/><circle%20cx='38'%20cy='14'%20r='1'%20fill='%232d1b0e'/><circle%20cx='25'%20cy='22'%20r='2'%20fill='%232d1b0e'/>",
  },
  {
    key: "defense_acid_sprayer",
    width: 48,
    height: 48,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2048%2048'><path%20d='M10%2040%20C%2010%2020,%2020%2015,%2024%2010%20C%2028%2015,%2038%2020,%2038%2040%20Z'%20fill='%231a0a0a'%20stroke='%232d1010'%20stroke-width='2'/><path%20d='M20%2025%20Q%2024%2020%2028%2025'%20fill='none'%20stroke='%237fff00'%20stroke-width='2'/><circle%20cx='24'%20cy='12'%20r='4'%20fill='%2300ff41'/><circle%20cx='24'%20cy='4'%20r='2'%20fill='%237fff00'/><circle%20cx='18'%20cy='6'%20r='1.5'%20fill='%237fff00'/><circle%20cx='30'%20cy='6'%20r='1.5'%20fill='%237fff00'/><ellipse%20cx='24'%20cy='32'%20rx='6'%20ry='4'%20fill='%2300ff41'%20opacity='0.4'/>",
  },
  {
    key: "defense_guard_post",
    width: 52,
    height: 52,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2052%2052'><path%20d='M6%2046%20L%2016%2010%20L%2036%2010%20L%2046%2046%20Z'%20fill='%235a3820'%20stroke='%233d2518'%20stroke-width='3'/><path%20d='M12%2046%20L%2020%2018%20L%2032%2018%20L%2040%2046%20Z'%20fill='%237a4a30'/><rect%20x='22'%20y='24'%20width='8'%20height='12'%20rx='2'%20fill='%23fff0c2'/><rect%20x='24'%20y='26'%20width='4'%20height='8'%20fill='%23ffc85a'/><path%20d='M6%2046%20L%2046%2046'%20stroke='%233d2518'%20stroke-width='4'/>",
  },
  {
    key: "enemy_boss",
    width: 42,
    height: 42,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2042%2042'><path%20d='M10%2020%20L%202%2012%20M%2010%2026%20L%202%2030%20M%2032%2020%20L%2040%2012%20M%2032%2026%20L%2040%2030'%20stroke='%231a0a0a'%20stroke-width='3'%20stroke-linecap='round'/><ellipse%20cx='21'%20cy='26'%20rx='12'%20ry='14'%20fill='%231a0a0a'%20stroke='%232d1010'%20stroke-width='2'/><ellipse%20cx='21'%20cy='12'%20rx='8'%20ry='6'%20fill='%231a0a0a'%20stroke='%232d1010'%20stroke-width='2'/><path%20d='M17%208%20Q%2015%202%2021%202%20M%2025%208%20Q%2027%202%2021%202'%20fill='none'%20stroke='%231a0a0a'%20stroke-width='2'/><path%20d='M15%2022%20L%2027%2022%20M%2017%2028%20L%2025%2028%20M%2021%2016%20L%2021%2034'%20stroke='%23eb5757'%20stroke-width='2'/><circle%20cx='18'%20cy='12'%20r='1.5'%20fill='%23eb5757'/><circle%20cx='24'%20cy='12'%20r='1.5'%20fill='%23eb5757'/>",
  },
  {
    key: "bg_dirt",
    width: 64,
    height: 64,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20width='64'%20height='64'%20viewBox='0%200%2064%2064'><rect%20width='64'%20height='64'%20fill='%232d1b0e'/><path%20d='M0%2010%20Q%2016%2020%2032%2010%20T%2064%2010%20L%2064%2030%20Q%2048%2040%2032%2030%20T%200%2030%20Z'%20fill='%233d2518'%20opacity='0.5'/><path%20d='M0%2040%20Q%2016%2050%2032%2040%20T%2064%2040%20L%2064%2064%20L%200%2064%20Z'%20fill='%234a2e1a'%20opacity='0.3'/><circle%20cx='12'%20cy='15'%20r='2'%20fill='%231e1009'%20opacity='0.4'/><circle%20cx='50'%20cy='45'%20r='3'%20fill='%231e1009'%20opacity='0.4'/><circle%20cx='25'%20cy='55'%20r='1.5'%20fill='%231e1009'%20opacity='0.4'/>",
  },
  {
    key: "bg_sky",
    width: 64,
    height: 64,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20width='64'%20height='64'%20viewBox='0%200%2064%2064'><rect%20width='64'%20height='64'%20fill='%2387ceeb'/><path%20d='M%20-10%2020%20Q%2015%2010%2032%2020%20T%2074%2020'%20fill='none'%20stroke='%23b0d9f0'%20stroke-width='8'%20opacity='0.5'/><path%20d='M%20-10%2050%20Q%2015%2040%2032%2050%20T%2074%2050'%20fill='none'%20stroke='%23d6eef9'%20stroke-width='6'%20opacity='0.4'/>",
  },
  {
    key: "bg_grass_border",
    width: 64,
    height: 32,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20width='64'%20height='32'%20viewBox='0%200%2064%2032'><rect%20y='16'%20width='64'%20height='16'%20fill='%232d1b0e'/><path%20d='M0%2016%20L%204%208%20L%208%2016%20L%2012%206%20L%2016%2016%20L%2020%2010%20L%2024%2016%20L%2028%204%20L%2032%2016%20L%2036%208%20L%2040%2016%20L%2044%206%20L%2048%2016%20L%2052%2010%20L%2056%2016%20L%2060%204%20L%2064%2016%20Z'%20fill='%2327ae60'/><path%20d='M0%2016%20L%204%2010%20L%208%2016%20L%2012%208%20L%2016%2016%20L%2020%2012%20L%2024%2016%20L%2028%206%20L%2032%2016%20L%2036%2010%20L%2040%2016%20L%2044%208%20L%2048%2016%20L%2052%2012%20L%2056%2016%20L%2060%206%20L%2064%2016'%20fill='none'%20stroke='%23105d33'%20stroke-width='1.5'/>",
  },
  {
    key: "bg_chamber_wall",
    width: 64,
    height: 64,
    url: "data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20width='64'%20height='64'%20viewBox='0%200%2064%2064'><rect%20width='64'%20height='64'%20fill='%235c3a20'/><path%20d='M0%2016%20L%2064%2016%20M0%2032%20L%2064%2032%20M0%2048%20L%2064%2048'%20stroke='%233d2518'%20stroke-width='2'%20opacity='0.4'/><path%20d='M0%208%20L%2064%208%20M0%2024%20L%2064%2024%20M0%2040%20L%2064%2040%20M0%2056%20L%2064%2056'%20stroke='%234a2e1a'%20stroke-width='1'%20opacity='0.3'/>",
  },
];
