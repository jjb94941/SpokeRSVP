import type { Metadata } from "next";
import Link from "next/link";
import { count } from "drizzle-orm";
import { Flash, Field, inputClass } from "@/components/Ui";
import { createHost, removeHost, setHostRole, setHostVillage } from "@/lib/actions/hosts";
import { readNewHostPasswordFlash } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, hosts, type Host } from "@/lib/db/schema";
import { accountRoleLabel, countAdmins, isAdmin, requireAdmin } from "@/lib/roles";
import { VILLAGES } from "@/lib/villages";

export const metadata: Metadata = { title: "Manage hosts" };

export default async function HostAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await requireAdmin();
  const params = await searchParams;
  const tempPassword = await readNewHostPasswordFlash();
  const db = await getDb();
  const allHosts = await db.select().from(hosts).all();
  allHosts.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  const adminCount = countAdmins(allHosts);
  const counts = await db
    .select({ hostId: events.hostId, n: count() })
    .from(events)
    .groupBy(events.hostId)
    .all();
  const eventCountByHost = new Map(counts.map((row) => [row.hostId, Number(row.n)]));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href="/host" className="text-[17px] font-bold text-teal underline">
          Back to all village events
        </Link>
      </p>
      <h1 className="font-display text-4xl">Manage hosts</h1>
      <p className="mt-3 max-w-3xl text-lg">
        Super-admins can manage events in every community. Add another super-admin, or a host for one village.
        A village host can manage every event for that village only.
      </p>
      <Flash ok={params.ok} error={params.error} />
      {tempPassword ? (
        <section className="mb-6 rounded-2xl border-2 border-teal bg-teal/10 px-5 py-4" role="status">
          <h2 className="font-display text-2xl">Temporary password</h2>
          <p className="mt-2 text-lg">Share this once with the new person. It is not shown again.</p>
          <p className="mt-3 break-all rounded-xl bg-white px-4 py-3 font-mono text-xl">{tempPassword}</p>
        </section>
      ) : null}

      <section className="card mb-8">
        <h2 className="font-display mb-2 text-3xl">Add a person</h2>
        <p className="mb-5 text-lg">
          Choose Super-admin for every village, or Village host for one village. They sign in with this email
          and password, the same way existing hosts do.
        </p>
        <form action={createHost} className="max-w-xl">
          <fieldset className="mb-5">
            <legend className="mb-2 text-lg font-bold">Role</legend>
            <label className="mb-3 flex min-h-14 items-center gap-3 text-lg">
              <input type="radio" name="role" value="admin" className="h-6 w-6 accent-terracotta" />
              Super-admin — every village
            </label>
            <label className="flex min-h-14 items-center gap-3 text-lg">
              <input
                type="radio"
                name="role"
                value="sub_admin"
                defaultChecked
                className="h-6 w-6 accent-terracotta"
              />
              Village host — one village
            </label>
          </fieldset>
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" required minLength={2} className={inputClass} autoComplete="name" />
          </Field>
          <Field
            label="Village"
            htmlFor="village"
            hint="Used only for a village host. A super-admin is not assigned to one village."
          >
            <VillageSelect id="village" defaultValue="Mill Valley" />
          </Field>
          <Field label="Email" htmlFor="email" hint="They will use this email to sign in.">
            <input id="email" name="email" type="email" required className={inputClass} autoComplete="email" />
          </Field>
          <Field
            label="Temporary password (optional)"
            htmlFor="password"
            hint="Leave blank to generate one. It must be at least 8 characters if you type it."
          >
            <input
              id="password"
              name="password"
              type="text"
              minLength={8}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
          <button type="submit" className="btn-primary">
            Add this person
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-3xl">Host accounts</h2>
        <ul className="mt-5 grid gap-5">
          {allHosts.map((row) => (
            <HostAccountCard
              key={row.id}
              host={row}
              actor={actor}
              adminCount={adminCount}
              eventCount={eventCountByHost.get(row.id) || 0}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}

function VillageSelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <select id={id} name="village" required defaultValue={defaultValue} className={inputClass}>
      {VILLAGES.map((village) => (
        <option key={village} value={village}>
          {village}
        </option>
      ))}
    </select>
  );
}

function HostAccountCard({
  host,
  actor,
  adminCount,
  eventCount,
}: {
  host: Host;
  actor: Host;
  adminCount: number;
  eventCount: number;
}) {
  const self = host.id === actor.id;
  const lastAdmin = isAdmin(host) && adminCount <= 1;
  const canDemote = isAdmin(host) && !self && !lastAdmin;
  const canPromote = !isAdmin(host);
  const canRemove = !self && !lastAdmin;

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-3xl">
            {host.name}
            {self ? <span className="ml-2 text-xl font-sans font-bold text-teal">(you)</span> : null}
          </h3>
          <p className="mt-1 text-lg">{host.email}</p>
          <p className="mt-2 text-lg">
            <span className="rounded-full bg-sand px-3 py-1 font-bold">{accountRoleLabel(host)}</span>
            <span className="ml-3 text-ink/80">
              {eventCount} event{eventCount === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>

      {self && lastAdmin ? (
        <p className="mt-4 text-base">
          You are the last super-admin, so you cannot demote or remove yourself.
        </p>
      ) : null}
      {self && !lastAdmin ? (
        <p className="mt-4 text-base">You cannot change or remove your own account. Another super-admin can.</p>
      ) : null}
      {lastAdmin && !self ? (
        <p className="mt-4 text-base">This is the last super-admin, so the role cannot be removed.</p>
      ) : null}

      {!isAdmin(host) ? (
        <form action={setHostVillage} className="mt-5 max-w-md">
          <Field label="Assigned village" htmlFor={`village-${host.id}`}>
            <VillageSelect id={`village-${host.id}`} defaultValue={host.village || "Mill Valley"} />
          </Field>
          <input type="hidden" name="hostId" value={host.id} />
          <button type="submit" className="btn-secondary">
            Save village
          </button>
        </form>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        {canPromote ? (
          <form action={setHostRole} className="max-w-md">
            <input type="hidden" name="hostId" value={host.id} />
            <input type="hidden" name="role" value="admin" />
            <label className="mb-4 flex min-h-14 items-center gap-3 text-lg">
              <input type="checkbox" name="confirm" value="yes" className="h-6 w-6 accent-terracotta" />
              Yes, make {host.name} a super-admin
            </label>
            <button type="submit" className="btn-secondary">
              Make super-admin
            </button>
          </form>
        ) : null}
        {canDemote ? (
          <form action={setHostRole} className="max-w-md">
            <Field label="Village" htmlFor={`demote-village-${host.id}`}>
              <VillageSelect id={`demote-village-${host.id}`} defaultValue="Mill Valley" />
            </Field>
            <input type="hidden" name="hostId" value={host.id} />
            <input type="hidden" name="role" value="sub_admin" />
            <label className="mb-4 flex min-h-14 items-center gap-3 text-lg">
              <input type="checkbox" name="confirm" value="yes" className="h-6 w-6 accent-terracotta" />
              Yes, assign {host.name} as a village host
            </label>
            <button type="submit" className="btn-secondary">
              Assign as village host
            </button>
          </form>
        ) : null}
      </div>

      {canRemove ? (
        <form action={removeHost} className="mt-6 rounded-2xl bg-sand px-4 py-4">
          <h4 className="text-xl font-bold">Remove this host</h4>
          <p className="mt-2 text-base">
            They will no longer be able to sign in.
            {eventCount > 0
              ? ` Their ${eventCount} event${eventCount === 1 ? "" : "s"} will be reassigned to you so nothing is lost.`
              : ""}
          </p>
          <label className="mt-3 mb-4 flex items-center gap-3 text-lg">
            <input type="checkbox" name="confirm" value="yes" className="h-6 w-6 accent-terracotta" />
            Yes, remove {host.name}
          </label>
          <input type="hidden" name="hostId" value={host.id} />
          <button type="submit" className="btn-danger">
            Remove host
          </button>
        </form>
      ) : null}
    </li>
  );
}
