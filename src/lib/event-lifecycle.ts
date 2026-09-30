import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { carpools, events, invitations, rsvps, type EventRow, type Host } from "./db/schema";
import { canManageEvent } from "./roles";

/** Pacific end instant. Events with no end time end when they start. */
export function eventEndMs(event: { startsAt: Date; endsAt?: Date | null }): number {
  return (event.endsAt ?? event.startsAt).getTime();
}

/** True after the event's Pacific end time. Comparison is on the stored instant. */
export function eventIsPast(event: { startsAt: Date; endsAt?: Date | null }, now: Date): boolean {
  return eventEndMs(event) < now.getTime();
}

export function partitionEvents<T extends { startsAt: Date; endsAt?: Date | null }>(rows: T[], now: Date) {
  const upcoming = rows
    .filter((row) => !eventIsPast(row, now))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = rows
    .filter((row) => eventIsPast(row, now))
    .sort((a, b) => eventEndMs(b) - eventEndMs(a));
  return { upcoming, past };
}

export function canPermanentlyDeleteEvent(counts: { going: number; waitlist: number; notGoing: number }): boolean {
  return counts.going + counts.waitlist + counts.notGoing === 0;
}

export function assertCanDeleteEvent(
  host: Pick<Host, "role" | "village">,
  event: Pick<EventRow, "village">,
  counts: { going: number; waitlist: number; notGoing: number },
) {
  if (!canManageEvent(host, event)) {
    throw new Error("You can only delete events in your village.");
  }
  if (!canPermanentlyDeleteEvent(counts)) {
    throw new Error("This event has registrations, so it cannot be deleted. Cancel it instead.");
  }
}

/** Removes an event that has no RSVPs. Waiver signatures are not stored on the event and are left in place. */
export async function permanentlyDeleteEvent(eventId: string) {
  const db = await getDb();
  const rows = await db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).all();
  if (rows.length > 0) {
    throw new Error("This event has registrations, so it cannot be deleted. Cancel it instead.");
  }
  await db.delete(invitations).where(eq(invitations.eventId, eventId)).run();
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(carpools).where(inArray(carpools.rsvpId, ids)).run();
    await db.delete(rsvps).where(eq(rsvps.eventId, eventId)).run();
  }
  await db.delete(events).where(eq(events.id, eventId)).run();
}
