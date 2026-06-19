export type SimEventType =
  | "ENEMY_DIED"
  | "ENEMY_REACHED_GOAL"
  | "NODE_DAMAGED"
  | "QUEEN_HIT"
  | "DEFENSE_FIRED"
  | "NODE_CONTAMINATED"
  | "WAVE_STARTED"
  | "WAVE_COMPLETE"
  | "PHASE_TRANSITION"
  | "FORESHADOW_EVENT"
  | "BREACH_TRIGGERED"
  | "DEEP_NODES_REVEALED"
  | "ADAPTATION_UNLOCKED"
  | "SAMPLE_COLLECTED"
  | "SQUAD_PANICKED"
  | "GAME_OVER"
  | "VICTORY";

export interface SimEvent {
  type: SimEventType;
  tick: number;
  enemyId?: string;
  enemyTypeId?: string;
  nodeId?: string;
  edgeId?: string;
  defenseId?: string;
  fromPhase?: string;
  toPhase?: string;
  wave?: number;
  message?: string;
  payload?: Record<string, unknown>;
}
