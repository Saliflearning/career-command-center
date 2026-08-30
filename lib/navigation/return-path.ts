const INTERNAL_ORIGIN = "https://career-command.local";

export function safeInternalReturnPath(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function withReturnTo(destination: string, returnTo: string): string {
  const separator = destination.includes("?") ? "&" : "?";
  return `${destination}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
