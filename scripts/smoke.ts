import { config } from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { pacificWallToUtc, utcToPacificParts, formatPacificRange } from "../src/lib/time";
import { isSecureSessionCookie, toDateMs } from "../src/lib/dates";
import { newId, newShareToken } from "../src/lib/ids";
import { closeDb, getDb } from "../src/lib/db";
import { events, hosts, rsvps } from "../src/lib/db/schema";
import { autoPromoteWaitlist, getEventCounts, submitRsvp } from "../src/lib/rsvp-service";

config();

function timestampCoercion() {
  const utc = pacificWallToUtc("2026-09-16", "10:00");
  const ms = utc.getTime();
  const event = { startsAt: ms, endsAt: ms + 2 * 60 * 60 * 1000 };
  const label = formatPacificRange(event.startsAt, event.endsAt);
  assert.match(label, /September 16, 2026/);
  assert.equal(formatPacificRange(utc, new Date(event.endsAt)), label);
  assert.equal(utcToPacificParts(ms).time, "10:00");
  const rows = [
    { status: "published", startsAt: utc },
    { status: "cancelled", startsAt: ms },
  ];
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "cancelled" ? 1 : -1;
    return toDateMs(a.startsAt) - toDateMs(b.startsAt);
  });
  assert.equal(rows[0]?.status, "published");
  assert.equal(isSecureSessionCookie({ NODE_ENV: "production" }), true);
  assert.equal(isSecureSessionCookie({ NODE_ENV: "development" }), false);
  assert.equal(isSecureSessionCookie({ NODE_ENV: "development", VERCEL: "1" }), true);
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
  const formatted = formatPacificRange(toDateMs(event.startsAt), event.endsAt);
  assert.match(formatted, /September 16, 2026/);
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

async function main() {
  timestampCoercion();
  await rsvpFlow();
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
