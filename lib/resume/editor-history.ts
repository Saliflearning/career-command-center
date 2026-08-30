export interface BulletEditHistoryEntry {
  bulletId: string;
  before: string;
  after: string;
}

export class BulletEditHistory {
  private readonly undoStack: BulletEditHistoryEntry[] = [];
  private readonly redoStack: BulletEditHistoryEntry[] = [];

  constructor(private readonly limit = 50) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  record(entry: BulletEditHistoryEntry): BulletEditHistoryEntry {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return entry;
  }

  takeUndo(): BulletEditHistoryEntry | null {
    const entry = this.undoStack.pop() ?? null;
    if (entry) this.redoStack.push(entry);
    return entry;
  }

  takeRedo(): BulletEditHistoryEntry | null {
    const entry = this.redoStack.pop() ?? null;
    if (entry) this.undoStack.push(entry);
    return entry;
  }

  rollbackUndo(entry: BulletEditHistoryEntry): void {
    if (this.redoStack.at(-1) === entry) this.redoStack.pop();
    this.undoStack.push(entry);
  }

  rollbackRedo(entry: BulletEditHistoryEntry): void {
    if (this.undoStack.at(-1) === entry) this.undoStack.pop();
    this.redoStack.push(entry);
  }

  discard(entry: BulletEditHistoryEntry): void {
    const undoIndex = this.undoStack.lastIndexOf(entry);
    if (undoIndex >= 0) this.undoStack.splice(undoIndex, 1);
    const redoIndex = this.redoStack.lastIndexOf(entry);
    if (redoIndex >= 0) this.redoStack.splice(redoIndex, 1);
  }
}
