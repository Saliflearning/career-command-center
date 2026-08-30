interface ProviderReference {
  id?: unknown;
}

export interface SignInProviderAvailability {
  development: boolean;
  emailMagicLink: boolean;
  google: boolean;
  linkedin: boolean;
}

/**
 * Optional sign-in actions must reflect NextAuth's provider registry. This
 * prevents the client from navigating into a provider that is not configured.
 */
export function getSignInProviderAvailability(
  providers: Record<string, ProviderReference> | null
): SignInProviderAvailability {
  const providerIds = new Set(
    Object.values(providers ?? {})
      .map((provider) => provider.id)
      .filter((id): id is string => typeof id === "string")
  );

  return {
    development: providerIds.has("dev-login"),
    emailMagicLink: providerIds.has("email"),
    google: providerIds.has("google"),
    linkedin: providerIds.has("linkedin"),
  };
}
