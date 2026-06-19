import { BreachController } from "./BreachController";
import { CombatResolver } from "./CombatResolver";
import { Pathfinder } from "./Pathfinder";
import { PhaseController } from "./PhaseController";
import { ResourceManager } from "./ResourceManager";
import { WaveSpawner } from "./WaveSpawner";
import type { InputCommand } from "../types/commands";
import type { ChamberData, DefenseData, EnemyData, MapData, TuningData, UnitData, WaveData } from "../types/data";
import type { DefenseInstance, EdgeState, GameState, NodeState } from "../types/game";
import type { SimEvent } from "../types/events";

interface GameSimData {
  tuning: TuningData;
  map: MapData;
  waves: WaveData[];
  enemies: EnemyData[];
  defenses: DefenseData[];
  chambers: ChamberData[];
  units: UnitData[];
}

export class GameSim {
  private readonly state: GameState;
  private readonly tuning: TuningData;
  private readonly phaseController: PhaseController;
  private readonly resourceManager: ResourceManager;
  private readonly waveSpawner: WaveSpawner;
  private readonly combatResolver: CombatResolver;
  private readonly breachController: BreachController;
  private accumulatorMs = 0;
  private nextDefenseId = 1;
  private readonly startedWaves = new Set<number>();
  private readonly processedAfterWaveEvents = new Set<number>();

  constructor(private readonly data: GameSimData) {
    this.tuning = data.tuning;
    this.state = this.initialState(data.map, data.tuning);

    const pathfinder = new Pathfinder(this.state.nodes, this.state.edges);
    this.phaseController = new PhaseController(data.waves);
    this.resourceManager = new ResourceManager();
    this.waveSpawner = new WaveSpawner(data.waves, data.enemies, pathfinder);
    this.combatResolver = new CombatResolver(
      data.enemies,
      data.defenses,
      this.resourceManager,
      data.tuning.enemySpeedScale ?? 1,
    );
    this.breachController = new BreachController(data.waves, data.tuning);

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

  private fixedStep(commands: InputCommand[], deltaMs: number): SimEvent[] {
    const events: SimEvent[] = [];
    this.processCommands(commands);

    const phaseEvents = this.phaseController.tick(this.state, commands, this.tuning);
    events.push(...phaseEvents);
    this.startWaveIfNeeded(events);

    events.push(...this.waveSpawner.tick(this.state));
    events.push(...this.combatResolver.tick(this.state, deltaMs));
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

  private startWaveIfNeeded(events: SimEvent[]): void {
    if (this.state.phase !== "wave" || this.startedWaves.has(this.state.wave)) {
      return;
    }

    this.startedWaves.add(this.state.wave);
    events.push(...this.breachController.onWaveStart(this.state, this.state.wave));
    events.push(...this.waveSpawner.startWave(this.state, this.state.wave));
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
