import Phaser from "phaser";

import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";

declare global {
  interface Window {
    __game: Phaser.Game;
  }
}

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1200,
  height: 1100,
  backgroundColor: "#050403",
  scene: [BootScene, GameScene, UIScene],
});
