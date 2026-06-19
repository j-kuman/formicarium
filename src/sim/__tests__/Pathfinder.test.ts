import { describe, expect, it } from "vitest";

import { Pathfinder } from "../Pathfinder";
import type { EdgeState, NodeState } from "../../types/game";

describe("Pathfinder", () => {
  it("finds direct path between adjacent nodes", () => {
    const { pathfinder } = buildGraph();

    expect(pathfinder.findPath("entrance", "junction_a")).toEqual(["edge_entrance_a"]);
  });

  it("finds multi-hop path", () => {
    const { pathfinder } = buildGraph();

    expect(pathfinder.findPath("entrance", "queen_chamber")).toEqual(["edge_entrance_a", "edge_a_queen"]);
  });

  it("returns empty array when no path exists", () => {
    const { edges, nodes } = buildGraph();
    const pathfinder = new Pathfinder(nodes, new Map([...edges].filter(([id]) => id !== "edge_a_queen")));

    expect(pathfinder.findPath("entrance", "queen_chamber")).toEqual([]);
  });

  it("getOtherNode returns correct endpoint", () => {
    const { edges, pathfinder } = buildGraph();

    expect(pathfinder.getOtherNode(edges.get("edge_entrance_a")!, "entrance")).toBe("junction_a");
    expect(pathfinder.getOtherNode(edges.get("edge_entrance_a")!, "junction_a")).toBe("entrance");
  });

  it("resolveTarget picks first matching node type from priority list", () => {
    const { nodes, pathfinder } = buildGraph();

    expect(pathfinder.resolveTarget(["food", "queen"], nodes)).toBe("food_store");
  });

  it("resolveTarget maps a type alias to the concrete node id", () => {
    const { nodes, pathfinder } = buildGraph();

    expect(pathfinder.resolveTarget(["queen"], nodes)).toBe("queen_chamber");
  });

  it("resolveTarget tiebreak is deterministic by insertion order", () => {
    const { nodes, pathfinder } = buildGraph();

    expect(pathfinder.resolveTarget(["junction"], nodes)).toBe("junction_a");
  });

  it("resolveTarget skips invisible nodes", () => {
    const { pathfinder } = buildGraph();
    const nodes = new Map<string, NodeState>([
      ["hidden_queen", node("hidden_queen", "queen", false)],
      ["queen_chamber", node("queen_chamber", "queen", true)],
    ]);

    expect(pathfinder.resolveTarget(["queen"], nodes)).toBe("queen_chamber");
  });

  it("resolveTarget returns null when no alias matches any visible node", () => {
    const { nodes, pathfinder } = buildGraph();

    expect(pathfinder.resolveTarget(["study"], nodes)).toBeNull();
  });
});

function buildGraph() {
  const nodes = new Map<string, NodeState>([
    ["entrance", node("entrance", "entrance")],
    ["junction_a", node("junction_a", "junction")],
    ["junction_b", node("junction_b", "junction")],
    ["food_store", node("food_store", "food")],
    ["queen_chamber", node("queen_chamber", "queen")],
  ]);
  const edges = new Map<string, EdgeState>([
    ["edge_entrance_a", edge("edge_entrance_a", "entrance", "junction_a")],
    ["edge_a_queen", edge("edge_a_queen", "junction_a", "queen_chamber")],
    ["edge_b_food", edge("edge_b_food", "junction_b", "food_store")],
  ]);

  return { edges, nodes, pathfinder: new Pathfinder(nodes, edges) };
}

function node(id: string, type: NodeState["type"], visible = true): NodeState {
  return {
    id,
    type,
    hp: 100,
    maxHp: 100,
    x: 0,
    y: 0,
    visible,
    defenseSlots: 0,
    squadSlot: false,
    upgradeLevel: 0,
    contaminated: false,
    contaminationLevel: 0,
  };
}

function edge(id: string, nodeA: string, nodeB: string): EdgeState {
  return {
    id,
    nodeA,
    nodeB,
    width: "large",
    length: 100,
    visible: true,
    defenseSlots: 0,
    hp: 100,
    maxHp: 100,
    contaminated: false,
  };
}
