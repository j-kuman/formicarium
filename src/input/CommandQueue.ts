import type { InputCommand } from "../types/commands";

export class CommandQueue {
  private readonly commands: InputCommand[] = [];
  private placementDefenseTypeId: string | null = null;
  private placementSquadRequest: { unitTypeId: string; count: number } | null = null;

  push(command: InputCommand): void {
    this.commands.push(command);
  }

  flush(): InputCommand[] {
    const flushed = this.commands.slice();
    this.commands.length = 0;
    return flushed;
  }

  startPlacement(defenseTypeId: string): void {
    this.placementDefenseTypeId = defenseTypeId;
    this.placementSquadRequest = null;
  }

  finishPlacement(): void {
    this.placementDefenseTypeId = null;
    this.placementSquadRequest = null;
  }

  getPlacementDefenseTypeId(): string | null {
    return this.placementDefenseTypeId;
  }

  startSquadPlacement(unitTypeId: string, count: number): void {
    this.placementSquadRequest = { unitTypeId, count };
    this.placementDefenseTypeId = null;
  }

  getPlacementSquadRequest(): { unitTypeId: string; count: number } | null {
    return this.placementSquadRequest;
  }
}
