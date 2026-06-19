import { Pathfinder } from "./Pathfinder";
import type { EnemyData, WaveData, WaveSpawn } from "../types/data";
import type { GameState, EnemyInstance } from "../types/game";
import type { SimEvent } from "../types/events";

interface SpawnQueueEntry {
  waveNumber: number;
  enemyTypeId: string;
  entranceNodeId: string;
  targetAlias: string;
  spawnAtTick: number;
}

export class WaveSpawner {
  private readonly spawnQueue: SpawnQueueEntry[] = [];
  private readonly startedWaves = new Set<number>();
  private nextEnemyId = 1;

  constructor(
    private readonly waves: WaveData[],
    private readonly enemies: EnemyData[],
    private readonly pathfinder: Pathfinder,
  ) {}

  startWave(state: GameState, waveNumber: number): SimEvent[] {
    const wave = this.waves.find((entry) => entry.wave === waveNumber);
    if (!wave) {
      state.waveEnemiesRemaining = 0;
      return [];
    }

    state.waveEnemiesRemaining = wave.spawns.reduce((total, spawn) => total + spawn.count, 0);
    for (const spawn of wave.spawns) {
      this.enqueueSpawn(state.tick, waveNumber, spawn);
    }
    return [];
  }

  tick(state: GameState): SimEvent[] {
    const events: SimEvent[] = [];
    const dueEntries = this.spawnQueue.filter((entry) => state.tick >= entry.spawnAtTick);

    for (const entry of dueEntries) {
      if (!this.startedWaves.has(entry.waveNumber)) {
        this.startedWaves.add(entry.waveNumber);
        events.push({ type: "WAVE_STARTED", tick: state.tick, wave: entry.waveNumber });
      }

      const enemy = this.createEnemy(state, entry);
      if (enemy) {
        state.enemies.push(enemy);
      }
      this.removeQueueEntry(entry);
    }

    return events;
  }

  private enqueueSpawn(currentTick: number, waveNumber: number, spawn: WaveSpawn): void {
    for (let spawnIndex = 0; spawnIndex < spawn.count; spawnIndex += 1) {
      this.spawnQueue.push({
        waveNumber,
        enemyTypeId: spawn.enemy,
        entranceNodeId: spawn.entrance,
        targetAlias: spawn.target,
        spawnAtTick: currentTick + spawn.intervalTicks * spawnIndex,
      });
    }
  }

  private createEnemy(state: GameState, entry: SpawnQueueEntry): EnemyInstance | null {
    const enemyData = this.enemies.find((enemy) => enemy.id === entry.enemyTypeId);
    if (!enemyData) {
      return null;
    }

    const targetNodeId = this.pathfinder.resolveTarget([entry.targetAlias], state.nodes) ?? "queen_chamber";
    const pathEdges = this.pathfinder.findPath(entry.entranceNodeId, targetNodeId);

    return {
      id: `enemy_${this.nextEnemyId++}`,
      typeId: enemyData.id,
      hp: enemyData.hp,
      maxHp: enemyData.hp,
      edgeId: pathEdges[0] ?? "",
      progress: 0,
      pathEdges,
      targetNodeId,
      attack: enemyData.attack,
      armor: enemyData.armor,
      speed: enemyData.speed,
      slowFactor: 1,
      dotDamage: 0,
      dotTicksRemaining: 0,
      act: enemyData.act === 2 ? 2 : 1,
    };
  }

  private removeQueueEntry(entry: SpawnQueueEntry): void {
    const index = this.spawnQueue.indexOf(entry);
    if (index >= 0) {
      this.spawnQueue.splice(index, 1);
    }
  }
}
