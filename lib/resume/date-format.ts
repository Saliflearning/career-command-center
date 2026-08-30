export function formatMonthYearUtc(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatYearUtc(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : String(date.getUTCFullYear());
}

export function formatEducationDateUtc(
  value: string | Date | null,
  inProgress: boolean
): string {
  if (!value) return inProgress ? "Expected" : "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return inProgress ? "Expected" : "";
  const formatted = isCanonicalYearStart(date)
    ? formatYearUtc(date)
    : formatMonthYearUtc(date);
  return inProgress ? `Expected ${formatted}` : formatted;
}

export function formatCertificationLabel(certification: {
  name: string;
  issuingBody?: string | null;
  issueDate: string | Date | null;
  dateLabel?: string;
}): string {
  const label = [certification.name, certification.issuingBody?.trim()]
    .filter(Boolean)
    .join(", ");
  const dateLabel = certification.dateLabel?.trim();
  if (dateLabel) return `${label} (${dateLabel})`;
  const year = formatYearUtc(certification.issueDate);
  return `${label}${year ? ` (${year})` : ""}`;
}

export function preferDateLabel(
  dateLabel: string | null | undefined,
  fallback: () => string
): string {
  return dateLabel?.trim() || fallback();
}

export function formatMonthYearRangeUtc(
  startDate: string | Date,
  endDate: string | Date | null,
  current: boolean
): string {
  if (!current && endDate && isCanonicalYearBoundary(startDate, endDate)) {
    return `${formatYearUtc(startDate)} - ${formatYearUtc(endDate)}`;
  }
  const start = formatMonthYearUtc(startDate);
  const end = current || !endDate ? "Present" : formatMonthYearUtc(endDate);
  return [start, end].filter(Boolean).join(" - ");
}

function isCanonicalYearBoundary(startValue: string | Date, endValue: string | Date) {
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  const end = endValue instanceof Date ? endValue : new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start.getUTCMonth() === 0 && start.getUTCDate() === 1
    && end.getUTCMonth() === 11 && end.getUTCDate() === 1;
}

function isCanonicalYearStart(value: Date) {
  return value.getUTCMonth() === 0 && value.getUTCDate() === 1;
}
