import parseProviders from "../../node_modules/next-auth/core/lib/providers";
import parseUrl from "../../node_modules/next-auth/utils/parse-url";

const mockTransactionAccountFindUnique = jest.fn();
const mockTransaction = jest.fn(
  (
    callback: (transaction: {
      source: string;
      account: { findUnique: typeof mockTransactionAccountFindUnique };
    }) => unknown
  ) =>
    callback({
      source: "test-transaction",
      account: { findUnique: mockTransactionAccountFindUnique },
    })
);
const mockReconcileVerifiedGoogleAccount = jest.fn();

jest.mock("@/lib/db/client", () => ({
  db: { $transaction: mockTransaction },
}));
jest.mock("@/lib/auth/verified-google-linking", () => ({
  reconcileVerifiedGoogleAccount: mockReconcileVerifiedGoogleAccount,
}));
jest.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: () => ({}),
}));
jest.mock("next-auth/providers/email", () => ({
  __esModule: true,
  default: (options: Record<string, unknown>) => ({
    id: "email",
    name: "Email",
    type: "email",
    options,
  }),
}));

interface ProviderWithLinkingPolicy {
  id?: string;
  allowDangerousEmailAccountLinking?: boolean;
  profile?: (
    profile: Record<string, unknown>,
    tokens: Record<string, unknown>
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  options?: {
    allowDangerousEmailAccountLinking?: boolean;
  };
}

describe("OAuth provider account-linking configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockTransaction.mockClear();
    mockTransactionAccountFindUnique.mockReset();
    mockTransactionAccountFindUnique.mockResolvedValue({
      userId: "existing-user",
    });
    mockReconcileVerifiedGoogleAccount.mockReset();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      LINKEDIN_CLIENT_ID: "linkedin-client-id",
      LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
    };
    delete process.env.ENABLE_DEV_AUTH;
    delete process.env.EMAIL_SERVER;
    delete process.env.ADMIN_PASSWORD;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("enables verified-email linking only for Google", async () => {
    const { authOptions } = await import("./config");
    const providers = authOptions.providers as ProviderWithLinkingPolicy[];
    const google = providers.find((provider) => provider.id === "google");
    const linkedin = providers.find((provider) => provider.id === "linkedin");

    expect(google?.allowDangerousEmailAccountLinking).toBe(true);
    expect(google?.options?.allowDangerousEmailAccountLinking).toBe(true);
    expect(linkedin?.allowDangerousEmailAccountLinking).toBe(false);
  });

  it("routes Google sign-in through verified account reconciliation", async () => {
    mockReconcileVerifiedGoogleAccount.mockResolvedValue(true);
    const { authOptions } = await import("./config");
    const signIn = authOptions.callbacks?.signIn;

    expect(signIn).toBeDefined();
    await expect(
      signIn?.({
        account: {
          provider: "google",
          type: "oauth",
          providerAccountId: "google-subject",
        },
        profile: {
          email: "person@example.com",
          email_verified: true,
        },
      } as never)
    ).resolves.toBe(true);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockReconcileVerifiedGoogleAccount).toHaveBeenCalledWith(
      {
        account: expect.objectContaining({ provider: "google" }),
        profile: expect.objectContaining({
          email: "person@example.com",
          email_verified: true,
        }),
      },
      expect.objectContaining({ source: "test-transaction" })
    );
  });

  it("reconciles the verified Google subject before NextAuth looks up the account", async () => {
    mockReconcileVerifiedGoogleAccount.mockResolvedValue(true);
    const { authOptions } = await import("./config");
    const providers = authOptions.providers as ProviderWithLinkingPolicy[];
    const google = providers.find((provider) => provider.id === "google");

    const mappedProfile = await google?.profile?.(
        {
          sub: "new-google-subject",
          email: "person@example.com",
          email_verified: true,
          name: "Person Example",
          picture: "https://example.com/avatar.png",
        },
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: 1_900_000_000,
          token_type: "Bearer",
          scope: "openid email profile",
          id_token: "id-token",
        }
      );

    expect(mappedProfile).toEqual({
      id: "new-google-subject",
      email: "person@example.com",
      name: "Person Example",
      image: "https://example.com/avatar.png",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockReconcileVerifiedGoogleAccount).toHaveBeenCalledWith(
      {
        account: expect.objectContaining({
          provider: "google",
          type: "oauth",
          providerAccountId: "new-google-subject",
          access_token: "access-token",
        }),
        profile: expect.objectContaining({
          email: "person@example.com",
          email_verified: true,
        }),
      },
      expect.objectContaining({ source: "test-transaction" })
    );
  });

  it("preserves the reconciliation mapper after NextAuth normalizes providers", async () => {
    mockReconcileVerifiedGoogleAccount.mockResolvedValue(true);
    const { authOptions } = await import("./config");
    const { provider } = parseProviders({
      providers: authOptions.providers,
      providerId: "google",
      url: parseUrl("https://example.com/api/auth"),
    });

    expect(provider?.allowDangerousEmailAccountLinking).toBe(true);
    await provider?.profile?.(
      {
        sub: "normalized-google-subject",
        email: "person@example.com",
        email_verified: true,
        name: "Person Example",
        picture: "https://example.com/avatar.png",
      },
      { access_token: "access-token" }
    );

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockReconcileVerifiedGoogleAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          provider: "google",
          providerAccountId: "normalized-google-subject",
        }),
      }),
      expect.objectContaining({ source: "test-transaction" })
    );
  });
});
