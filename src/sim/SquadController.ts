import { Pathfinder } from "./Pathfinder";
import type { TuningData, UnitData } from "../types/data";
import type { EdgeState, EnemyInstance, GameState, SquadInstance } from "../types/game";
import type { SimEvent } from "../types/events";

export class SquadController {
  constructor(
    private readonly units: UnitData[],
    private readonly pathfinder: Pathfinder,
    private readonly tuning: TuningData,
  ) {}

  tick(state: GameState, deltaMs: number): SimEvent[] {
    for (const squad of state.squads) {
      this.tickPanic(squad);

      if (squad.stance === "intercept") {
        this.intercept(state, squad);
      } else if (squad.stance === "retreat") {
        this.retreat(state, squad);
      } else if (squad.stance === "repair") {
        this.repair(state, squad, deltaMs);
      } else if (squad.stance === "patrol") {
        this.patrol(state, squad);
      }
    }

    return [];
  }

  private tickPanic(squad: SquadInstance): void {
    if (!squad.panicTicksRemaining || squad.panicTicksRemaining <= 0) {
      return;
    }

    squad.panicTicksRemaining -= 1;
    squad.stance = "retreat";

    if (squad.panicTicksRemaining <= 0 && squad.previousStance) {
      squad.stance = squad.previousStance;
      squad.previousStance = undefined;
    }
  }

  private intercept(state: GameState, squad: SquadInstance): void {
    const target = state.enemies.find((enemy) => this.enemyWithinOneHop(state, squad, enemy));
    if (!target) {
      return;
    }

    squad.assignedEdgeId = target.edgeId;
    squad.assignedNodeId = null;
  }

  private retreat(state: GameState, squad: SquadInstance): void {
    const startNodeId = this.squadNodeForRetreat(state, squad);
    if (!startNodeId || startNodeId === QUEEN_NODE_ID) {
      return;
    }

    const path = this.pathfinder.findPath(startNodeId, QUEEN_NODE_ID);
    const nextEdge = path.length > 0 ? state.edges.get(path[0]!) : null;
    if (!nextEdge) {
      return;
    }

    squad.assignedNodeId = this.pathfinder.getOtherNode(nextEdge, startNodeId);
    squad.assignedEdgeId = null;
  }

  private repair(state: GameState, squad: SquadInstance, deltaMs: number): void {
    if (state.phase !== "recovery" || !squad.assignedNodeId) {
      return;
    }

    const unit = this.unitData(squad);
    const repairRate = unit?.repairRatePerTick ?? 0;
    const node = state.nodes.get(squad.assignedNodeId);
    if (!node || repairRate <= 0) {
      return;
    }

    node.hp = Math.min(node.maxHp, node.hp + repairRate * squad.count * (deltaMs / 1000));
  }

  private patrol(state: GameState, squad: SquadInstance): void {
    if (!squad.assignedNodeId || this.tuning.patrolIntervalTicks <= 0 || state.tick === 0) {
      return;
    }

    squad.patrolAnchorNodeId ??= squad.assignedNodeId;
    squad.patrolTargetNodeId ??= this.firstAdjacentNode(state, squad.patrolAnchorNodeId);
    if (!squad.patrolTargetNodeId || state.tick % this.tuning.patrolIntervalTicks !== 0) {
      return;
    }

    squad.assignedNodeId =
      squad.assignedNodeId === squad.patrolAnchorNodeId ? squad.patrolTargetNodeId : squad.patrolAnchorNodeId;
    squad.assignedEdgeId = null;
  }

  private enemyWithinOneHop(state: GameState, squad: SquadInstance, enemy: EnemyInstance): boolean {
    if (squad.assignedEdgeId) {
      return this.edgesShareNode(state, squad.assignedEdgeId, enemy.edgeId);
    }

    if (!squad.assignedNodeId) {
      return false;
    }

    const enemyEdge = state.edges.get(enemy.edgeId);
    if (!enemyEdge) {
      return false;
    }

    if (enemyEdge.nodeA === squad.assignedNodeId || enemyEdge.nodeB === squad.assignedNodeId) {
      return true;
    }

    return this.adjacentNodeIds(state, squad.assignedNodeId).some((nodeId) => {
      return enemyEdge.nodeA === nodeId || enemyEdge.nodeB === nodeId;
    });
  }

  private squadNodeForRetreat(state: GameState, squad: SquadInstance): string | null {
    if (squad.assignedNodeId) {
      return squad.assignedNodeId;
    }

    if (!squad.assignedEdgeId) {
      return null;
    }

    const edge = state.edges.get(squad.assignedEdgeId);
    if (!edge) {
      return null;
    }

    const pathA = this.pathfinder.findPath(edge.nodeA, QUEEN_NODE_ID);
    const pathB = this.pathfinder.findPath(edge.nodeB, QUEEN_NODE_ID);
    if (edge.nodeA === QUEEN_NODE_ID || (pathA.length > 0 && (pathB.length === 0 || pathA.length <= pathB.length))) {
      return edge.nodeA;
    }
    return edge.nodeB;
  }

  private firstAdjacentNode(state: GameState, nodeId: string): string | undefined {
    return this.adjacentNodeIds(state, nodeId)[0];
  }

  private adjacentNodeIds(state: GameState, nodeId: string): string[] {
    const adjacent: string[] = [];
    for (const edge of state.edges.values()) {
      if (!edge.visible || (edge.nodeA !== nodeId && edge.nodeB !== nodeId)) {
        continue;
      }

      adjacent.push(this.pathfinder.getOtherNode(edge, nodeId));
    }
    return adjacent;
  }

  private edgesShareNode(state: GameState, firstEdgeId: string, secondEdgeId: string): boolean {
    if (firstEdgeId === secondEdgeId) {
      return true;
    }

    const first = state.edges.get(firstEdgeId);
    const second = state.edges.get(secondEdgeId);
    if (!first || !second) {
      return false;
    }

    return edgeNodes(first).some((nodeId) => edgeNodes(second).includes(nodeId));
  }

  private unitData(squad: SquadInstance): UnitData | undefined {
    return this.units.find((unit) => unit.id === squad.typeId);
  }
}

function edgeNodes(edge: EdgeState): [string, string] {
  return [edge.nodeA, edge.nodeB];
}

const QUEEN_NODE_ID = "queen_chamber";
