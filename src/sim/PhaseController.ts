import type { InputCommand } from "../types/commands";
import type { TuningData, WaveData } from "../types/data";
import type { GameState, Phase } from "../types/game";
import type { SimEvent } from "../types/events";

export class PhaseController {
  constructor(private readonly waves: WaveData[]) {}

  tick(state: GameState, commands: InputCommand[], tuning: TuningData): SimEvent[] {
    if (state.phase === "ended") {
      return [];
    }

    const advanceRequested = commands.some((command) => command.type === "advance_phase");
    const elapsedTicks = state.phaseTick + 1;
    const transition = this.nextPhase(state, advanceRequested, elapsedTicks, tuning);

    if (!transition) {
      state.phaseTick = elapsedTicks;
      return [];
    }

    const fromPhase = state.phase;
    state.phase = transition.toPhase;
    state.phaseTick = 0;
    if (transition.incrementWave) {
      state.wave += 1;
    }

    return [this.phaseTransitionEvent(state.tick, fromPhase, state.phase, state.wave)];
  }

  private nextPhase(
    state: GameState,
    advanceRequested: boolean,
    elapsedTicks: number,
    tuning: TuningData,
  ): { toPhase: Phase; incrementWave: boolean } | null {
    if (state.phase === "scout") {
      const warningTicks = this.currentWave(state.wave)?.warningTicks ?? 0;
      if (advanceRequested || elapsedTicks >= warningTicks) {
        return { toPhase: "build", incrementWave: false };
      }
      return null;
    }

    if (state.phase === "build") {
      if (advanceRequested || elapsedTicks >= tuning.buildPhaseDurationTicks) {
        return { toPhase: "wave", incrementWave: false };
      }
      return null;
    }

    if (state.phase === "wave") {
      if (state.waveEnemiesRemaining === 0) {
        return { toPhase: "recovery", incrementWave: false };
      }
      return null;
    }

    if (state.phase === "recovery" && elapsedTicks >= tuning.recoveryPhaseDurationTicks) {
      const nextWaveNumber = state.wave + 1;
      return {
        toPhase: this.currentWave(nextWaveNumber) ? "scout" : "ended",
        incrementWave: this.currentWave(nextWaveNumber) !== undefined,
      };
    }

    return null;
  }

  private currentWave(waveNumber: number): WaveData | undefined {
    return this.waves.find((wave) => wave.wave === waveNumber);
  }

  private phaseTransitionEvent(tick: number, fromPhase: Phase, toPhase: Phase, wave: number): SimEvent {
    return {
      type: "PHASE_TRANSITION",
      tick,
      fromPhase,
      toPhase,
      wave,
      payload: { fromPhase, toPhase, wave },
    };
  }
}
