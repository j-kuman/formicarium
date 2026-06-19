export type Phase = "scout" | "build" | "wave" | "recovery" | "ended";
export type Act = 1 | 2;
export type SquadStance = "hold" | "intercept" | "retreat" | "repair" | "patrol";

export interface Resources {
  food: number;
  soil: number;
  resin: number;
}

export interface GameState {
  phase: Phase;
  act: Act;
  wave: number;
  tick: number;
  phaseTick: number;
  resources: Resources;
  nodes: Map<string, NodeState>;
  edges: Map<string, EdgeState>;
  enemies: EnemyInstance[];
  squads: SquadInstance[];
  defenses: DefenseInstance[];
  queenHp: number;
  queenMaxHp: number;
  samples: Map<string, number>;
  unlockedAdaptations: Set<string>;
  foreshadowEvents: ForeshadowEvent[];
  breachTriggered: boolean;
  deepNodesVisible: boolean;
  claimedDeepNodes: boolean;
  gameOver: boolean;
  victory: boolean;
  waveEnemiesRemaining: number;
  selectedId: string | null;
  selectedKind: "node" | "edge" | null;
}

export interface NodeState {
  id: string;
  type:
    | "queen"
    | "brood"
    | "food"
    | "barracks"
    | "junction"
    | "entrance"
    | "study"
    | "deep_junction"
    | "deep_entrance";
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  visible: boolean;
  defenseSlots: number;
  squadSlot: boolean;
  upgradeLevel: number;
  contaminated: boolean;
  contaminationLevel: number;
}

export interface EdgeState {
  id: string;
  nodeA: string;
  nodeB: string;
  width: "ant" | "large";
  length: number;
  visible: boolean;
  defenseSlots: number;
  hp: number;
  maxHp: number;
  contaminated: boolean;
}

export interface EnemyInstance {
  id: string;
  typeId: string;
  hp: number;
  maxHp: number;
  edgeId: string;
  progress: number;
  pathEdges: string[];
  targetNodeId: string;
  speed: number;
  slowFactor: number;
  dotDamage: number;
  dotTicksRemaining: number;
  act: 1 | 2;
}

export interface SquadInstance {
  id: string;
  typeId: string;
  count: number;
  assignedNodeId: string | null;
  assignedEdgeId: string | null;
  stance: SquadStance;
  hp: number;
  maxHp: number;
}

export interface DefenseInstance {
  id: string;
  typeId: string;
  nodeId: string | null;
  edgeId: string | null;
  upgradeLevel: number;
  cooldownTicksRemaining: number;
  hp: number;
  maxHp: number;
}

export interface ForeshadowEvent {
  wave: number;
  type: "tremor" | "worker_refusal" | "temperature" | "crack" | "scout_warning";
  message: string;
  shown: boolean;
}
