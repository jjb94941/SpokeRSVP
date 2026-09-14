import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { Flash } from "@/components/Ui";
import { cancelEvent, hostPromote, restoreEvent } from "@/lib/actions/events";
import { appUrl, requireHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { firstName, formatPhoneDisplay } from "@/lib/format";
import { getEventCounts, listRsvps, type RsvpListRow } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";

export default async function HostEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const host = await requireHost();
  const { id } = await params;
  const q = await searchParams;
  const db = await getDb();
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.hostId, host.id)))
    .get();
  if (!event) notFound();
  const counts = await getEventCounts(event);
  const rows = await listRsvps(event.id);
  const going = rows.filter((row) => row.rsvp.status === "going");
  const waitlist = rows.filter((row) => row.rsvp.status === "waitlist");
  const notGoing = rows.filter((row) => row.rsvp.status === "not_going");
  const carpoolRows = going.filter((row) => row.carpool && row.carpool.role !== "none");
  const shareUrl = `${await appUrl()}/e/${event.shareToken}`;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href="/host" className="text-lg font-semibold text-teal underline">
          Back to host home
        </Link>
      </p>
      <Flash ok={q.ok} error={q.error} />
      {event.status === "cancelled" ? (
        <p className="mb-4 rounded-2xl border-2 border-terracotta bg-terracotta/10 px-4 py-3 text-lg font-bold">
          This event is cancelled.
        </p>
      ) : null}
      <h1 className="font-display text-4xl">{event.title}</h1>
      <p className="mt-2 text-xl">{formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}</p>
      <p className="mt-1 text-lg">{event.locationName}</p>
      {event.streetAddress ? (
        <p className="mt-1 text-base text-ink/80">Private street address: {event.streetAddress}</p>
      ) : null}
      <p className="mt-4 text-lg">
        {counts.going} going of {event.capacity}
        {counts.spotsLeft === 0 ? " · full" : ` · ${counts.spotsLeft} spots left`}
        {counts.waitlist ? ` · ${counts.waitlist} waitlist` : ""}
      </p>
      {event.description ? <p className="mt-4 max-w-3xl whitespace-pre-wrap text-lg">{event.description}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <CopyLinkButton url={shareUrl} />
        <Link href={`/e/${event.shareToken}`} className="btn-teal">
          Open guest RSVP page
        </Link>
        <Link href={`/host/events/${event.id}/edit`} className="btn-teal">
          Edit event
        </Link>
        <a href={`/host/events/${event.id}/export`} className="btn-teal">
          Download CSV
        </a>
      </div>
      <p className="mt-3 break-all text-base">
        Share link:{" "}
        <a href={shareUrl} className="font-semibold text-teal underline">
          {shareUrl}
        </a>
      </p>

      <GuestSection title={`Going (${going.length})`}>
        <GuestTable rows={going} showCarpool empty="No one is going yet." />
      </GuestSection>

      <GuestSection title={`Waitlist (${waitlist.length})`}>
        {waitlist.length === 0 ? (
          <p className="text-lg">The waitlist is empty.</p>
        ) : (
          <ul className="grid gap-3">
            {waitlist.map(({ rsvp }, index) => (
              <li key={rsvp.id} className="rounded-xl bg-white px-4 py-3">
                <p className="text-lg font-bold">
                  {index + 1}. {rsvp.guestName}
                </p>
                <p className="text-base">
                  {rsvp.email || "—"} · {rsvp.phone ? formatPhoneDisplay(rsvp.phone) : "—"}
                </p>
                <form action={hostPromote} className="mt-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="rsvpId" value={rsvp.id} />
                  <button type="submit" className="btn-primary">
                    Promote {firstName(rsvp.guestName)} to Going
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </GuestSection>

      {event.carpoolsEnabled ? (
        <GuestSection title={`Carpools (${carpoolRows.length})`}>
          {carpoolRows.length === 0 ? (
            <p className="text-lg">No rides offered or requested yet.</p>
          ) : (
            <ul className="grid gap-3">
              {carpoolRows.map(({ rsvp, carpool }) => (
                <li key={rsvp.id} className="rounded-xl bg-white px-4 py-3 text-lg">
                  <strong>{rsvp.guestName}</strong>{" "}
                  {carpool?.role === "offer"
                    ? `can offer ${carpool.seats || 1} seat${(carpool.seats || 1) === 1 ? "" : "s"}`
                    : "needs a ride"}
                  {carpool?.note ? ` — ${carpool.note}` : ""}
                  <div className="text-base">
                    {rsvp.email || "—"} · {rsvp.phone ? formatPhoneDisplay(rsvp.phone) : "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GuestSection>
      ) : null}

      <GuestSection title={`Not going (${notGoing.length})`}>
        <GuestTable rows={notGoing} empty="No one has said they cannot go." />
      </GuestSection>

      <section className="card mt-8">
        {event.status === "cancelled" ? (
          <form action={restoreEvent}>
            <input type="hidden" name="id" value={event.id} />
            <button type="submit" className="btn-teal">
              Restore this event
            </button>
          </form>
        ) : (
          <form action={cancelEvent}>
            <h2 className="font-display mb-3 text-2xl">Cancel event</h2>
            <p className="mb-3 text-base">
              The RSVP page will tell guests the gathering is cancelled. Existing RSVPs stay in the list.
            </p>
            <label className="mb-4 flex items-center gap-3 text-lg">
              <input type="checkbox" name="confirm" value="yes" className="h-6 w-6 accent-terracotta" />
              Yes, cancel this event
            </label>
            <input type="hidden" name="id" value={event.id} />
            <button type="submit" className="btn-primary">
              Cancel event
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function GuestSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mt-8">
      <h2 className="font-display mb-4 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function GuestTable({
  rows,
  showCarpool,
  empty,
}: {
  rows: RsvpListRow[];
  showCarpool?: boolean;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-lg">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-lg">
        <thead>
          <tr className="border-b border-sand-deep">
            <th className="py-2 pr-3 font-bold">Name</th>
            <th className="py-2 pr-3 font-bold">Email</th>
            <th className="py-2 pr-3 font-bold">Phone</th>
            {showCarpool ? <th className="py-2 font-bold">Ride</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ rsvp, carpool }) => (
            <tr key={rsvp.id} className="border-b border-sand-deep/70">
              <td className="py-2 pr-3">{rsvp.guestName}</td>
              <td className="py-2 pr-3">{rsvp.email || "—"}</td>
              <td className="py-2 pr-3">{rsvp.phone ? formatPhoneDisplay(rsvp.phone) : "—"}</td>
              {showCarpool ? (
                <td className="py-2">
                  {carpool?.role === "offer"
                    ? `Offers ${carpool.seats || 1}`
                    : carpool?.role === "need"
                      ? "Needs a ride"
                      : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
