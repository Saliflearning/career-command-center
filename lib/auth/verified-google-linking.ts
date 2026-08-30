interface OAuthAccountInput {
  provider?: unknown;
  type?: unknown;
  providerAccountId?: unknown;
  refresh_token?: unknown;
  access_token?: unknown;
  expires_at?: unknown;
  token_type?: unknown;
  scope?: unknown;
  id_token?: unknown;
  session_state?: unknown;
}

interface OAuthProfileInput {
  email?: unknown;
  email_verified?: unknown;
}

interface ExistingAccount {
  userId: string;
  user: { email: string };
}

export interface VerifiedGoogleLinkStore {
  account: {
    findUnique(args: {
      where: {
        provider_providerAccountId: {
          provider: string;
          providerAccountId: string;
        };
      };
      select: { userId: true; user: { select: { email: true } } };
    }): Promise<ExistingAccount | null>;
    upsert(args: {
      where: {
        provider_providerAccountId: {
          provider: string;
          providerAccountId: string;
        };
      };
      update: Record<string, never>;
      create: {
        userId: string;
        provider: string;
        type: string;
        providerAccountId: string;
        refresh_token: string | null;
        access_token: string | null;
        expires_at: number | null;
        token_type: string | null;
        scope: string | null;
        id_token: string | null;
        session_state: string | null;
      };
      select: { userId: true };
    }): Promise<{ userId: string }>;
  };
  user: {
    findUnique(args: {
      where: { email: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    updateMany(args: {
      where: { id: string; emailVerified: null };
      data: { emailVerified: Date };
    }): Promise<{ count: number }>;
  };
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizedEmail(value: unknown): string | null {
  return normalizedString(value)?.toLowerCase() ?? null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reconciles a verified Google identity whose provider subject changed while
 * preserving the same email address. Google is the only provider permitted to
 * use this path, and any cross-user account conflict fails closed.
 */
export async function reconcileVerifiedGoogleAccount(
  input: {
    account: OAuthAccountInput;
    profile: OAuthProfileInput;
  },
  store: VerifiedGoogleLinkStore
): Promise<boolean> {
  const provider = normalizedString(input.account.provider);
  if (provider !== "google") return true;

  const email = normalizedEmail(input.profile.email);
  if (input.profile.email_verified !== true || !email) return false;

  const providerAccountId = normalizedString(input.account.providerAccountId);
  const type = normalizedString(input.account.type);
  if (!providerAccountId || type !== "oauth") return false;

  const accountKey = {
    provider_providerAccountId: { provider, providerAccountId },
  };
  const existingAccount = await store.account.findUnique({
    where: accountKey,
    select: { userId: true, user: { select: { email: true } } },
  });

  if (existingAccount) {
    return normalizedEmail(existingAccount.user.email) === email;
  }

  const existingUser = await store.user.findUnique({
    where: { email },
    select: { id: true },
  });

  // NextAuth owns first-time user and account creation.
  if (!existingUser) return true;

  const linkedAccount = await store.account.upsert({
    where: accountKey,
    update: {},
    create: {
      userId: existingUser.id,
      provider,
      type,
      providerAccountId,
      refresh_token: normalizedString(input.account.refresh_token),
      access_token: normalizedString(input.account.access_token),
      expires_at: optionalNumber(input.account.expires_at),
      token_type: normalizedString(input.account.token_type),
      scope: normalizedString(input.account.scope),
      id_token: normalizedString(input.account.id_token),
      session_state: normalizedString(input.account.session_state),
    },
    select: { userId: true },
  });

  // A concurrent request may have linked this provider subject first.
  if (linkedAccount.userId !== existingUser.id) return false;

  await store.user.updateMany({
    where: { id: existingUser.id, emailVerified: null },
    data: { emailVerified: new Date() },
  });

  return true;
}
