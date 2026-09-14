import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { pacificWallToUtc, utcToPacificParts } from "../src/lib/time";
import { newId, newShareToken } from "../src/lib/ids";
import { closeDb, getDb } from "../src/lib/db";
import { events, hosts, rsvps } from "../src/lib/db/schema";
import { autoPromoteWaitlist, getEventCounts, submitRsvp } from "../src/lib/rsvp-service";

function roundtripPacific() {
  const utc = pacificWallToUtc("2026-09-16", "10:00");
  const parts = utcToPacificParts(utc.getTime());
  assert.equal(parts.date, "2026-09-16");
  assert.equal(parts.time, "10:00");
}

async function rsvpFlow() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoke-smoke-"));
  process.env.DATABASE_PATH = path.join(dir, "spoke.db");
  closeDb();
  const db = getDb();
  const now = new Date();
  const hostId = newId();
  db.insert(hosts)
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
  db.insert(events)
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

  const event = db.select().from(events).where(eq(events.id, eventId)).get()!;
  const a = submitRsvp(event, {
    guestName: "Ada",
    email: "ada@example.com",
    desiredStatus: "going",
    carpoolRole: "offer",
    seats: 2,
  });
  const b = submitRsvp(event, {
    guestName: "Bea",
    phone: "415-555-0102",
    desiredStatus: "going",
    carpoolRole: "need",
  });
  const c = submitRsvp(event, {
    guestName: "Cara",
    email: "cara@example.com",
    desiredStatus: "going",
  });
  assert.equal(a.rsvp.status, "going");
  assert.equal(b.rsvp.status, "going");
  assert.equal(c.rsvp.status, "waitlist");
  let counts = getEventCounts(event);
  assert.equal(counts.going, 2);
  assert.equal(counts.waitlist, 1);

  submitRsvp(event, {
    guestName: "Ada",
    email: "ada@example.com",
    desiredStatus: "not_going",
    manageToken: a.rsvp.manageToken,
  });
  counts = getEventCounts(event);
  assert.equal(counts.going, 2, "waitlist guest should auto-promote when a Going guest leaves");
  assert.equal(counts.waitlist, 0);
  const cara = db.select().from(rsvps).where(eq(rsvps.id, c.rsvp.id)).get();
  assert.equal(cara?.status, "going");

  const extra = submitRsvp(event, {
    guestName: "Dee",
    email: "dee@example.com",
    desiredStatus: "going",
  });
  assert.equal(extra.rsvp.status, "waitlist");
  autoPromoteWaitlist(event);
  assert.equal(getEventCounts(event).waitlist, 1, "auto-promote should not overfill");

  // Duplicate email updates the same RSVP
  const again = submitRsvp(event, {
    guestName: "Deirdre",
    email: "dee@example.com",
    desiredStatus: "not_going",
  });
  assert.equal(again.rsvp.id, extra.rsvp.id);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  roundtripPacific();
  await rsvpFlow();
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
