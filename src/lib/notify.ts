export type NotifyPayload = {
  to: string;
  subject: string;
  text: string;
};

function logEmail(payload: NotifyPayload, extra?: string) {
  console.log(
    `[SpokeRSVP email${extra ? ` ${extra}` : ""}]\nTo: ${payload.to}\nSubject: ${payload.subject}\n\n${payload.text}\n`,
  );
}

/** Email via Resend when RESEND_API_KEY is set; otherwise log-only stub. */
export async function sendEmail(payload: NotifyPayload): Promise<{ stubbed: boolean }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    logEmail(payload, "stub");
    return { stubbed: true };
  }

  logEmail(payload, "resend");
  const from = process.env.RESEND_FROM?.trim() || "SpokeRSVP <noreply@example.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    }),
  });
  if (!res.ok) {
    console.error("[SpokeRSVP] Resend error", res.status, await res.text());
  }
  return { stubbed: false };
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

Mill Valley Village — SpokeRSVP
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

Mill Valley Village — SpokeRSVP`;
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

Mill Valley Village — SpokeRSVP`;
}

export function magicLinkText(opts: { url: string }): string {
  return `Sign in to SpokeRSVP (Mill Valley Village host dashboard):

${opts.url}

This link expires in 30 minutes. If you did not ask for it, you can ignore this email.`;
}

export function subAdminWelcomeText(opts: { name: string; loginUrl: string; appointedBy: string }): string {
  return `Hello ${opts.name},

${opts.appointedBy} added you as a SpokeRSVP sub-administrator for Mill Valley Village.

You can create events and manage the ones you create. You cannot change other people’s events or anyone’s role.

Sign in here:
${opts.loginUrl}

Ask the administrator for your temporary password, or use “email me a sign-in link” on that page.

Mill Valley Village — SpokeRSVP`;
}
