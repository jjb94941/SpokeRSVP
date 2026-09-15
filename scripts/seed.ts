import { config } from "dotenv";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, fileUrlToPath, getDb, resolveDatabaseUrl, wipeData } from "../src/lib/db";
import { carpools, events, hosts, rsvps } from "../src/lib/db/schema";
import { newId, newSecretToken, newShareToken } from "../src/lib/ids";
import { pacificWallToUtc } from "../src/lib/time";

config();

const DEMO_EMAIL = "chair@millvalleyvillage.org";
const DEMO_PASSWORD = "millvalley";
const SUB_ADMIN_EMAIL = "volunteer@millvalleyvillage.org";
const SUB_ADMIN_PASSWORD = "millvalley";

function at(date: string, time: string) {
  return pacificWallToUtc(date, time);
}

async function resetLocalFile(url: string) {
  closeDb();
  const resolved = fileUrlToPath(url);
  if (!resolved) return false;
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = resolved + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  return true;
}

async function main() {
  const reset = process.argv.includes("--reset");
  const url = resolveDatabaseUrl();

  if (reset) {
    const deletedFile = await resetLocalFile(url);
    if (!deletedFile) {
      await wipeData();
    }
  }

  const db = await getDb();
  const existing = await db.select().from(hosts).where(eq(hosts.email, DEMO_EMAIL)).get();
  if (existing && !reset) {
    console.log("Demo data already exists. Demo host:");
    console.log(`  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log("Re-run with npm run db:reset to rebuild the sample events.");
    console.log("Change this password before any public/production deploy.");
    return;
  }

  if (existing && reset) {
    await db.delete(hosts).where(eq(hosts.id, existing.id)).run();
  }

  const now = new Date();
  const hostId = newId();
  await db
    .insert(hosts)
    .values({
      id: hostId,
      email: DEMO_EMAIL,
      passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
      name: "Mill Valley Village Chair",
      role: "admin",
      createdAt: now,
    })
    .run();

  const volunteerId = newId();
  await db
    .insert(hosts)
    .values({
      id: volunteerId,
      email: SUB_ADMIN_EMAIL,
      passwordHash: bcrypt.hashSync(SUB_ADMIN_PASSWORD, 10),
      name: "Mill Valley Volunteer Host",
      role: "sub_admin",
      createdAt: now,
    })
    .run();

  const hikeId = newId();
  const coffeeId = newId();
  const bookId = newId();

  await db
    .insert(events)
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
      {
        id: newId(),
        hostId: volunteerId,
        title: "Saturday stretch & chat",
        description:
          "Gentle stretching in the park, then a short sit-down conversation. Hosted by a volunteer so chairs can see how sub-administrator events look.",
        startsAt: at("2026-09-19", "09:30"),
        endsAt: at("2026-09-19", "10:30"),
        locationName: "Boyle Park lawn",
        streetAddress: null,
        capacity: 16,
        carpoolsEnabled: false,
        status: "published",
        shareToken: newShareToken(),
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  async function addRsvp(
    eventId: string,
    guestName: string,
    status: "going" | "waitlist" | "not_going",
    extra?: { email?: string; phone?: string; waitlistOrder?: number },
  ) {
    const id = newId();
    await db
      .insert(rsvps)
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

  const alice = await addRsvp(hikeId, "Alice Nguyen", "going", {
    email: "alice@example.com",
    phone: "4155550101",
  });
  await addRsvp(hikeId, "Bob Martinez", "going", { phone: "4155550102" });
  const cara = await addRsvp(hikeId, "Cara Feldman", "going", { email: "cara@example.com" });
  await addRsvp(hikeId, "David Chen", "going", { email: "david@example.com" });
  await addRsvp(hikeId, "Elena Rossi", "waitlist", { email: "elena@example.com", waitlistOrder: 1 });
  await addRsvp(hikeId, "Frank Patel", "not_going", { phone: "4155550199" });

  await db
    .insert(carpools)
    .values([
      { id: newId(), rsvpId: alice, role: "offer", seats: 3, note: "Leaving from downtown Mill Valley at 9:30." },
      { id: newId(), rsvpId: cara, role: "need", seats: null, note: "Near Tamalpais High if anyone has a seat." },
    ])
    .run();

  await addRsvp(coffeeId, "Grace Kim", "going", { email: "grace@example.com" });
  await addRsvp(coffeeId, "Helen Brooks", "going", { phone: "4155550177" });

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
    await addRsvp(bookId, name, "going", { email: `${name.split(" ")[0].toLowerCase()}@example.com` });
  }
  await addRsvp(bookId, "Quinn Ellis", "waitlist", { email: "quinn@example.com", waitlistOrder: 1 });
  await addRsvp(bookId, "Rita Hoffman", "waitlist", { email: "rita@example.com", waitlistOrder: 2 });

  const hike = await db.select().from(events).where(eq(events.id, hikeId)).get();
  const coffee = await db.select().from(events).where(eq(events.id, coffeeId)).get();
  const book = await db.select().from(events).where(eq(events.id, bookId)).get();

  console.log("Seeded Mill Valley Village demo data.");
  console.log(`Database: ${url.startsWith("file:") ? url : "Turso / remote libSQL"}`);
  console.log("");
  console.log("Demo administrator (local / development only — change this password before production):");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("  Role:     administrator (can manage every event and appoint hosts)");
  console.log("");
  console.log("Demo sub-administrator:");
  console.log(`  Email:    ${SUB_ADMIN_EMAIL}`);
  console.log(`  Password: ${SUB_ADMIN_PASSWORD}`);
  console.log("  Role:     sub-administrator (can manage only events they created)");
  console.log("");
  console.log("Guest RSVP links:");
  console.log(`  Walkers:  /e/${hike?.shareToken}`);
  console.log(`  Coffee:   /e/${coffee?.shareToken}`);
  console.log(`  Book club:/e/${book?.shareToken}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    closeDb();
  });
