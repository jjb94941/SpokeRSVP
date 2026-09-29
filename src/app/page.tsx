import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Flash } from "@/components/Ui";
import { memberCancelRsvp, memberRsvp, signInMember, signOutMember } from "@/lib/actions/member";
import { getMemberEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, rsvps } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/format";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";
import { VILLAGES, parseVillageFilter, toggleVillageHref, villageFilterHref, villageTitle } from "@/lib/villages";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ villages?: string; ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const selected = parseVillageFilter(params.villages);
  const memberEmail = await getMemberEmail();
  const returnTo = villageFilterHref(selected);
  const db = await getDb();
  const published = (await db.select().from(events).orderBy(desc(events.startsAt)).all())
    .filter((event) => event.status === "published")
    .filter((event) => selected.length === 0 || selected.includes(event.village as (typeof VILLAGES)[number]))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const eventIds = published.map((event) => event.id);
  const memberRsvps =
    memberEmail && eventIds.length > 0
      ? (await db.select().from(rsvps).where(inArray(rsvps.eventId, eventIds)).all()).filter(
          (row) => normalizeEmail(row.email) === memberEmail,
        )
      : [];
  const rsvpByEvent = new Map(memberRsvps.map((row) => [row.eventId, row]));
  const listed = await Promise.all(
    published.map(async (event) => ({
      event,
      counts: await getEventCounts(event),
      rsvp: rsvpByEvent.get(event.id),
    })),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <p className="text-lg font-semibold tracking-wide text-teal">Marin Villages</p>
        <h1 className="font-display mt-2 max-w-3xl text-4xl leading-tight font-semibold">Village events</h1>
        <p className="mt-3 max-w-2xl text-[17px] text-ink">
          See gatherings across the villages, or choose the ones you want. Sign up with your email, and cancel the same way. No password. My events lists every gathering you joined.
        </p>
        <Flash ok={params.ok} error={params.error} />

        {memberEmail ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form action={signOutMember} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <p className="meta-line">
                Signed in as <span className="font-bold text-ink">{memberEmail}</span>
              </p>
              <button type="submit" className="btn-secondary">
                Use a different email
              </button>
            </form>
            <Link href="/my-events" className="btn-teal">
              My events
            </Link>
          </div>
        ) : (
          <form action={signInMember} className="card mt-6 max-w-xl">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label htmlFor="email" className="mb-2 block text-[17px] font-bold text-ink">
              Your email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
            />
            <button type="submit" className="btn-primary mt-4">
              Continue with email
            </button>
          </form>
        )}

        <div className="mt-8 flex flex-wrap gap-3" role="group" aria-label="Filter by village">
          <Link href="/" className={selected.length === 0 ? "chip chip-active" : "chip"} aria-current={selected.length === 0 ? "true" : undefined}>
            All villages
          </Link>
          {VILLAGES.map((village) => {
            const on = selected.includes(village);
            return (
              <Link
                key={village}
                href={toggleVillageHref(selected, village)}
                className={on ? "chip chip-active" : "chip"}
                aria-current={on ? "true" : undefined}
              >
                {village}
              </Link>
            );
          })}
        </div>

        <section className="mt-8">
          <h2 className="font-display text-[28px] font-bold">
            {selected.length === 0 ? "All village events" : selected.map(villageTitle).join(" · ")}
          </h2>
          {listed.length === 0 ? (
            <p className="mt-4 text-[17px] text-ink">
              No published events for this choice.{" "}
              <Link href="/" className="font-bold text-teal underline">
                Show all villages
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-5 grid gap-[14px]">
              {listed.map(({ event, counts, rsvp }) => (
                <li key={event.id} className="card">
                  <p className="meta-line">{villageTitle(event.village)}</p>
                  <h3 className="font-display mt-1 text-[24px] leading-tight font-bold">{event.title}</h3>
                  <p className="meta-line mt-2">{formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}</p>
                  <p className="meta-line">{event.locationName}</p>
                  <p className="status-line mt-2.5">
                    {counts.going} going · {counts.spotsLeft} open {counts.spotsLeft === 1 ? "seat" : "seats"}
                    {counts.waitlist ? ` · ${counts.waitlist} waitlist` : ""}
                  </p>
                  {rsvp && (rsvp.status === "going" || rsvp.status === "waitlist") ? (
                    <div className="mt-4">
                      <p className="status-line">
                        {rsvp.status === "going" ? "You are signed up." : "You are on the waitlist."}
                      </p>
                      <form action={memberCancelRsvp} className="mt-4">
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="hidden" name="eventId" value={event.id} />
                        <button type="submit" className="btn-secondary">
                          {rsvp.status === "going"
                            ? `Cancel signup for ${event.title}`
                            : `Leave the waitlist for ${event.title}`}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <form action={memberRsvp} className="mt-4">
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button type="submit" className="btn-primary">
                        {counts.spotsLeft === 0 ? `Join the waitlist for ${event.title}` : `Sign up for ${event.title}`}
                      </button>
                    </form>
                  )}
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
