import { EditorSaveQueue } from "./editor-save-queue";

describe("EditorSaveQueue", () => {
  it("waits for tracked saves before navigation", async () => {
    const queue = new EditorSaveQueue();
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });

    queue.track(save);
    let flushed = false;
    const flush = queue.flush().then(() => {
      flushed = true;
    });

    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(queue.size).toBe(1);

    resolveSave();
    await flush;
    expect(flushed).toBe(true);
    expect(queue.size).toBe(0);
  });

  it("rejects the flush when a save fails", async () => {
    const queue = new EditorSaveQueue();
    queue.track(Promise.reject(new Error("Save failed"))).catch(() => undefined);

    await expect(queue.flush()).rejects.toThrow("Save failed");
    expect(queue.size).toBe(0);
  });

  it("also waits for saves added while a flush is running", async () => {
    const queue = new EditorSaveQueue();
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    queue.track(new Promise<void>((resolve) => {
      resolveFirst = resolve;
    }));

    const flush = queue.flush();
    queue.track(new Promise<void>((resolve) => {
      resolveSecond = resolve;
    }));

    resolveFirst();
    await Promise.resolve();
    expect(queue.size).toBe(1);
    resolveSecond();
    await flush;
    expect(queue.size).toBe(0);
  });
});