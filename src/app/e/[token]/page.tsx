import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Flash } from "@/components/Ui";
import { RsvpForm } from "@/components/RsvpForm";
import { getCurrentHost, getGuestManageToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { carpools, events, rsvps, type CarpoolRow, type RsvpRow } from "@/lib/db/schema";
import { firstName } from "@/lib/format";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";

export default async function PublicRsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ m?: string; ok?: string; error?: string }>;
}) {
  const { token } = await params;
  const q = await searchParams;
  const db = await getDb();
  const event = await db.select().from(events).where(eq(events.shareToken, token)).get();
  if (!event) notFound();
  const host = await getCurrentHost();
  const manageToken = q.m || (await getGuestManageToken(event.id));
  const existing = manageToken
    ? await db.select().from(rsvps).where(eq(rsvps.manageToken, manageToken)).get()
    : undefined;
  const existingForEvent = existing?.eventId === event.id ? existing : undefined;
  const carpool = existingForEvent
    ? await db.select().from(carpools).where(eq(carpools.rsvpId, existingForEvent.id)).get()
    : undefined;
  const counts = await getEventCounts(event);
  const full = counts.spotsLeft <= 0 && existingForEvent?.status !== "going";
  const canSeeCarpools =
    event.carpoolsEnabled && (host || existingForEvent?.status === "going");
  const goingRows = canSeeCarpools
    ? await db.select().from(rsvps).where(eq(rsvps.eventId, event.id)).all()
    : [];
  const goingCarpools: { row: RsvpRow; pool: CarpoolRow }[] = [];
  for (const row of goingRows) {
    if (row.status !== "going") continue;
    const pool = await db.select().from(carpools).where(eq(carpools.rsvpId, row.id)).get();
    if (!pool || pool.role === "none") continue;
    goingCarpools.push({ row, pool });
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <Flash ok={q.ok} error={q.error} />
        {event.status === "cancelled" ? (
          <p className="mb-6 rounded-2xl border-2 border-terracotta bg-terracotta/10 px-4 py-3 text-lg font-bold">
            This event has been cancelled.
          </p>
        ) : null}
        <p className="text-lg font-semibold text-teal">Mill Valley Village</p>
        <h1 className="font-display mt-1 text-4xl sm:text-5xl">{event.title}</h1>
        <p className="mt-3 text-xl">{formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}</p>
        <p className="mt-2 text-xl">{event.locationName}</p>
        {host && event.streetAddress ? (
          <p className="mt-1 text-base text-ink/80">Street address (host only): {event.streetAddress}</p>
        ) : null}
        <p className="mt-4 text-lg">
          {counts.going} of {event.capacity} going
          {full ? " · waitlist is open" : ""}
          {counts.waitlist ? ` · ${counts.waitlist} waiting` : ""}
        </p>
        {event.description ? (
          <p className="mt-5 whitespace-pre-wrap text-lg">{event.description}</p>
        ) : null}

        {event.status === "cancelled" ? null : (
          <div className="mt-8">
            <RsvpForm event={event} existing={existingForEvent} carpool={carpool} full={full} />
          </div>
        )}

        {canSeeCarpools ? (
          <section className="card mt-8">
            <h2 className="font-display mb-3 text-2xl">Rides for people who are going</h2>
            <p className="mb-4 text-base">
              Contact details stay with the host. Here you can see first names and who has extra seats.
            </p>
            {goingCarpools.length === 0 ? (
              <p className="text-lg">No rides posted yet.</p>
            ) : (
              <ul className="grid gap-2 text-lg">
                {goingCarpools.map(({ row, pool }) => (
                  <li key={row.id}>
                    <strong>{host ? row.guestName : firstName(row.guestName)}</strong>{" "}
                    {pool.role === "offer"
                      ? `can offer ${pool.seats || 1} seat${(pool.seats || 1) === 1 ? "" : "s"}`
                      : "needs a ride"}
                    {pool.note ? ` — ${pool.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : event.carpoolsEnabled ? (
          <p className="mt-8 text-lg">
            After you RSVP as going, you can see who is offering or needing a ride.
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
