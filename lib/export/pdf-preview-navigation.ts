export type ReservedPdfPreview = {
  closed?: boolean;
  opener: unknown;
  location: {
    replace(url: string): void;
  };
  close(): void;
};

export function reservePdfPreview(
  openWindow: () => ReservedPdfPreview | null
) {
  const preview = openWindow();
  if (preview) preview.opener = null;
  return preview;
}

export function showPdfPreview(
  preview: ReservedPdfPreview | null,
  pdfUrl: string,
  navigateCurrentTab: (url: string) => void
) {
  if (preview && !preview.closed) {
    preview.location.replace(pdfUrl);
    return "reserved-tab" as const;
  }

  navigateCurrentTab(pdfUrl);
  return "current-tab" as const;
}

export function closePdfPreview(preview: ReservedPdfPreview | null) {
  if (preview && !preview.closed) preview.close();
}