import Link from "next/link";
import { desc } from "drizzle-orm";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { toDateMs } from "@/lib/dates";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";

export default async function HomePage() {
  const db = await getDb();
  const upcoming = (await db.select().from(events).orderBy(desc(events.startsAt)).all())
    .filter((event) => event.status === "published")
    .sort((a, b) => toDateMs(a.startsAt) - toDateMs(b.startsAt));
  const listed = await Promise.all(
    upcoming.map(async (event) => ({ event, counts: await getEventCounts(event) })),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <p className="text-lg font-semibold tracking-wide text-teal">Mill Valley Village</p>
        <h1 className="font-display mt-2 max-w-3xl text-4xl leading-tight font-semibold sm:text-5xl">
          RSVP for village gatherings — waitlist and rides included.
        </h1>
        <p className="mt-4 max-w-2xl text-xl">
          A simple tool for neighbors. No account needed to RSVP. Hosts keep the list, the waitlist, and
          optional carpools in one place. Complements Helpful Village; it does not replace it.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a href="#events" className="btn-primary">
            See upcoming events
          </a>
          <Link href="/login" className="btn-teal">
            Host sign in
          </Link>
        </div>

        <section id="events" className="mt-14">
          <h2 className="font-display text-3xl">Upcoming events</h2>
          {listed.length === 0 ? (
            <p className="mt-4 text-lg">
              No published events yet. Hosts can{" "}
              <Link href="/login" className="font-semibold text-teal underline">
                sign in
              </Link>{" "}
              to create one. If you just cloned this project, run <code>npm run db:seed</code>.
            </p>
          ) : (
            <ul className="mt-6 grid gap-5">
              {listed.map(({ event, counts }) => (
                  <li key={event.id} className="card">
                    <p className="text-base font-semibold text-teal">{formatPacificRange(event.startsAt, event.endsAt)}</p>
                    <h3 className="font-display mt-1 text-3xl">{event.title}</h3>
                    <p className="mt-2 text-lg">{event.locationName}</p>
                    <p className="mt-3 text-lg">
                      {counts.going} going of {event.capacity}
                      {counts.waitlist ? ` · ${counts.waitlist} on the waitlist` : ""}
                      {event.carpoolsEnabled ? " · Carpools welcome" : ""}
                    </p>
                    <Link href={`/e/${event.shareToken}`} className="btn-primary mt-5">
                      RSVP for {event.title}
                    </Link>
                  </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
