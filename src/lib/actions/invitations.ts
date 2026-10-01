"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { appUrl } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, invitations } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/format";
import {
  findInvitationByToken,
  invitationEmail,
  inviteBlockReason,
  listInvitations,
  markInvitationSent,
  parseInviteList,
  upsertInvitations,
} from "@/lib/invitations";
import { finishMemberRsvp } from "@/lib/actions/member";
import { setMemberEmail } from "@/lib/auth";
import { sendEmail } from "@/lib/notify";
import { findManagedEvent, canManageEvent } from "@/lib/roles";
import { formatPacificRange } from "@/lib/time";
import { unsignedWaiverForEvent } from "@/lib/waivers";

function back(eventId: string, ok?: string, error?: string): never {
  const params = new URLSearchParams();
  if (ok) params.set("ok", ok);
  if (error) params.set("error", error);
  const query = params.toString();
  redirect(`/host/events/${eventId}${query ? `?${query}` : ""}#invitations`);
}

export async function addPastedInvites(formData: FormData) {
  const eventId = String(formData.get("eventId") || "");
  const managed = await findManagedEvent(eventId);
  if (!managed) redirect("/host");
  const parsed = parseInviteList(String(formData.get("emails") || ""));
  const result = await upsertInvitations(
    eventId,
    parsed.emails.map((email) => ({ email })),
  );
  const notes: string[] = [];
  if (result.added.length) notes.push(`Added ${result.added.length} ${result.added.length === 1 ? "person" : "people"}.`);
  if (result.updated.length) notes.push(`Already invited, so the same link was kept: ${result.updated.join(", ")}.`);
  if (result.skippedRegistered.length) {
    notes.push(`Already registered for this event, so skipped: ${result.skippedRegistered.join(", ")}.`);
  }
  if (parsed.invalid.length) notes.push(`These are not email addresses: ${parsed.invalid.join(", ")}.`);
  if (!notes.length) back(eventId, undefined, "Paste at least one email address.");
  const problem = parsed.invalid.length > 0 || result.skippedRegistered.length > 0;
  if (problem) back(eventId, result.added.length || result.updated.length ? notes[0] : undefined, notes.slice(result.added.length ? 1 : 0).join(" ") || notes.join(" "));
  back(eventId, notes.join(" "));
}

export async function addImportedInvites(formData: FormData) {
  const eventId = String(formData.get("eventId") || "");
  const sourceId = String(formData.get("sourceEventId") || "");
  const managed = await findManagedEvent(eventId);
  if (!managed) redirect("/host");
  const db = await getDb();
  const source = await db.select().from(events).where(eq(events.id, sourceId)).get();
  if (!source || !canManageEvent(managed.host, source)) {
    back(eventId, undefined, "You can only import people from events you manage.");
  }
  const emails = formData.getAll("email").map((value) => String(value));
  const people = emails.map((email) => ({
    email,
    name: String(formData.get(`name:${email}`) || "").trim() || null,
  }));
  if (people.length === 0) back(eventId, undefined, "Choose at least one person to invite.");
  const result = await upsertInvitations(eventId, people);
  const notes: string[] = [];
  if (result.added.length) notes.push(`Added ${result.added.length} from ${source.title}.`);
  if (result.updated.length) notes.push(`Already invited, so the same link was kept: ${result.updated.join(", ")}.`);
  if (result.skippedRegistered.length) {
    notes.push(`Already registered for this event, so skipped: ${result.skippedRegistered.join(", ")}.`);
  }
  if (!notes.length) back(eventId, undefined, "No one new was added.");
  back(eventId, notes.join(" "));
}

async function sendOne(
  invitationId: string,
  event: { id: string; title: string; village: string; startsAt: Date; endsAt: Date | null; locationName: string; status: "published" | "cancelled" },
  message: string,
) {
  const reason = inviteBlockReason(event, new Date());
  if (reason === "cancelled") throw new Error("This event is cancelled, so invitation links no longer work.");
  if (reason === "past") throw new Error("This event has already happened, so invitation links no longer work.");
  const db = await getDb();
  const invitation = await db.select().from(invitations).where(eq(invitations.id, invitationId)).get();
  if (!invitation || invitation.eventId !== event.id) throw new Error("That invitation could not be found.");
  const origin = await appUrl();
  const content = invitationEmail({
    name: invitation.name,
    eventTitle: event.title,
    village: event.village,
    when: formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime()),
    where: event.locationName,
    message,
    registerUrl: `${origin}/invite/${invitation.token}`,
  });
  await sendEmail({
    to: invitation.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    eventId: event.id,
  });
  await markInvitationSent(invitation.id, message.trim().slice(0, 500));
}

export async function deliverInvitations(formData: FormData) {
  if (String(formData.get("invitationId") || "")) return resendInvitation(formData);
  return sendNewInvitations(formData);
}

export async function sendNewInvitations(formData: FormData) {
  const eventId = String(formData.get("eventId") || "");
  const managed = await findManagedEvent(eventId);
  if (!managed) redirect("/host");
  const message = String(formData.get("message") || "").trim().slice(0, 500);
  const pending = (await listInvitations(eventId)).filter((row) => row.status === "not_sent");
  if (pending.length === 0) back(eventId, undefined, "There are no new invitations to send. Use Resend on a person to send again.");
  try {
    for (const invitation of pending) {
      await sendOne(invitation.id, managed.event, message);
    }
  } catch (error) {
    back(eventId, undefined, (error as Error).message);
  }
  back(
    eventId,
    `Sent ${pending.length} ${pending.length === 1 ? "invitation" : "invitations"}. Open the Outbox to read ${pending.length === 1 ? "it" : "them"}.`,
  );
}

export async function resendInvitation(formData: FormData) {
  const eventId = String(formData.get("eventId") || "");
  const invitationId = String(formData.get("invitationId") || "");
  const managed = await findManagedEvent(eventId);
  if (!managed) redirect("/host");
  let message = String(formData.get("message") || "").trim().slice(0, 500);
  const db = await getDb();
  if (!message) {
    const existing = await db.select().from(invitations).where(eq(invitations.id, invitationId)).get();
    message = existing?.message || "";
  }
  try {
    await sendOne(invitationId, managed.event, message);
  } catch (error) {
    back(eventId, undefined, (error as Error).message);
  }
  const invitation = await db.select().from(invitations).where(eq(invitations.id, invitationId)).get();
  back(eventId, `Sent another invitation to ${invitation?.email || "that person"}. It is in the Outbox.`);
}

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") || "");
  const found = await findInvitationByToken(token);
  const here = `/invite/${encodeURIComponent(token)}`;
  if (!found) redirect(`/invite/${encodeURIComponent(token)}`);
  const reason = inviteBlockReason(found.event, new Date());
  if (reason) {
    redirect(here);
  }
  const name = String(formData.get("guestName") || found.invitation.name || "").trim();
  if (name.length < 2) {
    redirect(here + "?error=" + encodeURIComponent("Please enter your name."));
  }
  const email = normalizeEmail(found.invitation.email);
  if (!email) redirect(here + "?error=" + encodeURIComponent("This invitation does not have an email address."));
  if (name !== found.invitation.name) {
    const db = await getDb();
    await db
      .update(invitations)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(invitations.id, found.invitation.id)))
      .run();
  }
  await setMemberEmail(email);
  const needed = await unsignedWaiverForEvent(found.event.eventTypeId, email);
  if (needed) {
    redirect(`/waiver/sign?eventId=${encodeURIComponent(found.event.id)}&returnTo=${encodeURIComponent(`/invite/${token}`)}`);
  }
  await finishMemberRsvp(found.event, email, `/invite/${token}`, name);
}
