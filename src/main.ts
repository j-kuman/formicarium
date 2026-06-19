import Phaser from "phaser";

declare global {
  interface Window {
    __sim: unknown | null;
  }
}

window.__sim = null;

class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#050403");
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1200,
  height: 900,
  backgroundColor: "#050403",
  scene: [BootScene],
});
