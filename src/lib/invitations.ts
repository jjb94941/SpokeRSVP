import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  events,
  invitations,
  outboxMessages,
  rsvps,
  type EventRow,
  type Host,
  type InvitationRow,
  type InviteStatus,
  type OutboxMessageRow,
} from "./db/schema";
import { normalizeEmail } from "./format";
import { newId, newSecretToken } from "./ids";
import { canManageEvent, isAdmin } from "./roles";
import { villageTitle } from "./villages";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInviteList(raw: string): { emails: string[]; invalid: string[] } {
  const pieces = raw
    .split(/[,;\n\r]+/)
    .flatMap((chunk) => chunk.split(/\s+/))
    .map((piece) => piece.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const piece of pieces) {
    const email = normalizeEmail(piece);
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      invalid.push(piece);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { emails, invalid };
}

export function inviteBlockReason(
  event: Pick<EventRow, "status" | "startsAt"> & { endsAt?: Date | null },
  now: Date,
): "cancelled" | "past" | null {
  if (event.status === "cancelled") return "cancelled";
  const end = event.endsAt ?? event.startsAt;
  if (end.getTime() < now.getTime()) return "past";
  return null;
}

export function eventsAvailableToImport<T extends { id: string; village: string }>(
  host: Pick<Host, "role" | "village">,
  currentEventId: string,
  all: T[],
): T[] {
  return all.filter((event) => event.id !== currentEventId && canManageEvent(host, event));
}

export function inviteStatusLabel(status: string): string {
  if (status === "sent") return "Sent";
  if (status === "opened") return "Opened";
  if (status === "registered") return "Registered";
  return "Not sent";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invitationEmail(opts: {
  name: string | null;
  eventTitle: string;
  village: string;
  when: string;
  where: string;
  message: string;
  registerUrl: string;
}): { subject: string; text: string; html: string } {
  const hello = opts.name?.trim() ? `Hello ${opts.name.trim().split(/\s+/)[0]},` : "Hello,";
  const note = opts.message.trim();
  const subject = `You're invited: ${opts.eventTitle}`;
  const text = `${hello}

You are invited to ${opts.eventTitle} with ${villageTitle(opts.village)}.

${opts.when}
${opts.where}
${note ? `\n${note}\n` : ""}
Register here. No password is needed.
${opts.registerUrl}

Marin Villages — SpokeRSVP`;

  const messageHtml = note
    ? `<p style="font-size:17px;line-height:1.5;color:#3D2F28;">${escapeHtml(note)}</p>`
    : "";
  const html = `<div style="font-family:Georgia, 'Times New Roman', serif;color:#3D2F28;background:#FBF6F0;padding:24px;">
  <p style="font-size:17px;line-height:1.5;">${escapeHtml(hello)}</p>
  <p style="font-size:17px;line-height:1.5;">You are invited to <strong>${escapeHtml(opts.eventTitle)}</strong> with ${escapeHtml(villageTitle(opts.village))}.</p>
  <p style="font-size:17px;line-height:1.5;">${escapeHtml(opts.when)}<br>${escapeHtml(opts.where)}</p>
  ${messageHtml}
  <p style="margin:28px 0;">
    <a href="${escapeHtml(opts.registerUrl)}" style="display:inline-block;min-height:56px;line-height:56px;padding:0 28px;background:#C46B4A;color:#ffffff;font-size:20px;font-weight:700;border-radius:14px;text-decoration:none;">Register</a>
  </p>
  <p style="font-size:17px;line-height:1.5;">No password is needed. If the gathering is full, you can join the waitlist.</p>
  <p style="font-size:16px;color:#5C4A40;">Marin Villages — SpokeRSVP</p>
</div>`;
  return { subject, text, html };
}

export function invitationMailto(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function registeredEmails(eventId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all();
  const emails = new Set<string>();
  for (const row of rows) {
    if (row.status !== "going" && row.status !== "waitlist") continue;
    const email = normalizeEmail(row.email);
    if (email) emails.add(email);
  }
  return emails;
}

export async function upsertInvitations(
  eventId: string,
  people: { email: string; name?: string | null }[],
): Promise<{ added: string[]; updated: string[]; skippedRegistered: string[] }> {
  const added: string[] = [];
  const updated: string[] = [];
  const skippedRegistered: string[] = [];
  const registered = await registeredEmails(eventId);
  const db = await getDb();
  const existing = await db.select().from(invitations).where(eq(invitations.eventId, eventId)).all();
  const byEmail = new Map(existing.map((row) => [row.email, row]));
  const now = new Date();
  const seen = new Set<string>();

  for (const person of people) {
    const email = normalizeEmail(person.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (registered.has(email)) {
      skippedRegistered.push(email);
      continue;
    }
    const current = byEmail.get(email);
    if (current) {
      const name = person.name?.trim() || current.name;
      await db
        .update(invitations)
        .set({ name, updatedAt: now })
        .where(eq(invitations.id, current.id))
        .run();
      updated.push(email);
      continue;
    }
    const row: InvitationRow = {
      id: newId(),
      eventId,
      email,
      name: person.name?.trim() || null,
      token: newSecretToken(24),
      status: "not_sent",
      message: "",
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      openedAt: null,
      registeredAt: null,
    };
    await db.insert(invitations).values(row).run();
    byEmail.set(email, row);
    added.push(email);
  }
  return { added, updated, skippedRegistered };
}

export async function listInvitations(eventId: string): Promise<InvitationRow[]> {
  const db = await getDb();
  const rows = await db.select().from(invitations).where(eq(invitations.eventId, eventId)).all();
  const order: Record<InviteStatus, number> = { not_sent: 0, sent: 1, opened: 2, registered: 3 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.email.localeCompare(b.email));
}

export type ImportPerson = {
  name: string;
  email: string | null;
  rsvpStatus: "going" | "waitlist";
  alreadyRegistered: boolean;
  alreadyInvited: boolean;
};

/** Names and emails only. Waiver answers are never loaded here. */
export async function listImportPeople(
  sourceEventId: string,
  targetEventId: string,
  includeWaitlist: boolean,
): Promise<ImportPerson[]> {
  const db = await getDb();
  const statuses = includeWaitlist ? (["going", "waitlist"] as const) : (["going"] as const);
  const rows = await db
    .select({
      guestName: rsvps.guestName,
      email: rsvps.email,
      status: rsvps.status,
    })
    .from(rsvps)
    .where(and(eq(rsvps.eventId, sourceEventId), inArray(rsvps.status, [...statuses])))
    .all();
  const registered = await registeredEmails(targetEventId);
  const invited = new Set(
    (await db.select().from(invitations).where(eq(invitations.eventId, targetEventId)).all()).map((row) => row.email),
  );
  return rows
    .map((row) => {
      const email = normalizeEmail(row.email);
      const rsvpStatus = row.status === "waitlist" ? "waitlist" : "going";
      return {
        name: row.guestName,
        email,
        rsvpStatus,
        alreadyRegistered: Boolean(email && registered.has(email)),
        alreadyInvited: Boolean(email && invited.has(email)),
      } satisfies ImportPerson;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function findInvitationByToken(token: string): Promise<{
  invitation: InvitationRow;
  event: EventRow;
} | null> {
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(token)) return null;
  const db = await getDb();
  const invitation = await db.select().from(invitations).where(eq(invitations.token, token)).get();
  if (!invitation) return null;
  const event = await db.select().from(events).where(eq(events.id, invitation.eventId)).get();
  if (!event) return null;
  return { invitation, event };
}

export async function markInvitationOpened(invitation: InvitationRow, now = new Date()): Promise<void> {
  if (invitation.status === "registered" || invitation.status === "opened") {
    if (!invitation.openedAt) {
      const db = await getDb();
      await db.update(invitations).set({ openedAt: now }).where(eq(invitations.id, invitation.id)).run();
    }
    return;
  }
  const db = await getDb();
  await db
    .update(invitations)
    .set({ status: "opened", openedAt: invitation.openedAt || now, updatedAt: now })
    .where(eq(invitations.id, invitation.id))
    .run();
}

export async function markInvitationRegistered(eventId: string, email: string | null | undefined, now = new Date()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const db = await getDb();
  const row = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.eventId, eventId), eq(invitations.email, normalized)))
    .get();
  if (!row || row.status === "registered") return;
  await db
    .update(invitations)
    .set({
      status: "registered",
      registeredAt: now,
      openedAt: row.openedAt || now,
      updatedAt: now,
    })
    .where(eq(invitations.id, row.id))
    .run();
}

export async function markInvitationSent(id: string, message: string, now = new Date()) {
  const db = await getDb();
  const row = await db.select().from(invitations).where(eq(invitations.id, id)).get();
  if (!row) return;
  const status: InviteStatus = row.status === "registered" || row.status === "opened" ? row.status : "sent";
  await db
    .update(invitations)
    .set({ status, message, sentAt: now, updatedAt: now })
    .where(eq(invitations.id, id))
    .run();
}

export async function listOutboxForHost(host: Pick<Host, "role" | "village">): Promise<OutboxMessageRow[]> {
  const db = await getDb();
  const rows = await db.select().from(outboxMessages).orderBy(desc(outboxMessages.createdAt)).all();
  if (isAdmin(host)) return rows;
  const manageable = await db.select().from(events).all();
  const allowed = new Set(manageable.filter((event) => canManageEvent(host, event)).map((event) => event.id));
  return rows.filter((row) => row.eventId && allowed.has(row.eventId));
}
