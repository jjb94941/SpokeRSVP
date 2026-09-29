"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { clearMemberEmail, getMemberEmail, setGuestCookie, setMemberEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, rsvps } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/format";
import { sendEmail, rsvpConfirmationText } from "@/lib/notify";
import { submitRsvp } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";
import { safeMemberReturnPath } from "@/lib/member-path";

function memberReturnPath(formData: FormData): string {
  return safeMemberReturnPath(String(formData.get("returnTo") || "/"));
}

function emailError(returnTo: string, message: string): never {
  const join = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${join}error=` + encodeURIComponent(message));
}

export async function signInMember(formData: FormData) {
  const returnTo = memberReturnPath(formData);
  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailError(returnTo, "Enter the email address you want to use. No password is needed.");
  }
  await setMemberEmail(email);
  const join = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${join}ok=` + encodeURIComponent(`Using ${email}. Choose an event to sign up.`));
}

export async function signOutMember(formData: FormData) {
  await clearMemberEmail();
  redirect(memberReturnPath(formData));
}

export async function memberRsvp(formData: FormData) {
  const returnTo = memberReturnPath(formData);
  const email = await getMemberEmail();
  if (!email) emailError(returnTo, "Enter your email above before you sign up. No password is needed.");

  const eventId = String(formData.get("eventId") || "");
  const db = await getDb();
  const event = await db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event || event.status !== "published") {
    emailError(returnTo, "That event is not open for sign-up.");
  }

  const existing = (await db.select().from(rsvps).where(eq(rsvps.eventId, event.id)).all()).find(
    (row) => normalizeEmail(row.email) === email,
  );

  let rsvp;
  try {
    ({ rsvp } = await submitRsvp(event, {
      guestName: existing?.guestName || email,
      email,
      desiredStatus: "going",
      manageToken: existing?.manageToken,
    }));
  } catch (error) {
    emailError(returnTo, (error as Error).message);
  }

  await setGuestCookie(event.id, rsvp.manageToken);
  const when = formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime());
  await sendEmail({
    to: email,
    subject: `RSVP for ${event.title}`,
    text: rsvpConfirmationText({
      guestName: rsvp.guestName,
      eventTitle: event.title,
      when,
      where: event.locationName,
      status: rsvp.status,
      manageUrl: returnTo,
    }),
  });

  const thanks =
    rsvp.status === "waitlist"
      ? `${event.title} is full, so ${email} is on the waitlist.`
      : `${email} is signed up for ${event.title}.`;
  const join = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${join}ok=` + encodeURIComponent(thanks));
}

export async function memberCancelRsvp(formData: FormData) {
  const returnTo = memberReturnPath(formData);
  const email = await getMemberEmail();
  if (!email) emailError(returnTo, "Enter your email above before you cancel. No password is needed.");

  const eventId = String(formData.get("eventId") || "");
  const db = await getDb();
  const event = await db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) emailError(returnTo, "That event could not be found.");

  const existing = (await db.select().from(rsvps).where(eq(rsvps.eventId, event.id)).all()).find(
    (row) => normalizeEmail(row.email) === email && row.status !== "not_going",
  );
  if (!existing) emailError(returnTo, "There is no signup to cancel for that event.");

  let rsvp;
  try {
    ({ rsvp } = await submitRsvp(event, {
      guestName: existing.guestName,
      email,
      phone: existing.phone,
      desiredStatus: "not_going",
      manageToken: existing.manageToken,
    }));
  } catch (error) {
    emailError(returnTo, (error as Error).message);
  }

  const when = formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime());
  await sendEmail({
    to: email,
    subject: `RSVP cancelled for ${event.title}`,
    text: rsvpConfirmationText({
      guestName: rsvp.guestName,
      eventTitle: event.title,
      when,
      where: event.locationName,
      status: rsvp.status,
      manageUrl: returnTo,
    }),
  });

  const join = returnTo.includes("?") ? "&" : "?";
  redirect(
    `${returnTo}${join}ok=` + encodeURIComponent(`${email} is no longer signed up for ${event.title}.`),
  );
}
