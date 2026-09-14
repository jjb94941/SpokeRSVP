import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "./db";
import { carpools, events, rsvps, type CarpoolRole, type EventRow, type RsvpRow } from "./db/schema";
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

export function getEventCounts(event: EventRow): EventCounts {
  const db = getDb();
  const going =
    db
      .select({ c: count() })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
      .get()?.c ?? 0;
  const waitlist =
    db
      .select({ c: count() })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "waitlist")))
      .get()?.c ?? 0;
  const notGoing =
    db
      .select({ c: count() })
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "not_going")))
      .get()?.c ?? 0;
  return {
    going,
    waitlist,
    notGoing,
    spotsLeft: Math.max(0, event.capacity - going),
  };
}

function findExistingRsvp(eventId: string, input: RsvpInput): RsvpRow | undefined {
  const db = getDb();
  if (input.manageToken) {
    const byToken = db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.eventId, eventId), eq(rsvps.manageToken, input.manageToken)))
      .get();
    if (byToken) return byToken;
  }
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const candidates = db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all();
  return candidates.find((row) => {
    const rowEmail = normalizeEmail(row.email);
    const rowPhone = normalizePhone(row.phone);
    return Boolean((email && rowEmail && email === rowEmail) || (phone && rowPhone && phone === rowPhone));
  });
}

export function upsertCarpool(
  rsvpId: string,
  role: CarpoolRole | undefined,
  seats?: number | null,
  note?: string | null,
) {
  const db = getDb();
  const resolved: CarpoolRole = role || "none";
  const existing = db.select().from(carpools).where(eq(carpools.rsvpId, rsvpId)).get();
  const values = {
    role: resolved,
    seats: resolved === "offer" ? seats || 1 : null,
    note: note?.trim() || null,
  };
  if (existing) {
    db.update(carpools).set(values).where(eq(carpools.id, existing.id)).run();
    return;
  }
  if (resolved === "none" && !note) return;
  db.insert(carpools)
    .values({
      id: newId(),
      rsvpId,
      ...values,
    })
    .run();
}

function notifyPromoted(event: EventRow, guest: RsvpRow, appUrl?: string) {
  const manageUrl = appUrl ? `${appUrl}/e/${event.shareToken}?m=${guest.manageToken}` : "";
  const when = formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime());
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

export function autoPromoteWaitlist(event: EventRow, appUrl?: string) {
  const db = getDb();
  const promoted: RsvpRow[] = [];
  db.transaction((tx) => {
    while (true) {
      const goingCount =
        tx
          .select({ c: count() })
          .from(rsvps)
          .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
          .get()?.c ?? 0;
      if (goingCount >= event.capacity) break;
      const next = tx
        .select()
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "waitlist")))
        .orderBy(asc(rsvps.waitlistOrder), asc(rsvps.createdAt))
        .get();
      if (!next) break;
      tx.update(rsvps)
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

export function promoteRsvp(rsvpId: string, appUrl?: string): RsvpRow {
  const db = getDb();
  const row = db.select().from(rsvps).where(eq(rsvps.id, rsvpId)).get();
  if (!row) throw new Error("RSVP not found.");
  if (row.status === "going") return row;
  db.update(rsvps)
    .set({ status: "going", waitlistOrder: null, updatedAt: new Date() })
    .where(eq(rsvps.id, rsvpId))
    .run();
  const event = db.select().from(events).where(eq(events.id, row.eventId)).get();
  const updated = { ...row, status: "going" as const, waitlistOrder: null };
  if (event) notifyPromoted(event, updated, appUrl);
  return updated;
}

export function submitRsvp(
  event: EventRow,
  input: RsvpInput,
): { rsvp: RsvpRow; previousStatus: RsvpRow["status"] | null } {
  const db = getDb();
  const name = input.guestName.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (name.length < 2) throw new Error("Please enter your full name.");
  if (!email && !phone) {
    throw new Error("Please include a phone number or an email so we can reach you.");
  }

  const existing = findExistingRsvp(event.id, input);
  const previousStatus = existing?.status ?? null;

  const result = db.transaction((tx) => {
    const goingExcludingSelf =
      tx
        .select({ c: count() })
        .from(rsvps)
        .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
        .get()?.c ?? 0;
    const occupied = goingExcludingSelf - (existing?.status === "going" ? 1 : 0);
    const spotsLeft = event.capacity - occupied;

    let status: RsvpRow["status"] = input.desiredStatus === "not_going" ? "not_going" : "going";
    let waitlistOrder: number | null = null;
    if (input.desiredStatus === "going" && spotsLeft <= 0) {
      status = "waitlist";
      if (existing?.status === "waitlist") {
        waitlistOrder = existing.waitlistOrder;
      } else {
        const waitlisted = tx
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
      tx.update(rsvps)
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
    tx.insert(rsvps).values(row).run();
    return row;
  });

  if (result.status === "going" && event.carpoolsEnabled) {
    upsertCarpool(result.id, input.carpoolRole || "none", input.seats, input.carpoolNote);
  } else if (result.status !== "going") {
    upsertCarpool(result.id, "none", null, null);
  }

  if (previousStatus === "going" && result.status !== "going") {
    autoPromoteWaitlist(event);
  }

  return { rsvp: result, previousStatus };
}

export function listRsvps(eventId: string) {
  const db = getDb();
  const rows = db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all();
  const ids = new Set(rows.map((row) => row.id));
  const pool = db
    .select()
    .from(carpools)
    .all()
    .filter((row) => ids.has(row.rsvpId));
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
