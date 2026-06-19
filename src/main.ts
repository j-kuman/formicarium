import Phaser from "phaser";

import adaptations from "../data/adaptations.json";
import chambers from "../data/chambers.json";
import defenses from "../data/defenses.json";
import enemies from "../data/enemies.json";
import act1Map from "../data/maps/act1_map.json";
import tuning from "../data/tuning.json";
import units from "../data/units.json";
import waves from "../data/waves.json";

declare global {
  interface Window {
    __sim: unknown | null;
  }
}

window.__sim = null;

const dataSummary = {
  adaptations: adaptations.length,
  chambers: chambers.length,
  defenses: defenses.length,
  enemies: enemies.length,
  nodes: act1Map.nodes.length,
  edges: act1Map.edges.length,
  ticksPerSecond: tuning.ticksPerSecond,
  units: units.length,
  waves: waves.length,
};

class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#050403");
    console.info("Formicarium data loaded", dataSummary);
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
