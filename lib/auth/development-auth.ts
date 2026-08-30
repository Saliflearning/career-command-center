type RuntimeEnvironment = string | undefined;

/**
 * Development credentials are a local/test convenience, never a production
 * authentication path. The runtime check wins over a stale or mis-scoped flag.
 */
export function shouldEnableDevelopmentAuth(
  nodeEnv: RuntimeEnvironment,
  enableDevAuth: string | undefined
): boolean {
  if (nodeEnv === "production") return false;
  if (nodeEnv === "development") return enableDevAuth !== "false";
  return enableDevAuth === "true";
}
