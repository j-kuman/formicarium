import { AdaptationManager } from "./AdaptationManager";
import { BreachController } from "./BreachController";
import { CombatResolver } from "./CombatResolver";
import { Pathfinder } from "./Pathfinder";
import { PhaseController } from "./PhaseController";
import { ResourceManager } from "./ResourceManager";
import { SquadController } from "./SquadController";
import { WaveSpawner } from "./WaveSpawner";
import type { InputCommand } from "../types/commands";
import type { AdaptationData, ChamberData, DefenseData, EnemyData, MapData, TuningData, UnitData, WaveData } from "../types/data";
import type { DefenseInstance, EdgeState, GameState, NodeState, Resources, SquadInstance } from "../types/game";
import type { SimEvent } from "../types/events";

interface GameSimData {
  tuning: TuningData;
  map: MapData;
  waves: WaveData[];
  enemies: EnemyData[];
  defenses: DefenseData[];
  chambers: ChamberData[];
  units: UnitData[];
  adaptations?: AdaptationData[];
}

interface GameSimSnapshot {
  state: GameState;
  startedWaves: number[];
  processedAfterWaveEvents: number[];
  nextDefenseId: number;
  nextSquadId: number;
}

export class GameSim {
  private readonly state: GameState;
  private readonly tuning: TuningData;
  private readonly phaseController: PhaseController;
  private readonly resourceManager: ResourceManager;
  private waveSpawner: WaveSpawner;
  private readonly squadController: SquadController;
  private readonly combatResolver: CombatResolver;
  private readonly breachController: BreachController;
  private readonly adaptationManager: AdaptationManager;
  private accumulatorMs = 0;
  private nextDefenseId = 1;
  private nextSquadId = 1;
  private readonly startedWaves = new Set<number>();
  private readonly processedAfterWaveEvents = new Set<number>();
  private wave10Snapshot: GameSimSnapshot | null = null;

  constructor(private readonly data: GameSimData) {
    this.tuning = data.tuning;
    this.state = this.initialState(data.map, data.tuning);

    const pathfinder = new Pathfinder(this.state.nodes, this.state.edges);
    this.phaseController = new PhaseController(data.waves);
    this.resourceManager = new ResourceManager();
    this.waveSpawner = new WaveSpawner(data.waves, data.enemies, pathfinder);
    this.squadController = new SquadController(data.units, pathfinder, data.tuning);
    this.combatResolver = new CombatResolver(
      data.enemies,
      data.defenses,
      this.resourceManager,
      data.tuning.enemySpeedScale ?? 1,
      data.units,
      data.tuning,
    );
    this.breachController = new BreachController(data.waves, data.tuning);
    this.adaptationManager = new AdaptationManager(data.adaptations ?? [], data.enemies);

    this.resourceManager.tick(this.state, this.tuning);
  }

  tick(deltaMs: number, commands: InputCommand[]): SimEvent[] {
    const events: SimEvent[] = [];
    const nominalDeltaMs = 1000 / this.tuning.ticksPerSecond;
    this.accumulatorMs += deltaMs;

    let fixedSteps = 0;
    while (this.accumulatorMs >= nominalDeltaMs && fixedSteps < MAX_FIXED_STEPS_PER_CALL) {
      events.push(...this.fixedStep(fixedSteps === 0 ? commands : [], nominalDeltaMs));
      this.accumulatorMs -= nominalDeltaMs;
      fixedSteps += 1;
    }

    if (fixedSteps === MAX_FIXED_STEPS_PER_CALL && this.accumulatorMs >= nominalDeltaMs) {
      this.accumulatorMs = 0;
    }

    return events;
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  resetToWave10Snapshot(): boolean {
    if (!this.wave10Snapshot) {
      return false;
    }

    this.restoreSnapshot(this.wave10Snapshot);
    return true;
  }

  private fixedStep(commands: InputCommand[], deltaMs: number): SimEvent[] {
    const events: SimEvent[] = [];
    this.processCommands(commands);

    const phaseEvents = this.phaseController.tick(this.state, commands, this.tuning);
    events.push(...phaseEvents);
    this.captureWave10SnapshotIfNeeded();
    this.startWaveIfNeeded(events);

    events.push(...this.waveSpawner.tick(this.state));
    events.push(...this.squadController.tick(this.state, deltaMs));
    events.push(...this.combatResolver.tick(this.state, deltaMs));
    this.processEnemyDeathSamples(events);
    events.push(...this.adaptationManager.tick(this.state));
    events.push(...this.breachController.tick(this.state));
    events.push(...this.processAfterWaveEvent());
    events.push(...this.resourceManager.tick(this.state, this.tuning));

    this.state.tick += 1;
    return events;
  }

  private processCommands(commands: InputCommand[]): void {
    for (const command of commands) {
      if (command.type === "select_node") {
        this.state.selectedId = command.nodeId;
        this.state.selectedKind = "node";
      } else if (command.type === "select_edge") {
        this.state.selectedId = command.edgeId;
        this.state.selectedKind = "edge";
      } else if (command.type === "deselect") {
        this.state.selectedId = null;
        this.state.selectedKind = null;
      } else if (command.type === "place_defense") {
        this.placeDefense(command);
      } else if (command.type === "upgrade_defense") {
        this.upgradeDefense(command.defenseInstanceId);
      } else if (command.type === "upgrade_chamber") {
        this.upgradeChamber(command.nodeId);
      } else if (command.type === "spawn_squad") {
        this.spawnSquad(command);
      } else if (command.type === "assign_squad") {
        this.assignSquad(command);
      } else if (command.type === "set_squad_stance") {
        this.setSquadStance(command);
      }
    }
  }

  private placeDefense(command: Extract<InputCommand, { type: "place_defense" }>): void {
    const defenseData = this.data.defenses.find((defense) => defense.id === command.defenseTypeId);
    if (!defenseData || !this.defenseUnlocked(defenseData)) {
      return;
    }

    const placement = this.validPlacement(defenseData, command.nodeId, command.edgeId);
    if (!placement || !this.resourceManager.spend(this.state, defenseData.cost)) {
      return;
    }

    const defense: DefenseInstance = {
      id: `defense_${this.nextDefenseId++}`,
      typeId: defenseData.id,
      nodeId: placement.kind === "node" ? placement.id : null,
      edgeId: placement.kind === "edge" ? placement.id : null,
      upgradeLevel: 0,
      cooldownTicksRemaining: 0,
      hp: defenseData.hp,
      maxHp: defenseData.hp,
    };
    this.state.defenses.push(defense);
  }

  private upgradeDefense(defenseInstanceId: string): void {
    const defense = this.state.defenses.find((entry) => entry.id === defenseInstanceId);
    const defenseData = defense ? this.data.defenses.find((entry) => entry.id === defense.typeId) : undefined;
    if (!defense || !defenseData?.upgrade || defense.upgradeLevel > 0) {
      return;
    }
    if (!this.resourceManager.spend(this.state, defenseData.upgrade.cost)) {
      return;
    }

    defense.upgradeLevel = 1;
    defense.maxHp = defenseData.upgrade.hp;
    defense.hp = defense.maxHp;
  }

  private upgradeChamber(nodeId: string): void {
    const node = this.state.nodes.get(nodeId);
    const chamber = node ? this.data.chambers.find((entry) => entry.id === node.type) : undefined;
    if (!node || !chamber?.upgrade || node.upgradeLevel > 0) {
      return;
    }
    if (!this.resourceManager.spend(this.state, chamber.upgrade.cost)) {
      return;
    }

    node.upgradeLevel = 1;
    this.resourceManager.recomputeCaps(this.state, this.data.chambers);
  }

  private spawnSquad(command: Extract<InputCommand, { type: "spawn_squad" }>): void {
    const unit = this.data.units.find((entry) => entry.id === command.unitTypeId);
    const count = Math.floor(command.count);
    if (!unit || count <= 0 || !this.unitUnlocked(unit)) {
      return;
    }

    const placement = this.validSquadPlacement(command.nodeId, command.edgeId);
    if (!placement) {
      return;
    }

    const cost = this.scaleCost(unit.costPerUnit, count);
    if (!this.resourceManager.spend(this.state, cost)) {
      return;
    }

    const maxHp = unit.hp * count;
    const squad: SquadInstance = {
      id: `squad_${this.nextSquadId++}`,
      typeId: unit.id,
      count,
      assignedNodeId: placement.kind === "node" ? placement.id : null,
      assignedEdgeId: placement.kind === "edge" ? placement.id : null,
      stance: unit.repairRatePerTick ? "repair" : "hold",
      hp: maxHp,
      maxHp,
      panicTicksRemaining: 0,
      patrolAnchorNodeId: placement.kind === "node" ? placement.id : undefined,
      inCombat: false,
    };
    this.state.squads.push(squad);
  }

  private assignSquad(command: Extract<InputCommand, { type: "assign_squad" }>): void {
    const squad = this.state.squads.find((entry) => entry.id === command.squadId);
    const placement = this.validSquadPlacement(command.nodeId, command.edgeId);
    if (!squad || !placement) {
      return;
    }

    squad.assignedNodeId = placement.kind === "node" ? placement.id : null;
    squad.assignedEdgeId = placement.kind === "edge" ? placement.id : null;
    squad.patrolAnchorNodeId = placement.kind === "node" ? placement.id : undefined;
    squad.patrolTargetNodeId = undefined;
  }

  private setSquadStance(command: Extract<InputCommand, { type: "set_squad_stance" }>): void {
    const squad = this.state.squads.find((entry) => entry.id === command.squadId);
    const unit = squad ? this.data.units.find((entry) => entry.id === squad.typeId) : undefined;
    if (!squad || (command.stance === "repair" && !unit?.repairRatePerTick)) {
      return;
    }

    squad.stance = command.stance;
    squad.previousStance = undefined;
    squad.panicTicksRemaining = 0;
  }

  private startWaveIfNeeded(events: SimEvent[]): void {
    if (this.state.phase !== "wave" || this.startedWaves.has(this.state.wave)) {
      return;
    }

    this.startedWaves.add(this.state.wave);
    events.push(...this.breachController.onWaveStart(this.state, this.state.wave));
    events.push(...this.waveSpawner.startWave(this.state, this.state.wave));
  }

  private processEnemyDeathSamples(events: SimEvent[]): void {
    const sampleEvents: SimEvent[] = [];
    for (const event of events) {
      if (event.type === "ENEMY_DIED" && event.enemyTypeId) {
        sampleEvents.push(...this.adaptationManager.onEnemyDied(this.state, event.enemyTypeId));
      }
    }
    events.push(...sampleEvents);
  }

  private processAfterWaveEvent(): SimEvent[] {
    if (this.state.waveEnemiesRemaining !== 0 || this.processedAfterWaveEvents.has(this.state.wave)) {
      return [];
    }

    const wave = this.data.waves.find((entry) => entry.wave === this.state.wave);
    if (!wave?.afterWaveEvent) {
      return [];
    }

    this.processedAfterWaveEvents.add(this.state.wave);
    if (wave.afterWaveEvent === "underbreach_trigger") {
      return this.breachController.triggerBreach(this.state);
    }
    return this.breachController.triggerVictory(this.state);
  }

  private defenseUnlocked(defense: DefenseData): boolean {
    return !defense.requiresAdaptation || this.state.unlockedAdaptations.has(defense.requiresAdaptation);
  }

  private validPlacement(
    defense: DefenseData,
    nodeId: string | undefined,
    edgeId: string | undefined,
  ): { kind: "node" | "edge"; id: string } | null {
    if (defense.placement === "node" && nodeId) {
      const node = this.state.nodes.get(nodeId);
      if (node?.visible && this.state.defenses.filter((entry) => entry.nodeId === nodeId).length < node.defenseSlots) {
        return { kind: "node", id: nodeId };
      }
    }

    if (defense.placement === "edge" && edgeId) {
      const edge = this.state.edges.get(edgeId);
      if (edge?.visible && this.state.defenses.filter((entry) => entry.edgeId === edgeId).length < edge.defenseSlots) {
        return { kind: "edge", id: edgeId };
      }
    }

    return null;
  }

  private validSquadPlacement(
    nodeId: string | undefined,
    edgeId: string | undefined,
  ): { kind: "node" | "edge"; id: string } | null {
    if (nodeId) {
      const node = this.state.nodes.get(nodeId);
      if (node?.visible && node.squadSlot) {
        return { kind: "node", id: nodeId };
      }
    }

    if (edgeId) {
      const edge = this.state.edges.get(edgeId);
      if (edge?.visible) {
        return { kind: "edge", id: edgeId };
      }
    }

    return null;
  }

  private unitUnlocked(unit: UnitData): boolean {
    if (!unit.requiresBarracks) {
      return true;
    }

    return [...this.state.nodes.values()].some((node) => node.visible && node.type === "barracks");
  }

  private scaleCost(cost: Partial<Record<keyof Resources, number>>, count: number): Partial<Record<keyof Resources, number>> {
    const scaled: Partial<Record<keyof Resources, number>> = {};
    for (const [resource, amount] of Object.entries(cost)) {
      scaled[resource as keyof Resources] = (amount ?? 0) * count;
    }
    return scaled;
  }

  private captureWave10SnapshotIfNeeded(): void {
    if (this.wave10Snapshot || this.state.wave !== 10 || this.state.phase !== "scout") {
      return;
    }

    this.wave10Snapshot = {
      state: this.cloneState(this.state),
      startedWaves: [...this.startedWaves],
      processedAfterWaveEvents: [...this.processedAfterWaveEvents],
      nextDefenseId: this.nextDefenseId,
      nextSquadId: this.nextSquadId,
    };
  }

  private restoreSnapshot(snapshot: GameSimSnapshot): void {
    const restored = this.cloneState(snapshot.state);
    this.state.phase = restored.phase;
    this.state.act = restored.act;
    this.state.wave = restored.wave;
    this.state.tick = restored.tick;
    this.state.phaseTick = restored.phaseTick;
    this.state.resources = restored.resources;
    this.state.nodes.clear();
    for (const [id, node] of restored.nodes) {
      this.state.nodes.set(id, node);
    }
    this.state.edges.clear();
    for (const [id, edge] of restored.edges) {
      this.state.edges.set(id, edge);
    }
    this.state.enemies = restored.enemies;
    this.state.squads = restored.squads;
    this.state.defenses = restored.defenses;
    this.state.queenHp = restored.queenHp;
    this.state.queenMaxHp = restored.queenMaxHp;
    this.state.samples = restored.samples;
    this.state.unlockedAdaptations = restored.unlockedAdaptations;
    this.state.foreshadowEvents = restored.foreshadowEvents;
    this.state.breachTriggered = restored.breachTriggered;
    this.state.deepNodesVisible = restored.deepNodesVisible;
    this.state.claimedDeepNodes = restored.claimedDeepNodes;
    this.state.gameOver = restored.gameOver;
    this.state.victory = restored.victory;
    this.state.waveEnemiesRemaining = restored.waveEnemiesRemaining;
    this.state.selectedId = restored.selectedId;
    this.state.selectedKind = restored.selectedKind;

    this.startedWaves.clear();
    for (const wave of snapshot.startedWaves) {
      this.startedWaves.add(wave);
    }
    this.processedAfterWaveEvents.clear();
    for (const wave of snapshot.processedAfterWaveEvents) {
      this.processedAfterWaveEvents.add(wave);
    }
    this.nextDefenseId = snapshot.nextDefenseId;
    this.nextSquadId = snapshot.nextSquadId;
    this.accumulatorMs = 0;
    this.waveSpawner = new WaveSpawner(this.data.waves, this.data.enemies, new Pathfinder(this.state.nodes, this.state.edges));
  }

  private cloneState(state: GameState): GameState {
    return {
      ...state,
      resources: { ...state.resources },
      nodes: new Map([...state.nodes.entries()].map(([id, node]) => [id, { ...node }])),
      edges: new Map([...state.edges.entries()].map(([id, edge]) => [id, { ...edge }])),
      enemies: state.enemies.map((enemy) => ({ ...enemy, pathEdges: [...enemy.pathEdges] })),
      squads: state.squads.map((squad) => ({ ...squad })),
      defenses: state.defenses.map((defense) => ({ ...defense })),
      samples: new Map(state.samples),
      unlockedAdaptations: new Set(state.unlockedAdaptations),
      foreshadowEvents: state.foreshadowEvents.map((event) => ({ ...event })),
    };
  }

  private initialState(map: MapData, tuning: TuningData): GameState {
    const nodes = new Map<string, NodeState>(
      map.nodes.map((node) => [
        node.id,
        {
          ...node,
          upgradeLevel: 0,
          contaminated: false,
          contaminationLevel: 0,
        },
      ]),
    );
    const edges = new Map<string, EdgeState>(
      map.edges.map((edge) => [
        edge.id,
        {
          ...edge,
          contaminated: false,
        },
      ]),
    );
    const queen = [...nodes.values()].find((node) => node.type === "queen");

    return {
      phase: "scout",
      act: 1,
      wave: 1,
      tick: 0,
      phaseTick: 0,
      resources: { ...tuning.startingResources },
      nodes,
      edges,
      enemies: [],
      squads: [],
      defenses: [],
      queenHp: queen?.hp ?? 0,
      queenMaxHp: queen?.maxHp ?? 0,
      samples: new Map(),
      unlockedAdaptations: new Set(),
      foreshadowEvents: [],
      breachTriggered: false,
      deepNodesVisible: false,
      claimedDeepNodes: false,
      gameOver: false,
      victory: false,
      waveEnemiesRemaining: 0,
      selectedId: null,
      selectedKind: null,
    };
  }
}

const MAX_FIXED_STEPS_PER_CALL = 5;
