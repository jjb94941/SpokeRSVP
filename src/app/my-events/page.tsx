import Link from "next/link";
import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Flash } from "@/components/Ui";
import { memberCancelRsvp, signInMember, signOutMember } from "@/lib/actions/member";
import { getMemberEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, rsvps, type EventRow, type RsvpRow } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/format";
import { formatPacificRange } from "@/lib/time";
import { villageTitle } from "@/lib/villages";

export const metadata: Metadata = {
  title: "My events",
};

const RETURN_TO = "/my-events";

export default async function MyEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const memberEmail = await getMemberEmail();
  const registrations = memberEmail ? await listMemberRegistrations(memberEmail) : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <p className="text-lg font-semibold tracking-wide text-teal">Marin Villages</p>
        <h1 className="font-display mt-2 max-w-3xl text-4xl leading-tight font-semibold">My events</h1>
        <p className="mt-3 max-w-2xl text-[17px] text-ink">
          Every gathering you signed up for, in any village. Cancel here if your plans change. No password.
        </p>
        <Flash ok={params.ok} error={params.error} />

        {memberEmail ? (
          <form action={signOutMember} className="mt-6 flex flex-wrap items-center gap-3">
            <input type="hidden" name="returnTo" value={RETURN_TO} />
            <p className="meta-line">
              Signed in as <span className="font-bold text-ink">{memberEmail}</span>
            </p>
            <button type="submit" className="btn-secondary">
              Use a different email
            </button>
            {registrations.length > 0 ? (
              <Link href="/" className="btn-secondary">
                See village events
              </Link>
            ) : null}
          </form>
        ) : (
          <form action={signInMember} className="card mt-6 max-w-xl">
            <input type="hidden" name="returnTo" value={RETURN_TO} />
            <label htmlFor="email" className="mb-2 block text-[17px] font-bold text-ink">
              Your email
            </label>
            <p className="mb-3 text-[17px] text-ink">Enter the email you used to sign up. No password is needed.</p>
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

        {memberEmail ? (
          <section className="mt-8">
            <h2 className="font-display text-[28px] font-bold">
              {registrations.length === 0
                ? "No signups yet"
                : registrations.length === 1
                  ? "1 event"
                  : `${registrations.length} events`}
            </h2>
            {registrations.length === 0 ? (
              <div className="card mt-5">
                <p className="text-[17px] text-ink">You are not signed up for any events yet.</p>
                <p className="mt-2 text-[17px] text-ink">
                  Choose a village gathering, then come back here to see it or cancel.
                </p>
                <Link href="/" className="btn-primary mt-4">
                  See village events
                </Link>
              </div>
            ) : (
              <ul className="mt-5 grid gap-[14px]">
                {registrations.map(({ event, rsvp }) => (
                  <li key={rsvp.id} className="card">
                    <p className="meta-line">{villageTitle(event.village)}</p>
                    <h3 className="font-display mt-1 text-[24px] leading-tight font-bold">{event.title}</h3>
                    <p className="meta-line mt-2">
                      {formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}
                    </p>
                    <p className="meta-line">{event.locationName}</p>
                    <p className="status-line mt-2.5">
                      {rsvp.status === "waitlist" ? "You are on the waitlist." : "You are signed up."}
                    </p>
                    {event.status === "cancelled" ? (
                      <p className="mt-2 text-[17px] font-bold text-terracotta">The host cancelled this gathering.</p>
                    ) : null}
                    <form action={memberCancelRsvp} className="mt-4">
                      <input type="hidden" name="returnTo" value={RETURN_TO} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button type="submit" className="btn-secondary">
                        {`Cancel my planned attendance at ${event.title}`}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="mt-8 text-[17px] text-ink">
            <Link href="/" className="font-bold text-teal underline">
              See village events
            </Link>
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

async function listMemberRegistrations(memberEmail: string): Promise<{ event: EventRow; rsvp: RsvpRow }[]> {
  const db = await getDb();
  const mine = (await db.select().from(rsvps).all()).filter(
    (row) =>
      normalizeEmail(row.email) === memberEmail && (row.status === "going" || row.status === "waitlist"),
  );
  if (mine.length === 0) return [];
  const eventRows = await db
    .select()
    .from(events)
    .where(
      inArray(
        events.id,
        mine.map((row) => row.eventId),
      ),
    )
    .all();
  const byId = new Map(eventRows.map((event) => [event.id, event]));
  const now = Date.now();
  return mine
    .flatMap((rsvp) => {
      const event = byId.get(rsvp.eventId);
      return event ? [{ event, rsvp }] : [];
    })
    .sort((a, b) => {
      const aPast = a.event.startsAt.getTime() < now;
      const bPast = b.event.startsAt.getTime() < now;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return a.event.startsAt.getTime() - b.event.startsAt.getTime();
    });
}
