import { config } from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { pacificWallToUtc, utcToPacificParts } from "../src/lib/time";
import { newId, newShareToken } from "../src/lib/ids";
import { closeDb, getClient, getDb } from "../src/lib/db";
import { events, hosts, rsvps } from "../src/lib/db/schema";
import { autoPromoteWaitlist, getEventCounts, submitRsvp } from "../src/lib/rsvp-service";
import {
  HostAdminError,
  assertCanRemoveHost,
  assertCanSetRole,
  canManageEvent,
  countAdmins,
  isAdmin,
  parseNewSubAdmin,
} from "../src/lib/roles";
import { APP_VERSION, appVersionLabel } from "../src/lib/version";

config();

function roundtripPacific() {
  const utc = pacificWallToUtc("2026-09-16", "10:00");
  const parts = utcToPacificParts(utc.getTime());
  assert.equal(parts.date, "2026-09-16");
  assert.equal(parts.time, "10:00");
}

async function rsvpFlow() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoke-smoke-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "spoke.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  closeDb();
  const db = await getDb();
  const now = new Date();
  const hostId = newId();
  await db
    .insert(hosts)
    .values({
      id: hostId,
      email: "chair@millvalleyvillage.org",
      passwordHash: bcrypt.hashSync("millvalley", 4),
      name: "Chair",
      role: "admin",
      createdAt: now,
    })
    .run();
  const eventId = newId();
  const shareToken = newShareToken();
  await db
    .insert(events)
    .values({
      id: eventId,
      hostId,
      title: "Test hike",
      description: "",
      startsAt: pacificWallToUtc("2026-09-16", "10:00"),
      endsAt: null,
      locationName: "Old Mill Park",
      streetAddress: "375 Throckmorton Ave",
      capacity: 2,
      carpoolsEnabled: true,
      status: "published",
      shareToken,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const event = (await db.select().from(events).where(eq(events.id, eventId)).get())!;
  const a = await submitRsvp(event, {
    guestName: "Ada",
    email: "ada@example.com",
    desiredStatus: "going",
    carpoolRole: "offer",
    seats: 2,
  });
  const b = await submitRsvp(event, {
    guestName: "Bea",
    phone: "415-555-0102",
    desiredStatus: "going",
    carpoolRole: "need",
  });
  const c = await submitRsvp(event, {
    guestName: "Cara",
    email: "cara@example.com",
    desiredStatus: "going",
  });
  assert.equal(a.rsvp.status, "going");
  assert.equal(b.rsvp.status, "going");
  assert.equal(c.rsvp.status, "waitlist");
  let counts = await getEventCounts(event);
  assert.equal(counts.going, 2);
  assert.equal(counts.waitlist, 1);

  await submitRsvp(event, {
    guestName: "Ada",
    email: "ada@example.com",
    desiredStatus: "not_going",
    manageToken: a.rsvp.manageToken,
  });
  counts = await getEventCounts(event);
  assert.equal(counts.going, 2, "waitlist guest should auto-promote when a Going guest leaves");
  assert.equal(counts.waitlist, 0);
  const cara = await db.select().from(rsvps).where(eq(rsvps.id, c.rsvp.id)).get();
  assert.equal(cara?.status, "going");

  const extra = await submitRsvp(event, {
    guestName: "Dee",
    email: "dee@example.com",
    desiredStatus: "going",
  });
  assert.equal(extra.rsvp.status, "waitlist");
  await autoPromoteWaitlist(event);
  assert.equal((await getEventCounts(event)).waitlist, 1, "auto-promote should not overfill");

  // Duplicate email updates the same RSVP
  const again = await submitRsvp(event, {
    guestName: "Deirdre",
    email: "dee@example.com",
    desiredStatus: "not_going",
  });
  assert.equal(again.rsvp.id, extra.rsvp.id);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

function hostRolePolicies() {
  const admin = { id: "a1", role: "admin" as const };
  const otherAdmin = { id: "a2", role: "admin" as const };
  const sub = { id: "s1", role: "sub_admin" as const };
  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin(sub), false);
  assert.equal(canManageEvent(admin, { hostId: "s1" }), true);
  assert.equal(canManageEvent(sub, { hostId: "s1" }), true);
  assert.equal(canManageEvent(sub, { hostId: "a1" }), false);

  assert.throws(() => assertCanSetRole(sub, admin, "sub_admin", 1), HostAdminError);
  assert.throws(() => assertCanSetRole(admin, admin, "sub_admin", 2), /own administrator role/);
  assert.throws(() => assertCanSetRole(admin, admin, "sub_admin", 1), /own administrator role/);
  assert.throws(() => assertCanSetRole(otherAdmin, admin, "sub_admin", 1), /at least one administrator/);
  assertCanSetRole(otherAdmin, admin, "sub_admin", 2);
  assertCanSetRole(admin, sub, "admin", 1);

  assert.throws(() => assertCanRemoveHost(sub, admin, 1), HostAdminError);
  assert.throws(() => assertCanRemoveHost(admin, admin, 2), /own account/);
  assert.throws(() => assertCanRemoveHost(otherAdmin, admin, 1), /at least one administrator/);
  assertCanRemoveHost(admin, sub, 1);
  assertCanRemoveHost(otherAdmin, admin, 2);
  assert.equal(countAdmins([admin, sub, otherAdmin]), 2);

  const parsed = parseNewSubAdmin({
    name: "Pat Neighbor",
    email: "  Pat@MillValleyVillage.org ",
    password: "temporary1",
  });
  assert.equal(parsed.email, "pat@millvalleyvillage.org");
  assert.throws(() => parseNewSubAdmin({ name: "Pat", email: "pat@example.com", password: "short" }), /at least 8/);
}

async function hostRoleMigration() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoke-role-"));
  const dbPath = path.join(dir, "spoke.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  closeDb();

  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: process.env.DATABASE_URL });
  await client.executeMultiple(`
    CREATE TABLE hosts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  await client.execute({
    sql: "INSERT INTO hosts (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)",
    args: ["legacy-host", "legacy@example.com", "hash", "Legacy Chair", Date.now()],
  });
  client.close();

  closeDb();
  const migrated = await getClient();
  const info = await migrated.execute("PRAGMA table_info(hosts)");
  const names = info.rows.map((row) => String((row as Record<string, unknown>).name ?? row[1]));
  assert.ok(names.includes("role"), "ensureSchema should add hosts.role on existing databases");
  const db = await getDb();
  const legacy = await db.select().from(hosts).where(eq(hosts.email, "legacy@example.com")).get();
  assert.equal(legacy?.role, "admin");
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

function versionLabel() {
  assert.equal(APP_VERSION.number, "2.0");
  assert.equal(APP_VERSION.releaseDate, "2026-09-15");
  assert.equal(appVersionLabel(), "Ver. 2.0 · September 15, 2026");
  assert.match(appVersionLabel(), /^Ver\. \d+\.\d+ · [A-Za-z]+ \d{1,2}, \d{4}$/);
}

async function main() {
  roundtripPacific();
  versionLabel();
  hostRolePolicies();
  await hostRoleMigration();
  await rsvpFlow();
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
