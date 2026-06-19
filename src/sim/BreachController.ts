import type { TuningData, WaveData } from "../types/data";
import type { ForeshadowEvent, GameState } from "../types/game";
import type { SimEvent } from "../types/events";

export class BreachController {
  private revealTicksRemaining: number | null = null;

  constructor(
    private readonly waves: WaveData[],
    private readonly tuning: TuningData,
  ) {}

  onWaveStart(state: GameState, waveNumber: number): SimEvent[] {
    const wave = this.waves.find((entry) => entry.wave === waveNumber);
    if (!wave?.foreshadow) {
      return [];
    }

    const event: ForeshadowEvent = {
      wave: waveNumber,
      type: this.foreshadowType(wave.foreshadow),
      message: wave.foreshadowMessage ?? wave.foreshadow,
      shown: false,
    };
    state.foreshadowEvents.push(event);

    return [
      {
        type: "FORESHADOW_EVENT",
        tick: state.tick,
        wave: waveNumber,
        foreshadowType: event.type,
        message: event.message,
        payload: { foreshadowType: event.type, message: event.message },
      },
    ];
  }

  tick(state: GameState): SimEvent[] {
    if (this.revealTicksRemaining === null) {
      return [];
    }

    this.revealTicksRemaining -= 1;
    if (this.revealTicksRemaining > 0) {
      return [];
    }

    this.revealTicksRemaining = null;
    for (const node of state.nodes.values()) {
      if (!node.visible) {
        node.visible = true;
      }
    }
    for (const edge of state.edges.values()) {
      if (!edge.visible) {
        edge.visible = true;
      }
    }
    state.deepNodesVisible = true;

    return [{ type: "DEEP_NODES_REVEALED", tick: state.tick }];
  }

  triggerBreach(state: GameState): SimEvent[] {
    state.breachTriggered = true;
    this.revealTicksRemaining = this.tuning.breachRevealDelayTicks;
    return [{ type: "BREACH_TRIGGERED", tick: state.tick }];
  }

  triggerVictory(state: GameState): SimEvent[] {
    state.victory = true;
    state.claimedDeepNodes = true;
    return [{ type: "VICTORY", tick: state.tick }];
  }

  private foreshadowType(value: string): ForeshadowEvent["type"] {
    if (value === "tremor" || value === "worker_refusal" || value === "temperature" || value === "crack") {
      return value;
    }
    return "scout_warning";
  }
}
