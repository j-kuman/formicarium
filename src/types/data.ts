import type { NodeState, Resources } from "./game";

export interface EnemyData {
  id: string;
  name: string;
  hp: number;
  attack: number;
  speed: number;
  armor: number;
  targetPriority: string[];
  tags: string[];
  act: number;
  reward: Partial<Record<keyof Resources, number>>;
  sampleDrop?: string;
  onDeath?: string;
  onReach?: string;
  bossWave?: number;
}

export interface WaveSpawn {
  enemy: string;
  count: number;
  entrance: string;
  target: string;
  intervalTicks: number;
}

export interface WaveData {
  wave: number;
  act: number;
  warningTicks: number;
  spawns: WaveSpawn[];
  foreshadow?: string;
  foreshadowMessage?: string;
  afterWaveEvent?: "underbreach_trigger" | "victory";
  isBossWave?: boolean;
}

export interface DefenseEffects {
  slowFactor?: number;
  dps?: number;
  dotDuration?: number;
  cooldownTicks?: number;
  cleanRatePerTick?: number;
  detectsBurrowers?: boolean;
  warningTicks?: number;
  preventsPanic?: boolean;
}

export interface DefenseData {
  id: string;
  name: string;
  placement: "node" | "edge";
  cost: Partial<Record<keyof Resources, number>>;
  hp: number;
  effects: DefenseEffects;
  tags: string[];
  upgrade?: {
    cost: Partial<Record<keyof Resources, number>>;
    hp: number;
    effects: DefenseEffects;
  };
  requiresAdaptation?: string;
}

export interface ChamberPassiveEffect {
  type: string;
  amount?: number;
  ratePerWave?: number;
  wave?: number;
}

export interface ChamberData {
  id: string;
  name: string;
  hp: number;
  defenseSlots: number;
  squadSlot: boolean;
  passiveEffect: ChamberPassiveEffect | null;
  upgradeable?: boolean;
  unlocksAfterBreach?: boolean;
  upgrade?: {
    cost: Partial<Record<keyof Resources, number>>;
    passiveEffect: ChamberPassiveEffect;
  };
}

export interface UnitData {
  id: string;
  name: string;
  hp: number;
  attack: number;
  speed: number;
  role: string;
  repairRatePerTick?: number;
  costPerUnit: Partial<Record<keyof Resources, number>>;
  requiresBarracks?: boolean;
}

export interface NodeData {
  id: string;
  type: NodeState["type"];
  x: number;
  y: number;
  visible: boolean;
  defenseSlots: number;
  squadSlot: boolean;
  hp: number;
  maxHp: number;
}

export interface EdgeData {
  id: string;
  nodeA: string;
  nodeB: string;
  width: "ant" | "large";
  length: number;
  visible: boolean;
  defenseSlots: number;
  hp: number;
  maxHp: number;
}

export interface MapData {
  mapWidth: number;
  mapHeight: number;
  viewportHeight: number;
  nodes: NodeData[];
  edges: EdgeData[];
}

export interface TuningData {
  ticksPerSecond: number;
  startingResources: Record<keyof Resources, number>;
  resourceCaps: Record<keyof Resources, number>;
  recoveryIncomePer10Ticks: Record<keyof Resources, number>;
  recoveryPhaseDurationTicks: number;
  buildPhaseDurationTicks: number;
  breachRevealDelayTicks: number;
  cameraShakeDurationMs: number;
  cameraShakeIntensity: number;
  breachFlashDurationMs: number;
  breachCameraScrollDurationMs: number;
  enemyDeathLingerTicks: number;
  patrolIntervalTicks: number;
  squadRetaliationDpsMultiplier: number;
  squadPanicRetreatTicks: number;
  // Multiplier on enemy traversal speed. Without it, the (length * 1000) denominator
  // makes enemies crawl (~67s per edge at the 60fps fixed step). Tune in the balance pass.
  enemySpeedScale?: number;
}
