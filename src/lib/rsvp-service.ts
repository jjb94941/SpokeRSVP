import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { carpools, events, rsvps, type CarpoolRole, type CarpoolRow, type EventRow, type RsvpRow } from "./db/schema";
import { newId, newSecretToken } from "./ids";
import { normalizeEmail, normalizePhone } from "./format";
import { sendEmail, sendSmsTodo, waitlistPromotedText } from "./notify";
import { formatPacificRange } from "./time";

export type RsvpInput = {
  guestName: string;
  email?: string | null;
  phone?: string | null;
  desiredStatus: "going" | "not_going";
  carpoolRole?: CarpoolRole;
  seats?: number | null;
  carpoolNote?: string | null;
  manageToken?: string | null;
};

export type EventCounts = {
  going: number;
  waitlist: number;
  notGoing: number;
  spotsLeft: number;
};

export type RsvpListRow = { rsvp: RsvpRow; carpool: CarpoolRow | null };

export async function getEventCounts(event: EventRow): Promise<EventCounts> {
  const db = await getDb();
  const going =
    (await db
      .select({ c: count() })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
      .get())?.c ?? 0;
  const waitlist =
    (await db
      .select({ c: count() })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "waitlist")))
      .get())?.c ?? 0;
  const notGoing =
    (await db
      .select({ c: count() })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "not_going")))
      .get())?.c ?? 0;
  return {
    going,
    waitlist,
    notGoing,
    spotsLeft: Math.max(0, event.capacity - going),
  };
}

async function findExistingRsvp(eventId: string, input: RsvpInput): Promise<RsvpRow | undefined> {
  const db = await getDb();
  if (input.manageToken) {
    const byToken = await db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.manageToken, input.manageToken)))
      .get();
    if (byToken) return byToken;
  }
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const candidates = await db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all();
  return candidates.find((row) => {
    const rowEmail = normalizeEmail(row.email);
    const rowPhone = normalizePhone(row.phone);
    return Boolean((email && rowEmail && email === rowEmail) || (phone && rowPhone && phone === rowPhone));
  });
}

export async function upsertCarpool(
  rsvpId: string,
  role: CarpoolRole | undefined,
  seats?: number | null,
  note?: string | null,
) {
  const db = await getDb();
  const resolved: CarpoolRole = role || "none";
  const existing = await db.select().from(carpools).where(eq(carpools.rsvpId, rsvpId)).get();
  const values = {
    role: resolved,
    seats: resolved === "offer" ? seats || 1 : null,
    note: note?.trim() || null,
  };
  if (existing) {
    await db.update(carpools).set(values).where(eq(carpools.id, existing.id)).run();
    return;
  }
  if (resolved === "none" && !note) return;
  await db
    .insert(carpools)
    .values({
      id: newId(),
      rsvpId,
      ...values,
    })
    .run();
}

function notifyPromoted(event: EventRow, guest: RsvpRow, appUrl?: string) {
  const manageUrl = appUrl ? `${appUrl}/e/${event.shareToken}?m=${guest.manageToken}` : "";
  const when = formatPacificRange(event.startsAt, event.endsAt);
  if (guest.email) {
    void sendEmail({
      to: guest.email,
      subject: `A spot opened: ${event.title}`,
      text: waitlistPromotedText({
        guestName: guest.guestName,
        eventTitle: event.title,
        when,
        manageUrl: manageUrl || "(open the RSVP link you used before)",
      }),
    });
  }
  if (guest.phone) {
    sendSmsTodo(
      guest.phone,
      `A spot opened for ${event.title}. You are now going. SMS sending is not wired up yet (TODO).`,
    );
  }
}

export async function autoPromoteWaitlist(event: EventRow, appUrl?: string) {
  const db = await getDb();
  const promoted: RsvpRow[] = [];
  await db.transaction(async (tx) => {
    while (true) {
      const goingCount =
        (await tx
          .select({ c: count() })
          .from(rsvps)
          .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
          .get())?.c ?? 0;
      if (goingCount >= event.capacity) break;
      const next = await tx
        .select()
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "waitlist")))
        .orderBy(asc(rsvps.waitlistOrder), asc(rsvps.createdAt))
        .get();
      if (!next) break;
      await tx
        .update(rsvps)
        .set({
          status: "going",
          waitlistOrder: null,
          updatedAt: new Date(),
        })
        .where(eq(rsvps.id, next.id))
        .run();
      promoted.push({ ...next, status: "going", waitlistOrder: null });
    }
  });

  for (const guest of promoted) notifyPromoted(event, guest, appUrl);
  return promoted;
}

export async function promoteRsvp(rsvpId: string, appUrl?: string): Promise<RsvpRow> {
  const db = await getDb();
  const row = await db.select().from(rsvps).where(eq(rsvps.id, rsvpId)).get();
  if (!row) throw new Error("RSVP not found.");
  if (row.status === "going") return row;
  await db
    .update(rsvps)
    .set({ status: "going", waitlistOrder: null, updatedAt: new Date() })
    .where(eq(rsvps.id, rsvpId))
    .run();
  const event = await db.select().from(events).where(eq(events.id, row.eventId)).get();
  const updated = { ...row, status: "going" as const, waitlistOrder: null };
  if (event) notifyPromoted(event, updated, appUrl);
  return updated;
}

export async function submitRsvp(
  event: EventRow,
  input: RsvpInput,
): Promise<{ rsvp: RsvpRow; previousStatus: RsvpRow["status"] | null }> {
  const db = await getDb();
  const name = input.guestName.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (name.length < 2) throw new Error("Please enter your full name.");
  if (!email && !phone) {
    throw new Error("Please include a phone number or an email so we can reach you.");
  }

  const existing = await findExistingRsvp(event.id, input);
  const previousStatus = existing?.status ?? null;

  const result = await db.transaction(async (tx) => {
    const goingExcludingSelf =
      (await tx
        .select({ c: count() })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
        .get())?.c ?? 0;
    const occupied = goingExcludingSelf - (existing?.status === "going" ? 1 : 0);
    const spotsLeft = event.capacity - occupied;

    let status: RsvpRow["status"] = input.desiredStatus === "not_going" ? "not_going" : "going";
    let waitlistOrder: number | null = null;
    if (input.desiredStatus === "going" && spotsLeft <= 0) {
      status = "waitlist";
      if (existing?.status === "waitlist") {
        waitlistOrder = existing.waitlistOrder;
      } else {
        const waitlisted = await tx
          .select({ waitlistOrder: rsvps.waitlistOrder })
          .from(rsvps)
          .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "waitlist")))
          .all();
        const max = waitlisted.reduce((acc, row) => Math.max(acc, row.waitlistOrder ?? 0), 0);
        waitlistOrder = max + 1;
      }
    }

    const now = new Date();
    if (existing) {
      await tx
        .update(rsvps)
        .set({
          guestName: name,
          email,
          phone,
          status,
          waitlistOrder,
          updatedAt: now,
        })
        .where(eq(rsvps.id, existing.id))
        .run();
      return { ...existing, guestName: name, email, phone, status, waitlistOrder, updatedAt: now };
    }

    const row: RsvpRow = {
      id: newId(),
      eventId: event.id,
      guestName: name,
      email,
      phone,
      status,
      waitlistOrder,
      manageToken: newSecretToken(18),
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(rsvps).values(row).run();
    return row;
  });

  if (result.status === "going" && event.carpoolsEnabled) {
    await upsertCarpool(result.id, input.carpoolRole || "none", input.seats, input.carpoolNote);
  } else if (result.status !== "going") {
    await upsertCarpool(result.id, "none", null, null);
  }

  if (previousStatus === "going" && result.status !== "going") {
    await autoPromoteWaitlist(event);
  }

  return { rsvp: result, previousStatus };
}

export async function listRsvps(eventId: string) {
  const db = await getDb();
  const rows = await db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all();
  const ids = rows.map((row) => row.id);
  const pool =
    ids.length > 0
      ? await db.select().from(carpools).where(inArray(carpools.rsvpId, ids)).all()
      : [];
  const byRsvp = new Map(pool.map((row) => [row.rsvpId, row]));
  return rows
    .map((rsvp) => ({ rsvp, carpool: byRsvp.get(rsvp.id) ?? null }))
    .sort((a, b) => {
      const order = { going: 0, waitlist: 1, not_going: 2 } as const;
      const diff = order[a.rsvp.status] - order[b.rsvp.status];
      if (diff !== 0) return diff;
      if (a.rsvp.status === "waitlist") {
        return (a.rsvp.waitlistOrder ?? 0) - (b.rsvp.waitlistOrder ?? 0);
      }
      return a.rsvp.guestName.localeCompare(b.rsvp.guestName);
    });
}
