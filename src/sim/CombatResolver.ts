import { ResourceManager } from "./ResourceManager";
import type { DefenseData, EnemyData } from "../types/data";
import type { DefenseInstance, EnemyInstance, GameState } from "../types/game";
import type { SimEvent } from "../types/events";

export class CombatResolver {
  constructor(
    private readonly enemies: EnemyData[],
    private readonly defenses: DefenseData[],
    private readonly resourceManager = new ResourceManager(),
    private readonly speedScale = 1,
  ) {}

  tick(state: GameState, deltaMs: number): SimEvent[] {
    const events: SimEvent[] = [];
    this.moveEnemies(state, deltaMs, events);
    this.resetEnemySlows(state);
    this.resolveDefenses(state, deltaMs, events);
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

  private enemyReachedGoal(state: GameState, enemy: EnemyInstance, events: SimEvent[]): void {
    const targetNode = state.nodes.get(enemy.targetNodeId);
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

    this.removeEnemy(state, enemy);
    this.decrementRemaining(state);
    this.resourceManager.grant(state, this.enemyData(enemy)?.reward ?? {});
    events.push({ type: "ENEMY_DIED", tick: state.tick, enemyId: enemy.id, enemyTypeId: enemy.typeId });
  }

  private enemyInNodeRange(state: GameState, enemy: EnemyInstance, nodeId: string): boolean {
    const edge = state.edges.get(enemy.edgeId);
    return edge?.nodeA === nodeId || edge?.nodeB === nodeId;
  }

  private enemyData(enemy: EnemyInstance): EnemyData | undefined {
    return this.enemies.find((entry) => entry.id === enemy.typeId);
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
