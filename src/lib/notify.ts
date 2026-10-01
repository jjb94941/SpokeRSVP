import { deliverEmail } from "./mailer";

export type NotifyPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  eventId?: string | null;
};

/**
 * Deliver email through the local mailer.
 * Default is the Outbox (no network). Set EMAIL_PROVIDER=resend plus
 * RESEND_API_KEY and RESEND_FROM to send with Resend. See src/lib/mailer.ts.
 */
export async function sendEmail(payload: NotifyPayload): Promise<{ stubbed: boolean }> {
  const result = await deliverEmail({
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    eventId: payload.eventId,
  });
  return { stubbed: result.stubbed };
}

/**
 * TODO: SMS reminders / waitlist texts are not implemented.
 * A future Twilio (or similar) integration would send `body` to `to`.
 */
export function sendSmsTodo(to: string, body: string) {
  console.log(`[SpokeRSVP SMS TODO] to=${to} body=${body}`);
}

export function rsvpConfirmationText(opts: {
  guestName: string;
  eventTitle: string;
  when: string;
  where: string;
  status: string;
  manageUrl: string;
}): string {
  const statusLine =
    opts.status === "going"
      ? "You are going."
      : opts.status === "waitlist"
        ? "The event is full, so you are on the waitlist. We will email you if a spot opens."
        : "We marked you as not going.";
  return `Hello ${opts.guestName},

${statusLine}

${opts.eventTitle}
${opts.when}
${opts.where}

Change your RSVP any time:
${opts.manageUrl}

Marin Villages — SpokeRSVP
This is a local village pilot. Contact info is only shared with the event host.`;
}

export function waitlistPromotedText(opts: {
  guestName: string;
  eventTitle: string;
  when: string;
  manageUrl: string;
}): string {
  return `Hello ${opts.guestName},

Good news — a spot opened for ${opts.eventTitle}.
You are now going.

${opts.when}

Details and carpools:
${opts.manageUrl}

Marin Villages — SpokeRSVP`;
}

export function reminderText(opts: {
  guestName: string;
  eventTitle: string;
  when: string;
  where: string;
  manageUrl: string;
}): string {
  return `Hello ${opts.guestName},

Friendly reminder: ${opts.eventTitle} is coming up.

${opts.when}
${opts.where}

${opts.manageUrl}

Marin Villages — SpokeRSVP`;
}

export function magicLinkText(opts: { url: string }): string {
  return `Sign in to SpokeRSVP (Marin Villages host dashboard):

${opts.url}

This link expires in 30 minutes. If you did not ask for it, you can ignore this email.`;
}

export function superAdminWelcomeText(opts: { name: string; loginUrl: string; appointedBy: string }): string {
  return `Hello ${opts.name},

${opts.appointedBy} added you as a SpokeRSVP super-admin for Marin Villages.

You can view and manage events in every village, appoint hosts, and add other super-admins. You are not tied to one village.

Sign in here:
${opts.loginUrl}

Ask the person who added you for your temporary password, or use “email me a sign-in link” on that page.

Marin Villages — SpokeRSVP`;
}

export function subAdminWelcomeText(opts: {
  name: string;
  loginUrl: string;
  appointedBy: string;
  villageTitle: string;
}): string {
  return `Hello ${opts.name},

${opts.appointedBy} added you as a SpokeRSVP host for ${opts.villageTitle}.

You can view and manage every event for ${opts.villageTitle}. You cannot see other villages or change anyone’s role.

Sign in here:
${opts.loginUrl}

Ask the super-administrator for your temporary password, or use “email me a sign-in link” on that page.

Marin Villages — SpokeRSVP`;
}
