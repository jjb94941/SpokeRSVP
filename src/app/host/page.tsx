import Link from "next/link";
import { eq } from "drizzle-orm";
import { Flash } from "@/components/Ui";
import { requireHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, hosts } from "@/lib/db/schema";
import { partitionEvents } from "@/lib/event-lifecycle";
import { isAdmin, roleLabel } from "@/lib/roles";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";
import { villageTitle } from "@/lib/villages";

export default async function HostHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; when?: string }>;
}) {
  const host = await requireHost();
  const admin = isAdmin(host);
  const params = await searchParams;
  const showingPast = params.when === "past";
  const db = await getDb();
  const listedQuery = db
    .select({
      event: events,
      creatorName: hosts.name,
    })
    .from(events)
    .innerJoin(hosts, eq(events.hostId, hosts.id));
  const scoped = admin
    ? listedQuery
    : listedQuery.where(eq(events.village, host.village || ""));
  const loaded = await scoped.all();
  const parts = partitionEvents(
    loaded.map((row) => row.event),
    new Date(),
  );
  const byId = new Map(loaded.map((row) => [row.event.id, row]));
  const rows = (showingPast ? parts.past : parts.upcoming).map((event) => byId.get(event.id)!);
  const listed = await Promise.all(
    rows.map(async (row) => ({ ...row, counts: await getEventCounts(row.event) })),
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <Flash ok={params.ok} error={params.error} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-line">
            Signed in as {host.email} · {roleLabel(host.role)}
          </p>
          <h1 className="font-display mt-1 text-[32px] leading-tight font-bold">
            {showingPast
              ? "Past events"
              : admin
                ? "All village events"
                : host.village
                  ? `${villageTitle(host.village)} events`
                  : "Your events"}
          </h1>
          <p className="mt-2 max-w-2xl text-[17px] text-ink">
            {admin
              ? "As a super-administrator you can view and manage events in every Marin Villages community, and appoint a host for each village."
              : host.village
                ? `You can view and manage every event for ${villageTitle(host.village)}. Other villages stay with their own hosts.`
                : "Your account is not assigned to a village yet. Ask a super-administrator to assign one."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {admin ? (
            <Link href="/host/admins" className="btn-secondary">
              Manage hosts
            </Link>
          ) : null}
          <Link href={showingPast ? "/host" : "/host?when=past"} className="btn-secondary">
            {showingPast ? "Upcoming events" : "Past events"}
          </Link>
          <Link href="/host/events/new" className="btn-primary">
            Create an event
          </Link>
        </div>
      </div>
      {showingPast ? (
        <p className="mt-4 max-w-2xl text-[17px] text-ink">
          These gatherings have ended. Open one to see who came and any waiver answers. They are hidden from the public
          list and from upcoming events.
        </p>
      ) : null}
      {listed.length === 0 ? (
        <p className="mt-8 text-[17px] text-ink">
          {showingPast
            ? "No past events yet."
            : "No upcoming events. Create one and share the RSVP link with neighbors."}
        </p>
      ) : (
        <ul className="mt-8 grid gap-[14px]">
          {listed.map(({ event, creatorName, counts }) => (
              <li key={event.id} className="card">
                {event.status === "cancelled" ? (
                  <p className="mb-2 text-[16px] font-bold text-terracotta">Cancelled</p>
                ) : null}
                <h2 className="font-display text-[24px] leading-tight font-bold">{event.title}</h2>
                <p className="meta-line mt-2">
                  {formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}
                </p>
                <p className="meta-line">{event.locationName}</p>
                {admin ? <p className="meta-line">{villageTitle(event.village)}</p> : null}
                <p className="meta-line">
                  Created by {event.hostId === host.id ? "you" : creatorName}
                </p>
                <p className="status-line mt-2.5">
                  {counts.going} going · {counts.waitlist} waitlist · {counts.notGoing} not going · capacity{" "}
                  {event.capacity}
                </p>
                <Link href={`/host/events/${event.id}`} className="btn-secondary mt-4">
                  Open dashboard for {event.title}
                </Link>
              </li>
          ))}
        </ul>
      )}
    </main>
  );
}
