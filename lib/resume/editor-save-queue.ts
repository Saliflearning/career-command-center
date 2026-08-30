export class EditorSaveQueue {
  private pending = new Set<Promise<unknown>>();

  track<T>(save: Promise<T>): Promise<T> {
    const tracked = save.finally(() => {
      this.pending.delete(tracked);
    });
    this.pending.add(tracked);
    return tracked;
  }

  get size(): number {
    return this.pending.size;
  }

  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      const results = await Promise.allSettled(Array.from(this.pending));
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failed) throw failed.reason;
    }
  }
}