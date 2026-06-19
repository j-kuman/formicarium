import type { SquadStance } from "./game";

export type InputCommand =
  | { type: "place_defense"; defenseTypeId: string; nodeId?: string; edgeId?: string }
  | { type: "upgrade_defense"; defenseInstanceId: string }
  | { type: "upgrade_chamber"; nodeId: string }
  | { type: "assign_squad"; squadId: string; nodeId?: string; edgeId?: string }
  | { type: "set_squad_stance"; squadId: string; stance: SquadStance }
  | { type: "spawn_squad"; unitTypeId: string; count: number }
  | { type: "unlock_adaptation"; adaptationId: string }
  | { type: "advance_phase" }
  | { type: "select_node"; nodeId: string }
  | { type: "select_edge"; edgeId: string }
  | { type: "deselect" };
