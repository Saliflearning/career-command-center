import { reconcileVerifiedGoogleAccount } from "./verified-google-linking";

function createStore() {
  return {
    account: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

const googleAccount = {
  provider: "google",
  type: "oauth",
  providerAccountId: "current-google-subject",
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_at: 1_900_000_000,
  token_type: "Bearer",
  scope: "openid email profile",
  id_token: "test-id-token",
  session_state: null,
};

describe("reconcileVerifiedGoogleAccount", () => {
  it("ignores providers outside the verified Google policy", async () => {
    const store = createStore();

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: { ...googleAccount, provider: "linkedin" },
          profile: { email: "person@example.com", email_verified: true },
        },
        store
      )
    ).resolves.toBe(true);

    expect(store.account.findUnique).not.toHaveBeenCalled();
  });

  it("rejects Google profiles whose email is not explicitly verified", async () => {
    const store = createStore();

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: googleAccount,
          profile: { email: "person@example.com", email_verified: false },
        },
        store
      )
    ).resolves.toBe(false);

    expect(store.account.findUnique).not.toHaveBeenCalled();
  });

  it("accepts an existing Google account only when its user owns the verified email", async () => {
    const store = createStore();
    store.account.findUnique.mockResolvedValue({
      userId: "user-1",
      user: { email: "Person@Example.com" },
    });

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: googleAccount,
          profile: { email: "person@example.com", email_verified: true },
        },
        store
      )
    ).resolves.toBe(true);

    expect(store.account.upsert).not.toHaveBeenCalled();
  });

  it("rejects a Google account already linked to a different email", async () => {
    const store = createStore();
    store.account.findUnique.mockResolvedValue({
      userId: "other-user",
      user: { email: "other@example.com" },
    });

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: googleAccount,
          profile: { email: "person@example.com", email_verified: true },
        },
        store
      )
    ).resolves.toBe(false);
  });

  it("leaves a first-time verified Google user to the normal NextAuth creation flow", async () => {
    const store = createStore();
    store.account.findUnique.mockResolvedValue(null);
    store.user.findUnique.mockResolvedValue(null);

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: googleAccount,
          profile: { email: "new@example.com", email_verified: true },
        },
        store
      )
    ).resolves.toBe(true);

    expect(store.account.upsert).not.toHaveBeenCalled();
    expect(store.user.updateMany).not.toHaveBeenCalled();
  });

  it("links a changed Google subject to the existing same-email user", async () => {
    const store = createStore();
    store.account.findUnique.mockResolvedValue(null);
    store.user.findUnique.mockResolvedValue({ id: "user-1" });
    store.account.upsert.mockResolvedValue({ userId: "user-1" });
    store.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: googleAccount,
          profile: { email: " PERSON@example.com ", email_verified: true },
        },
        store
      )
    ).resolves.toBe(true);

    expect(store.user.findUnique).toHaveBeenCalledWith({
      where: { email: "person@example.com" },
      select: { id: true },
    });
    expect(store.account.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "current-google-subject",
          },
        },
        create: expect.objectContaining({
          userId: "user-1",
          provider: "google",
          providerAccountId: "current-google-subject",
        }),
        update: {},
        select: { userId: true },
      })
    );
    expect(store.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", emailVerified: null },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it("fails closed if a concurrent link resolves to another user", async () => {
    const store = createStore();
    store.account.findUnique.mockResolvedValue(null);
    store.user.findUnique.mockResolvedValue({ id: "user-1" });
    store.account.upsert.mockResolvedValue({ userId: "other-user" });

    await expect(
      reconcileVerifiedGoogleAccount(
        {
          account: googleAccount,
          profile: { email: "person@example.com", email_verified: true },
        },
        store
      )
    ).resolves.toBe(false);

    expect(store.user.updateMany).not.toHaveBeenCalled();
  });
});
