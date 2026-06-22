import { ResourceManager } from "./ResourceManager";
import type { DefenseData, EnemyData, TuningData, UnitData } from "../types/data";
import type { DefenseInstance, EnemyInstance, GameState, SquadInstance } from "../types/game";
import type { SimEvent } from "../types/events";

export class CombatResolver {
  constructor(
    private readonly enemies: EnemyData[],
    private readonly defenses: DefenseData[],
    private readonly resourceManager = new ResourceManager(),
    private readonly speedScale = 1,
    private readonly units: UnitData[] = [],
    private readonly tuning?: Pick<TuningData, "squadRetaliationDpsMultiplier" | "squadPanicRetreatTicks">,
  ) {}

  tick(state: GameState, deltaMs: number): SimEvent[] {
    const events: SimEvent[] = [];
    this.moveEnemies(state, deltaMs, events);
    this.resetEnemySlows(state);
    this.resolveDefenses(state, deltaMs, events);
    this.resolveSquads(state, deltaMs, events);
    this.tickDots(state, events);
    return events;
  }

  private moveEnemies(state: GameState, deltaMs: number, events: SimEvent[]): void {
    for (const enemy of [...state.enemies]) {
      const edge = state.edges.get(enemy.edgeId);
      if (!edge) {
        continue;
      }

      enemy.progress += (enemy.speed * this.speedScale * enemy.slowFactor * deltaMs) / (edge.length * 1000);
      if (enemy.progress < 1) {
        continue;
      }

      enemy.pathEdges.shift();
      if (enemy.pathEdges.length > 0) {
        enemy.edgeId = enemy.pathEdges[0]!;
        enemy.progress = 0;
        continue;
      }

      this.enemyReachedGoal(state, enemy, events);
    }
  }

  private resetEnemySlows(state: GameState): void {
    for (const enemy of state.enemies) {
      enemy.slowFactor = 1;
    }
  }

  private resolveDefenses(state: GameState, deltaMs: number, events: SimEvent[]): void {
    for (const defense of state.defenses) {
      const defenseData = this.defenses.find((entry) => entry.id === defense.typeId);
      if (!defenseData) {
        continue;
      }

      if (defense.typeId === "resin_barricade") {
        this.applyResin(state, defense, defenseData);
      } else if (defense.typeId === "guard_post") {
        this.applyGuardPost(state, defense, defenseData, deltaMs, events);
      } else if (defense.typeId === "acid_sprayer") {
        this.applyAcidSprayer(state, defense, defenseData, deltaMs, events);
      } else if (defense.typeId === "spore_scrubber") {
        this.applySporeScrubber(state, defense, defenseData, deltaMs);
      }
    }
  }

  private applyResin(state: GameState, defense: DefenseInstance, defenseData: DefenseData): void {
    if (!defense.edgeId) {
      return;
    }

    for (const enemy of state.enemies) {
      const enemyData = this.enemyData(enemy);
      if (enemy.edgeId === defense.edgeId && !enemyData?.tags.includes("ignores_resin")) {
        enemy.slowFactor = defenseData.effects.slowFactor ?? 1;
      }
    }
  }

  private applyGuardPost(
    state: GameState,
    defense: DefenseInstance,
    defenseData: DefenseData,
    deltaMs: number,
    events: SimEvent[],
  ): void {
    if (!defense.nodeId) {
      return;
    }

    const damagePerTick = (defenseData.effects.dps ?? 0) * (deltaMs / 1000);
    let fired = false;
    for (const enemy of [...state.enemies]) {
      if (!this.enemyInNodeRange(state, enemy, defense.nodeId)) {
        continue;
      }

      enemy.hp -= Math.max(0, damagePerTick - enemy.armor);
      fired = true;
      if (enemy.hp <= 0) {
        this.killEnemy(state, enemy, events);
      }
    }

    if (fired && this.shouldEmitDefenseFired(state.tick, deltaMs)) {
      events.push({ type: "DEFENSE_FIRED", tick: state.tick, defenseId: defense.id, nodeId: defense.nodeId });
    }
  }

  private applyAcidSprayer(
    state: GameState,
    defense: DefenseInstance,
    defenseData: DefenseData,
    deltaMs: number,
    events: SimEvent[],
  ): void {
    if (!defense.nodeId) {
      return;
    }

    defense.cooldownTicksRemaining -= 1;
    if (defense.cooldownTicksRemaining > 0) {
      return;
    }

    const ticksPerSecond = 1000 / deltaMs;
    const dps = defenseData.effects.dps ?? 0;
    const dotDuration = defenseData.effects.dotDuration ?? 0;
    let fired = false;
    for (const enemy of state.enemies) {
      if (!this.enemyInNodeRange(state, enemy, defense.nodeId)) {
        continue;
      }

      enemy.dotDamage = Math.max(0, dps - enemy.armor) / ticksPerSecond;
      enemy.dotTicksRemaining = dotDuration * ticksPerSecond;
      fired = true;
    }

    defense.cooldownTicksRemaining = defenseData.effects.cooldownTicks ?? 1;
    if (fired) {
      events.push({ type: "DEFENSE_FIRED", tick: state.tick, defenseId: defense.id, nodeId: defense.nodeId });
    }
  }

  private applySporeScrubber(
    state: GameState,
    defense: DefenseInstance,
    defenseData: DefenseData,
    deltaMs: number,
  ): void {
    if (!defense.nodeId) {
      return;
    }

    const node = state.nodes.get(defense.nodeId);
    if (!node || node.contaminationLevel <= 0) {
      return;
    }

    const cleanAmount = (defenseData.effects.cleanRatePerTick ?? 0) * (deltaMs / 1000);
    node.contaminationLevel = Math.max(0, node.contaminationLevel - cleanAmount);
    node.contaminated = node.contaminationLevel > 0;
  }

  private tickDots(state: GameState, events: SimEvent[]): void {
    for (const enemy of [...state.enemies]) {
      if (enemy.dotTicksRemaining <= 0) {
        continue;
      }

      enemy.hp -= enemy.dotDamage;
      enemy.dotTicksRemaining -= 1;
      if (enemy.hp <= 0) {
        this.killEnemy(state, enemy, events);
      }
    }
  }

  private resolveSquads(state: GameState, deltaMs: number, events: SimEvent[]): void {
    for (const squad of state.squads) {
      squad.inCombat = false;
    }

    for (const squad of [...state.squads]) {
      const unit = this.unitData(squad);
      if (!unit) {
        continue;
      }

      const enemiesAtLocation = state.enemies.filter((enemy) => this.squadCanReachEnemy(state, squad, enemy));
      if (enemiesAtLocation.length === 0) {
        continue;
      }

      squad.inCombat = true;
      const damage = unit.attack * squad.count * (deltaMs / 1000);
      for (const enemy of [...enemiesAtLocation]) {
        if (!state.enemies.includes(enemy)) {
          continue;
        }

        enemy.hp -= damage;
        if (enemy.hp <= 0) {
          this.killEnemy(state, enemy, events);
        }
      }

      const livingEnemies = state.enemies.filter((enemy) => this.squadCanReachEnemy(state, squad, enemy));
      if (livingEnemies.length === 0) {
        continue;
      }

      squad.hp -= unit.attack * this.squadRetaliationMultiplier() * (deltaMs / 1000) * livingEnemies.length;
      if (squad.hp <= 0) {
        this.panicSquad(state, squad, events);
      }
    }
  }

  private enemyReachedGoal(state: GameState, enemy: EnemyInstance, events: SimEvent[]): void {
    const targetNode = state.nodes.get(enemy.targetNodeId);
    const enemyData = this.enemyData(enemy);
    if (targetNode) {
      targetNode.hp = Math.max(0, targetNode.hp - enemy.attack);
      events.push({
        type: "NODE_DAMAGED",
        tick: state.tick,
        enemyId: enemy.id,
        enemyTypeId: enemy.typeId,
        nodeId: targetNode.id,
        payload: { damage: enemy.attack },
      });

      if (targetNode.id === "queen_chamber") {
        state.queenHp = Math.max(0, state.queenHp - enemy.attack);
        events.push({
          type: "QUEEN_HIT",
          tick: state.tick,
          enemyId: enemy.id,
          enemyTypeId: enemy.typeId,
          nodeId: targetNode.id,
          payload: { damage: enemy.attack },
        });
      }

      if (enemyData?.tags.includes("causes_panic")) {
        this.panicNearbySquads(state, targetNode.id, 2, "causes_panic", events);
      } else if (enemyData?.tags.includes("disrupts_squads") && enemyData.onReach === "panic_nearby_squads") {
        this.panicNearbySquads(state, targetNode.id, 1, "panic_nearby_squads", events);
      }
    }

    events.push({ type: "ENEMY_REACHED_GOAL", tick: state.tick, enemyId: enemy.id, enemyTypeId: enemy.typeId });
    this.removeEnemy(state, enemy);
    this.decrementRemaining(state);

    if (state.queenHp <= 0) {
      state.gameOver = true;
      events.push({ type: "GAME_OVER", tick: state.tick });
    }
  }

  private killEnemy(state: GameState, enemy: EnemyInstance, events: SimEvent[]): void {
    if (!state.enemies.includes(enemy)) {
      return;
    }

    this.contaminateCurrentNodeOnDeath(state, enemy, events);
    this.removeEnemy(state, enemy);
    this.decrementRemaining(state);
    this.resourceManager.grant(state, this.enemyData(enemy)?.reward ?? {});
    events.push({ type: "ENEMY_DIED", tick: state.tick, enemyId: enemy.id, enemyTypeId: enemy.typeId });
  }

  private contaminateCurrentNodeOnDeath(state: GameState, enemy: EnemyInstance, events: SimEvent[]): void {
    if (this.enemyData(enemy)?.onDeath !== "contaminate_node") {
      return;
    }

    const nodeId = this.currentNodeId(state, enemy);
    const node = nodeId ? state.nodes.get(nodeId) : undefined;
    if (!node) {
      return;
    }

    node.contaminationLevel = 1.0;
    node.contaminated = true;
    events.push({
      type: "NODE_CONTAMINATED",
      tick: state.tick,
      enemyId: enemy.id,
      enemyTypeId: enemy.typeId,
      nodeId: node.id,
      payload: { nodeId: node.id },
    });
  }

  private currentNodeId(state: GameState, enemy: EnemyInstance): string | null {
    const edge = state.edges.get(enemy.edgeId);
    if (!edge) {
      return enemy.targetNodeId;
    }

    return enemy.progress >= 0.5 ? edge.nodeB : edge.nodeA;
  }

  private enemyInNodeRange(state: GameState, enemy: EnemyInstance, nodeId: string): boolean {
    const edge = state.edges.get(enemy.edgeId);
    return edge?.nodeA === nodeId || edge?.nodeB === nodeId;
  }

  private squadCanReachEnemy(state: GameState, squad: SquadInstance, enemy: EnemyInstance): boolean {
    if (squad.assignedEdgeId) {
      return squad.assignedEdgeId === enemy.edgeId;
    }

    return Boolean(squad.assignedNodeId && this.enemyInNodeRange(state, enemy, squad.assignedNodeId));
  }

  private panicNearbySquads(
    state: GameState,
    nodeId: string,
    radiusHops: number,
    source: "panic_nearby_squads" | "causes_panic",
    events: SimEvent[],
  ): void {
    if (!this.tuning) {
      return;
    }

    for (const squad of state.squads) {
      if (!this.squadWithinHopsOfNode(state, squad, nodeId, radiusHops)) {
        continue;
      }

      squad.previousStance ??= squad.stance;
      squad.stance = "retreat";
      squad.panicTicksRemaining = this.tuning.squadPanicRetreatTicks;
      events.push({
        type: "SQUAD_PANICKED",
        tick: state.tick,
        nodeId,
        payload: { squadId: squad.id, unitTypeId: squad.typeId, source },
      });
    }
  }

  private squadWithinHopsOfNode(state: GameState, squad: SquadInstance, nodeId: string, radiusHops: number): boolean {
    if (squad.assignedNodeId) {
      return this.nodeDistance(state, nodeId, squad.assignedNodeId) <= radiusHops;
    }

    if (squad.assignedEdgeId) {
      const edge = state.edges.get(squad.assignedEdgeId);
      if (!edge) {
        return false;
      }

      const edgeRadius = Math.max(0, radiusHops - 1);
      return this.nodeDistance(state, nodeId, edge.nodeA) <= edgeRadius || this.nodeDistance(state, nodeId, edge.nodeB) <= edgeRadius;
    }

    return false;
  }

  private nodeDistance(state: GameState, fromNodeId: string, toNodeId: string): number {
    if (fromNodeId === toNodeId) {
      return 0;
    }

    const visited = new Set<string>([fromNodeId]);
    const queue: Array<{ nodeId: string; distance: number }> = [{ nodeId: fromNodeId, distance: 0 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of state.edges.values()) {
        if (!edge.visible || (edge.nodeA !== current.nodeId && edge.nodeB !== current.nodeId)) {
          continue;
        }

        const nextNodeId = edge.nodeA === current.nodeId ? edge.nodeB : edge.nodeA;
        if (visited.has(nextNodeId)) {
          continue;
        }

        if (nextNodeId === toNodeId) {
          return current.distance + 1;
        }

        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, distance: current.distance + 1 });
      }
    }

    return Number.POSITIVE_INFINITY;
  }

  private enemyData(enemy: EnemyInstance): EnemyData | undefined {
    return this.enemies.find((entry) => entry.id === enemy.typeId);
  }

  private unitData(squad: SquadInstance): UnitData | undefined {
    return this.units.find((entry) => entry.id === squad.typeId);
  }

  private squadRetaliationMultiplier(): number {
    return this.tuning?.squadRetaliationDpsMultiplier ?? 0;
  }

  private panicSquad(state: GameState, squad: SquadInstance, events: SimEvent[]): void {
    const index = state.squads.indexOf(squad);
    if (index < 0) {
      return;
    }

    state.squads.splice(index, 1);
    events.push({
      type: "SQUAD_PANICKED",
      tick: state.tick,
      payload: { squadId: squad.id, unitTypeId: squad.typeId },
    });
  }

  private shouldEmitDefenseFired(tick: number, deltaMs: number): boolean {
    const ticksPerSecond = Math.max(1, Math.round(1000 / deltaMs));
    return tick % ticksPerSecond === 0;
  }

  private removeEnemy(state: GameState, enemy: EnemyInstance): void {
    const index = state.enemies.indexOf(enemy);
    if (index >= 0) {
      state.enemies.splice(index, 1);
    }
  }

  private decrementRemaining(state: GameState): void {
    state.waveEnemiesRemaining = Math.max(0, state.waveEnemiesRemaining - 1);
  }
}
