import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import { events, rsvps } from "./db/schema";
import { reminderText, sendEmail, sendSmsTodo } from "./notify";
import { formatPacificRange } from "./time";

/**
 * Sends a reminder to Going guests whose event starts in the next 48 hours.
 * Email uses Resend when configured; otherwise it is logged (stub).
 * SMS is TODO.
 */
export async function sendDueReminders(now = Date.now(), appUrl = process.env.APP_URL || "http://localhost:3000") {
  const db = await getDb();
  const windowEnd = now + 48 * 60 * 60 * 1000;
  const upcoming = await db
    .select()
    .from(events)
    .where(and(eq(events.status, "published"), gte(events.startsAt, new Date(now)), lte(events.startsAt, new Date(windowEnd))))
    .all();

  let emailed = 0;
  let smsTodo = 0;
  for (const event of upcoming) {
    const going = await db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "going")))
      .all();
    for (const guest of going) {
      const manageUrl = `${appUrl.replace(/\/$/, "")}/e/${event.shareToken}?m=${guest.manageToken}`;
      const when = formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime());
      if (guest.email) {
        await sendEmail({
          to: guest.email,
          subject: `Reminder: ${event.title}`,
          text: reminderText({
            guestName: guest.guestName,
            eventTitle: event.title,
            when,
            where: event.locationName,
            manageUrl,
          }),
        });
        emailed += 1;
      }
      if (guest.phone) {
        sendSmsTodo(guest.phone, `Reminder: ${event.title} — ${when}. SMS TODO.`);
        smsTodo += 1;
      }
    }
  }
  return { events: upcoming.length, emailed, smsTodo };
}
