import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Flash } from "@/components/Ui";
import { requireHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, hosts } from "@/lib/db/schema";
import { isAdmin, roleLabel } from "@/lib/roles";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";

export default async function HostHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const host = await requireHost();
  const admin = isAdmin(host);
  const params = await searchParams;
  const db = await getDb();
  const listedQuery = db
    .select({
      event: events,
      creatorName: hosts.name,
    })
    .from(events)
    .innerJoin(hosts, eq(events.hostId, hosts.id));
  const rows = (
    admin
      ? await listedQuery.orderBy(desc(events.startsAt)).all()
      : await listedQuery.where(eq(events.hostId, host.id)).orderBy(desc(events.startsAt)).all()
  ).sort((a, b) => {
    if (a.event.status !== b.event.status) return a.event.status === "cancelled" ? 1 : -1;
    return a.event.startsAt.getTime() - b.event.startsAt.getTime();
  });
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
            {admin ? "All village events" : "Your events"}
          </h1>
          <p className="mt-2 max-w-2xl text-[17px] text-ink">
            {admin
              ? "As an administrator you can view and manage every event, including ones created by sub-administrators."
              : "You can create events and manage the ones you created. Other hosts’ events stay with them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {admin ? (
            <Link href="/host/admins" className="btn-secondary">
              Manage hosts
            </Link>
          ) : null}
          <Link href="/host/events/new" className="btn-primary">
            Create an event
          </Link>
        </div>
      </div>
      {listed.length === 0 ? (
        <p className="mt-8 text-[17px] text-ink">
          No events yet. Create one and share the RSVP link with neighbors.
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
                {admin ? (
                  <p className="meta-line">
                    Created by {event.hostId === host.id ? "you" : creatorName}
                  </p>
                ) : null}
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
