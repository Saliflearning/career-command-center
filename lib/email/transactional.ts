import { Resend } from "resend";

export interface DeliveryResult {
  delivered: boolean;
}

function configuredValue(name: "RESEND_API_KEY" | "EMAIL_FROM"): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function isTransactionalEmailConfigured(): boolean {
  return Boolean(configuredValue("RESEND_API_KEY") && configuredValue("EMAIL_FROM"));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character]!;
  });
}

async function sendEmail(message: {
  to: string;
  subject: string;
  actionLabel: string;
  actionUrl: string;
  intro: string;
  expiry: string;
}): Promise<DeliveryResult> {
  const apiKey = configuredValue("RESEND_API_KEY");
  const from = configuredValue("EMAIL_FROM");
  if (!apiKey || !from) return { delivered: false };

  const actionUrl = escapeHtml(message.actionUrl);

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      text: `${message.intro}\n\n${message.actionLabel}: ${message.actionUrl}\n\n${message.expiry}\n\nIf you did not request this, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#191c1e;line-height:1.55">
          <h1 style="font-size:24px;margin:0 0 16px">Career Command Center</h1>
          <p>${escapeHtml(message.intro)}</p>
          <p style="margin:28px 0">
            <a href="${actionUrl}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700">${escapeHtml(message.actionLabel)}</a>
          </p>
          <p style="font-size:14px;color:#5f6368">${escapeHtml(message.expiry)}</p>
          <p style="font-size:14px;color:#5f6368">If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });

    const delivered = Boolean(result.data?.id) && !result.error;
    console.log(
      JSON.stringify({
        event: "transactional_email_delivery",
        kind: message.subject.startsWith("Reset") ? "password_reset" : "email_verification",
        delivered,
        timestamp: new Date().toISOString(),
      })
    );
    return { delivered };
  } catch {
    console.error(
      JSON.stringify({
        event: "transactional_email_delivery_failed",
        kind: message.subject.startsWith("Reset") ? "password_reset" : "email_verification",
        timestamp: new Date().toISOString(),
      })
    );
    return { delivered: false };
  }
}

export function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}): Promise<DeliveryResult> {
  return sendEmail({
    to: input.to,
    subject: "Reset your Career Command Center password",
    actionLabel: "Reset password",
    actionUrl: input.resetUrl,
    intro: "We received a request to reset your Career Command Center password.",
    expiry: "This link expires in one hour and can be used once.",
  });
}

export function sendVerificationEmail(input: {
  to: string;
  verificationUrl: string;
}): Promise<DeliveryResult> {
  return sendEmail({
    to: input.to,
    subject: "Verify your Career Command Center email",
    actionLabel: "Verify email",
    actionUrl: input.verificationUrl,
    intro: "Confirm that this email belongs to your Career Command Center account.",
    expiry: "This link expires in 24 hours and can be used once.",
  });
}
