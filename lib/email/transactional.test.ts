const send = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send },
  })),
}));

import {
  isTransactionalEmailConfigured,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./transactional";

describe("transactional email boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("requires both a provider key and a sender", () => {
    process.env.RESEND_API_KEY = "provider-key";
    expect(isTransactionalEmailConfigured()).toBe(false);

    process.env.EMAIL_FROM = "Career Command Center <noreply@example.com>";
    expect(isTransactionalEmailConfigured()).toBe(true);
  });

  it("does not attempt delivery when configuration is incomplete", async () => {
    await expect(
      sendPasswordResetEmail({
        to: "person@example.com",
        resetUrl: "https://example.com/reset?token=secret",
      })
    ).resolves.toEqual({ delivered: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("delivers reset and verification messages through the configured sender", async () => {
    process.env.RESEND_API_KEY = "provider-key";
    process.env.EMAIL_FROM = "Career Command Center <noreply@example.com>";
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await expect(
      sendPasswordResetEmail({
        to: "person@example.com",
        resetUrl: "https://example.com/reset?token=secret",
      })
    ).resolves.toEqual({ delivered: true });
    await expect(
      sendVerificationEmail({
        to: "person@example.com",
        verificationUrl: "https://example.com/verify?token=secret",
      })
    ).resolves.toEqual({ delivered: true });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        from: "Career Command Center <noreply@example.com>",
        to: "person@example.com",
        subject: "Reset your Career Command Center password",
      })
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: "Verify your Career Command Center email",
      })
    );
  });

  it("bounds provider failures to a delivery result", async () => {
    process.env.RESEND_API_KEY = "provider-key";
    process.env.EMAIL_FROM = "Career Command Center <noreply@example.com>";
    send.mockResolvedValue({ data: null, error: { message: "private detail" } });

    await expect(
      sendPasswordResetEmail({
        to: "person@example.com",
        resetUrl: "https://example.com/reset?token=secret",
      })
    ).resolves.toEqual({ delivered: false });
  });
});
