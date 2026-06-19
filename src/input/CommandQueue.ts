import type { InputCommand } from "../types/commands";

export class CommandQueue {
  private readonly commands: InputCommand[] = [];
  private placementDefenseTypeId: string | null = null;

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
  }

  finishPlacement(): void {
    this.placementDefenseTypeId = null;
  }

  getPlacementDefenseTypeId(): string | null {
    return this.placementDefenseTypeId;
  }
}
