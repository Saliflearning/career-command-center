export interface ResumeEditorDocument {
  type: "doc";
  content: Array<{
    type: "paragraph";
    content?: Array<{ type: "text"; text: string }>;
  }>;
}

interface EditableResumeBullet {
  bulletId: string;
  content: string;
}

interface EditableWorkHistory<TBullet extends EditableResumeBullet> {
  bullets: TBullet[];
}

/**
 * Restores a failed optimistic bullet edit without clobbering a newer edit that
 * may already be visible for the same bullet.
 */
export function rollbackOptimisticBulletEdit<
  TBullet extends EditableResumeBullet,
  TWork extends EditableWorkHistory<TBullet>,
>(
  workHistory: TWork[],
  bulletId: string,
  optimisticContent: string,
  previousContent: string
): TWork[] {
  let changed = false;
  const next = workHistory.map((work) => {
    let workChanged = false;
    const bullets = work.bullets.map((bullet) => {
      if (bullet.bulletId !== bulletId || bullet.content !== optimisticContent) {
        return bullet;
      }
      changed = true;
      workChanged = true;
      return { ...bullet, content: previousContent };
    });

    return workChanged ? { ...work, bullets } : work;
  });

  return changed ? next : workHistory;
}

/**
 * Builds Tiptap JSON from untrusted resume text. Using text nodes prevents
 * names, symbols, and angle brackets from being interpreted as HTML.
 */
export function summaryToEditorDocument(summary: string | null): ResumeEditorDocument {
  if (!summary) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const paragraphs = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({
      type: "paragraph" as const,
      content: [{ type: "text" as const, text }],
    }));

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}
