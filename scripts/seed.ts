import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/lib/db";
import { carpools, events, hosts, rsvps } from "../src/lib/db/schema";
import { newId, newSecretToken, newShareToken } from "../src/lib/ids";
import { pacificWallToUtc } from "../src/lib/time";

const DEMO_EMAIL = "chair@millvalleyvillage.org";
const DEMO_PASSWORD = "millvalley";

function at(date: string, time: string) {
  return pacificWallToUtc(date, time);
}

async function main() {
  const reset = process.argv.includes("--reset");
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "spoke.db");
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

  if (reset && fs.existsSync(resolved)) {
    closeDb();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = resolved + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  const db = getDb();
  const existing = db.select().from(hosts).where(eq(hosts.email, DEMO_EMAIL)).get();
  if (existing && !reset) {
    console.log("Demo data already exists. Demo host:");
    console.log(`  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log("Re-run with npm run db:reset to rebuild the sample events.");
    return;
  }

  if (existing && reset) {
    db.delete(hosts).where(eq(hosts.id, existing.id)).run();
  }

  const now = new Date();
  const hostId = newId();
  db.insert(hosts)
    .values({
      id: hostId,
      email: DEMO_EMAIL,
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
      name: "Mill Valley Village Chair",
      createdAt: now,
    })
    .run();

  const hikeId = newId();
  const coffeeId = newId();
  const bookId = newId();

  db.insert(events)
    .values([
      {
        id: hikeId,
        hostId,
        title: "Third Wednesday Walkers",
        description:
          "A 2–3 mile mostly-flat walk with time for lunch afterward. We gather in Mill Valley and often carpool to the trail. Wear comfortable shoes and bring water.",
        startsAt: at("2026-09-16", "10:00"),
        endsAt: at("2026-09-16", "12:00"),
        locationName: "Old Mill Park gathering spot",
        streetAddress: "375 Throckmorton Ave, Mill Valley, CA",
        capacity: 12,
        carpoolsEnabled: true,
        status: "published",
        shareToken: newShareToken(),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: coffeeId,
        hostId,
        title: "Friday coffee at Equator",
        description:
          "Informal drop-in coffee for Mill Valley Village neighbors. Come for as long as you like — no program, just conversation.",
        startsAt: at("2026-09-18", "10:00"),
        endsAt: at("2026-09-18", "11:30"),
        locationName: "Equator Coffees, Mill Valley",
        streetAddress: null,
        capacity: 10,
        carpoolsEnabled: false,
        status: "published",
        shareToken: newShareToken(),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: bookId,
        hostId,
        title: "Third Tuesday Book Club",
        description:
          "Small discussion group kept intimate on purpose. This month we are reading a novel chosen by the group. Newcomers are welcome when a seat opens — please join the waitlist if we are full.",
        startsAt: at("2026-10-20", "13:00"),
        endsAt: at("2026-10-20", "14:30"),
        locationName: "Mill Valley Library, conference room",
        streetAddress: "375 Throckmorton Ave, Mill Valley, CA",
        capacity: 8,
        carpoolsEnabled: false,
        status: "published",
        shareToken: newShareToken(),
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  function addRsvp(
    eventId: string,
    guestName: string,
    status: "going" | "waitlist" | "not_going",
    extra?: { email?: string; phone?: string; waitlistOrder?: number },
  ) {
    const id = newId();
    db.insert(rsvps)
      .values({
        id,
        eventId,
        guestName,
        email: extra?.email ?? null,
        phone: extra?.phone ?? null,
        status,
        waitlistOrder: extra?.waitlistOrder ?? null,
        manageToken: newSecretToken(18),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  const alice = addRsvp(hikeId, "Alice Nguyen", "going", {
    email: "alice@example.com",
    phone: "4155550101",
  });
  addRsvp(hikeId, "Bob Martinez", "going", { phone: "4155550102" });
  const cara = addRsvp(hikeId, "Cara Feldman", "going", { email: "cara@example.com" });
  addRsvp(hikeId, "David Chen", "going", { email: "david@example.com" });
  addRsvp(hikeId, "Elena Rossi", "waitlist", { email: "elena@example.com", waitlistOrder: 1 });
  addRsvp(hikeId, "Frank Patel", "not_going", { phone: "4155550199" });

  db.insert(carpools)
    .values([
      { id: newId(), rsvpId: alice, role: "offer", seats: 3, note: "Leaving from downtown Mill Valley at 9:30." },
      { id: newId(), rsvpId: cara, role: "need", seats: null, note: "Near Tamalpais High if anyone has a seat." },
    ])
    .run();

  addRsvp(coffeeId, "Grace Kim", "going", { email: "grace@example.com" });
  addRsvp(coffeeId, "Helen Brooks", "going", { phone: "4155550177" });

  for (const name of [
    "Irene Walsh",
    "James Ortiz",
    "Karen Robbins",
    "Linda Park",
    "Michael Stone",
    "Nina Alvarez",
    "Oscar Diaz",
    "Priya Shah",
  ]) {
    addRsvp(bookId, name, "going", { email: `${name.split(" ")[0].toLowerCase()}@example.com` });
  }
  addRsvp(bookId, "Quinn Ellis", "waitlist", { email: "quinn@example.com", waitlistOrder: 1 });
  addRsvp(bookId, "Rita Hoffman", "waitlist", { email: "rita@example.com", waitlistOrder: 2 });

  const hike = db.select().from(events).where(eq(events.id, hikeId)).get();
  const coffee = db.select().from(events).where(eq(events.id, coffeeId)).get();
  const book = db.select().from(events).where(eq(events.id, bookId)).get();

  console.log("Seeded Mill Valley Village demo data.");
  console.log("");
  console.log("Demo host (local / development only):");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("Guest RSVP links:");
  console.log(`  Walkers:  /e/${hike?.shareToken}`);
  console.log(`  Coffee:   /e/${coffee?.shareToken}`);
  console.log(`  Book club:/e/${book?.shareToken}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
