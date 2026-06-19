import Phaser from "phaser";

import type { EdgeState, GameState, NodeState } from "../types/game";

type EdgeNode = Pick<NodeState, "x" | "y">;

export function getEdgeControlPoint(
  edge: EdgeState,
  nodeA: EdgeNode,
  nodeB: EdgeNode,
): Phaser.Math.Vector2 {
  const midpointX = (nodeA.x + nodeB.x) / 2;
  const midpointY = (nodeA.y + nodeB.y) / 2;
  const dx = nodeB.x - nodeA.x;
  const dy = nodeB.y - nodeA.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = edge.width === "large" ? 18 : 12;

  return new Phaser.Math.Vector2(midpointX - (dy / length) * offset, midpointY + (dx / length) * offset);
}

export function getPointOnEdge(
  edge: EdgeState,
  nodeA: EdgeNode,
  nodeB: EdgeNode,
  progress: number,
): Phaser.Math.Vector2 {
  const t = Phaser.Math.Clamp(progress, 0, 1);
  const control = getEdgeControlPoint(edge, nodeA, nodeB);
  const inverse = 1 - t;
  const x = inverse * inverse * nodeA.x + 2 * inverse * t * control.x + t * t * nodeB.x;
  const y = inverse * inverse * nodeA.y + 2 * inverse * t * control.y + t * t * nodeB.y;

  return new Phaser.Math.Vector2(x, y);
}

export function getPointOnStateEdge(
  state: Readonly<GameState>,
  edgeId: string,
  progress: number,
): Phaser.Math.Vector2 {
  const edge = state.edges.get(edgeId);
  if (!edge) {
    return new Phaser.Math.Vector2(0, 0);
  }

  const nodeA = state.nodes.get(edge.nodeA);
  const nodeB = state.nodes.get(edge.nodeB);
  if (!nodeA || !nodeB) {
    return new Phaser.Math.Vector2(0, 0);
  }

  return getPointOnEdge(edge, nodeA, nodeB, progress);
}

export function getEdgeMidpoint(state: Readonly<GameState>, edgeId: string): Phaser.Math.Vector2 {
  return getPointOnStateEdge(state, edgeId, 0.5);
}
