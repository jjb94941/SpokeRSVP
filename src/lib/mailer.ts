import { getDb } from "./db";
import { outboxMessages } from "./db/schema";
import { newId } from "./ids";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  eventId?: string | null;
};

export type EmailDelivery = {
  stubbed: boolean;
  provider: "outbox" | "resend" | "smtp";
};

/**
 * Which transport delivers mail.
 *
 * Default is `outbox`: the message is stored for the host Outbox page and
 * written to the server log. Nothing leaves the machine.
 *
 * Real sending later (no code change for Resend):
 *   EMAIL_PROVIDER=resend
 *   RESEND_API_KEY=re_...          (never commit this)
 *   RESEND_FROM=Marin Villages <rsvp@your-verified-domain>
 *
 * SMTP is a hook only. EMAIL_PROVIDER=smtp looks for SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, and SMTP_FROM, then refuses until sendViaSmtp has a
 * transport. The message is still saved to the Outbox.
 */
export function configuredEmailProvider(): "outbox" | "resend" | "smtp" {
  const raw = (process.env.EMAIL_PROVIDER || "outbox").trim().toLowerCase();
  if (raw === "resend" || raw === "smtp") return raw;
  return "outbox";
}

function logEmail(message: OutboundEmail, provider: string) {
  console.log(
    `[SpokeRSVP email ${provider}]\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
  );
}

async function saveOutbox(message: OutboundEmail, provider: string) {
  const db = await getDb();
  await db
    .insert(outboxMessages)
    .values({
      id: newId(),
      toEmail: message.to,
      subject: message.subject,
      textBody: message.text,
      htmlBody: message.html || "",
      eventId: message.eventId || null,
      provider,
      createdAt: new Date(),
    })
    .run();
}

async function sendViaResend(message: OutboundEmail) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("EMAIL_PROVIDER=resend but RESEND_API_KEY is empty.");
  }
  const from = process.env.RESEND_FROM?.trim() || "SpokeRSVP <noreply@example.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html || undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  }
}

/**
 * Hook for a future SMTP transport. Do not add credentials here.
 * Expected environment: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */
export async function sendViaSmtp(_message: OutboundEmail): Promise<void> {
  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].filter(
    (name) => !process.env[name]?.trim(),
  );
  const detail = missing.length ? ` Missing ${missing.join(", ")}.` : "";
  throw new Error(
    `SMTP sending is not connected yet.${detail} Add a transport in sendViaSmtp (src/lib/mailer.ts). The message was kept in the Outbox.`,
  );
}

export async function deliverEmail(message: OutboundEmail): Promise<EmailDelivery> {
  const provider = configuredEmailProvider();
  if (provider === "outbox") {
    await saveOutbox(message, "outbox");
    logEmail(message, "outbox");
    return { stubbed: true, provider: "outbox" };
  }

  try {
    if (provider === "resend") await sendViaResend(message);
    else await sendViaSmtp(message);
    await saveOutbox(message, provider);
    logEmail(message, provider);
    return { stubbed: false, provider };
  } catch (error) {
    console.error("[SpokeRSVP] email provider failed; saved to Outbox.", error);
    await saveOutbox(message, "outbox");
    logEmail(message, "outbox");
    return { stubbed: true, provider: "outbox" };
  }
}
