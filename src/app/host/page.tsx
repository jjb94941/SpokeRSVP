import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Flash } from "@/components/Ui";
import { requireHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";

export default async function HostHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const host = await requireHost();
  const params = await searchParams;
  const rows = getDb()
    .select()
    .from(events)
    .where(eq(events.hostId, host.id))
    .orderBy(desc(events.startsAt))
    .all()
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "cancelled" ? 1 : -1;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <Flash ok={params.ok} error={params.error} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-lg text-teal">Signed in as {host.email}</p>
          <h1 className="font-display mt-1 text-4xl">Your events</h1>
        </div>
        <Link href="/host/events/new" className="btn-primary">
          Create an event
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-8 text-lg">No events yet. Create one and share the RSVP link with neighbors.</p>
      ) : (
        <ul className="mt-8 grid gap-5">
          {rows.map((event) => {
            const counts = getEventCounts(event);
            return (
              <li key={event.id} className="card">
                {event.status === "cancelled" ? (
                  <p className="mb-2 font-bold text-terracotta">Cancelled</p>
                ) : null}
                <h2 className="font-display text-3xl">{event.title}</h2>
                <p className="mt-1 text-lg">{formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}</p>
                <p className="mt-1 text-lg">{event.locationName}</p>
                <p className="mt-3 text-lg">
                  {counts.going} going · {counts.waitlist} waitlist · {counts.notGoing} not going · capacity{" "}
                  {event.capacity}
                </p>
                <Link href={`/host/events/${event.id}`} className="btn-teal mt-5">
                  Open dashboard for {event.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
