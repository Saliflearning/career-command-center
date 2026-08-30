import {
  rollbackOptimisticBulletEdit,
  summaryToEditorDocument,
} from "./editor-content";

describe("resume editor content", () => {
  it("starts with an empty paragraph instead of visible loading copy", () => {
    expect(summaryToEditorDocument(null)).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("keeps untrusted summary characters as literal text nodes", () => {
    expect(summaryToEditorDocument("Built R&D <systems> & controls.")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Built R&D <systems> & controls." },
          ],
        },
      ],
    });
  });

  it("preserves intentional summary lines as separate paragraphs", () => {
    expect(summaryToEditorDocument("First line.\n\nSecond line.").content).toHaveLength(2);
  });

  it("restores only the optimistic bullet text after a failed save", () => {
    const workHistory = [{
      workHistoryId: "work-1",
      bullets: [
        { bulletId: "bullet-1", content: "Optimistic rewrite", contentType: "VERIFIED" },
        { bulletId: "bullet-2", content: "Untouched", contentType: "VERIFIED" },
      ],
    }];

    expect(rollbackOptimisticBulletEdit(
      workHistory,
      "bullet-1",
      "Optimistic rewrite",
      "Original bullet"
    )).toEqual([{
      workHistoryId: "work-1",
      bullets: [
        { bulletId: "bullet-1", content: "Original bullet", contentType: "VERIFIED" },
        { bulletId: "bullet-2", content: "Untouched", contentType: "VERIFIED" },
      ],
    }]);
  });

  it("does not overwrite a newer edit when an older save fails", () => {
    const workHistory = [{
      workHistoryId: "work-1",
      bullets: [{ bulletId: "bullet-1", content: "Newer edit", contentType: "VERIFIED" }],
    }];

    expect(rollbackOptimisticBulletEdit(
      workHistory,
      "bullet-1",
      "Older optimistic rewrite",
      "Original bullet"
    )).toBe(workHistory);
  });
});
