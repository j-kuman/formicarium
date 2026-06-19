import type { EdgeState, NodeState } from "../types/game";

export class Pathfinder {
  constructor(
    private readonly nodes: Map<string, NodeState>,
    private readonly edges: Map<string, EdgeState>,
  ) {}

  findPath(startNodeId: string, goalNodeId: string): string[] {
    if (!this.nodes.has(startNodeId) || !this.nodes.has(goalNodeId)) {
      return [];
    }
    if (startNodeId === goalNodeId) {
      return [];
    }

    const visited = new Set<string>([startNodeId]);
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startNodeId, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      for (const edge of this.edges.values()) {
        if (edge.nodeA !== current.nodeId && edge.nodeB !== current.nodeId) {
          continue;
        }

        const nextNodeId = this.getOtherNode(edge, current.nodeId);
        if (visited.has(nextNodeId)) {
          continue;
        }

        const nextPath = [...current.path, edge.id];
        if (nextNodeId === goalNodeId) {
          return nextPath;
        }

        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, path: nextPath });
      }
    }

    return [];
  }

  getOtherNode(edge: EdgeState, fromNodeId: string): string {
    if (edge.nodeA === fromNodeId) {
      return edge.nodeB;
    }
    if (edge.nodeB === fromNodeId) {
      return edge.nodeA;
    }
    throw new Error(`Node ${fromNodeId} is not connected to edge ${edge.id}`);
  }

  resolveTarget(priority: string[], nodes: Map<string, NodeState>): string | null {
    for (const alias of priority) {
      for (const node of nodes.values()) {
        if (node.visible && node.type === alias) {
          return node.id;
        }
      }
    }
    return null;
  }
}
