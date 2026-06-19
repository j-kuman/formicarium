import Phaser from "phaser";

import type { SimEvent } from "../types/events";
import type { SfxKey } from "./sfxData";

export class SoundManager {
  private readonly lastPlayedAt = new Map<SfxKey, number>();
  private muted = false;

  constructor(private readonly sound: Phaser.Sound.BaseSoundManager) {}

  process(events: SimEvent[]): void {
    for (const event of events) {
      const key = this.sfxForEvent(event);
      if (key) {
        this.play(key);
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const sound = this.sound as Phaser.Sound.BaseSoundManager & {
      setMute?: (value: boolean) => void;
      mute: boolean;
    };
    if (sound.setMute) {
      sound.setMute(muted);
    } else {
      sound.mute = muted;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  private sfxForEvent(event: SimEvent): SfxKey | null {
    if (event.type === "QUEEN_HIT") {
      return "sfx_queen_hit";
    }
    if (event.type === "ENEMY_DIED") {
      return "sfx_enemy_death";
    }
    if (event.type === "DEFENSE_FIRED") {
      return "sfx_defense_fire";
    }
    if (event.type === "WAVE_STARTED") {
      return "sfx_phase_wave";
    }
    if (event.type === "PHASE_TRANSITION" && event.toPhase === "recovery") {
      return "sfx_phase_recovery";
    }
    if (event.type === "BREACH_TRIGGERED") {
      return "sfx_breach";
    }
    if (event.type === "ADAPTATION_UNLOCKED") {
      return "sfx_adaptation_unlock";
    }
    if (event.type === "NODE_CONTAMINATED") {
      return "sfx_contaminate";
    }
    return null;
  }

  private play(key: SfxKey): void {
    const now = performance.now();
    const lastPlayedAt = this.lastPlayedAt.get(key) ?? 0;
    if (now - lastPlayedAt < 70) {
      return;
    }

    this.lastPlayedAt.set(key, now);
    if (this.muted || this.sound.mute) {
      return;
    }

    this.sound.play(key, { volume: 0.42 });
  }
}
