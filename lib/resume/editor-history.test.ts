import { BulletEditHistory } from "./editor-history";

describe("BulletEditHistory", () => {
  it("moves bullet edits through undo and redo in document order", () => {
    const history = new BulletEditHistory();
    const first = history.record({ bulletId: "bullet-1", before: "Before", after: "After" });

    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.takeUndo()).toBe(first);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.takeRedo()).toBe(first);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("clears redo history when a new edit is recorded", () => {
    const history = new BulletEditHistory();
    history.record({ bulletId: "bullet-1", before: "A", after: "B" });
    history.takeUndo();

    history.record({ bulletId: "bullet-2", before: "C", after: "D" });

    expect(history.canRedo).toBe(false);
    expect(history.takeUndo()?.bulletId).toBe("bullet-2");
  });

  it("restores stack state when persistence fails", () => {
    const history = new BulletEditHistory();
    const entry = history.record({ bulletId: "bullet-1", before: "A", after: "B" });

    expect(history.takeUndo()).toBe(entry);
    history.rollbackUndo(entry);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    expect(history.takeUndo()).toBe(entry);
    expect(history.takeRedo()).toBe(entry);
    history.rollbackRedo(entry);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });
});
