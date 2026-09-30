import { config } from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { pacificWallToUtc, utcToPacificParts } from "../src/lib/time";
import { newId, newSecretToken, newShareToken } from "../src/lib/ids";
import { closeDb, getClient, getDb } from "../src/lib/db";
import { eventTypes, events, hosts, invitations, rsvps, waiverSignatures, waiverVersions } from "../src/lib/db/schema";
import {
  assertCanDeleteEvent,
  canPermanentlyDeleteEvent,
  eventIsPast,
  partitionEvents,
  permanentlyDeleteEvent,
} from "../src/lib/event-lifecycle";
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
import { BOOK_TYPE_NAME, SOCIAL_TYPE_NAME, WALK_TYPE_NAME, WALK_WAIVER_BODY, WALK_WAIVER_FIELDS } from "../src/lib/event-catalog";
import { safeMemberReturnPath } from "../src/lib/member-path";
import {
  appendWaiverVersion,
  assertCanManageCatalog,
  assertWaiverFieldCount,
  canViewWaiverAnswers,
  collectWaiverAnswers,
  latestAnswersForWaiver,
  needsWaiverSignature,
  parseStoredFields,
  unsignedWaiverForEvent,
} from "../src/lib/waivers";
import { parseVillageFilter, toggleVillageHref, villageFilterHref } from "../src/lib/villages";
import {
  eventsAvailableToImport,
  findInvitationByToken,
  inviteBlockReason,
  listImportPeople,
  markInvitationOpened,
  parseInviteList,
  upsertInvitations,
} from "../src/lib/invitations";
import { configuredEmailProvider } from "../src/lib/mailer";

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
  const social = await db.select().from(eventTypes).where(eq(eventTypes.name, SOCIAL_TYPE_NAME)).get();
  assert.ok(social, "catalog should include Social");
  const eventId = newId();
  const shareToken = newShareToken();
  await db
    .insert(events)
    .values({
      id: eventId,
      hostId,
      eventTypeId: social.id,
      title: "Test hike",
      description: "",
      startsAt: pacificWallToUtc("2027-06-16", "10:00"),
      endsAt: null,
      locationName: "Old Mill Park",
      streetAddress: "375 Throckmorton Ave",
      capacity: 2,
      carpoolsEnabled: true,
      status: "published",
      village: "Mill Valley",
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
  assert.equal(counts.going, 1, "cancelling frees the seat instead of filling it from the waitlist");
  assert.equal(counts.spotsLeft, 1);
  assert.equal(counts.waitlist, 1);
  const cara = await db.select().from(rsvps).where(eq(rsvps.id, c.rsvp.id)).get();
  assert.equal(cara?.status, "waitlist");

  const openId = newId();
  await db
    .insert(events)
    .values({
      id: openId,
      hostId,
      eventTypeId: social.id,
      title: "Open seats",
      description: "",
      startsAt: pacificWallToUtc("2027-06-20", "10:00"),
      endsAt: null,
      locationName: "Park",
      streetAddress: null,
      capacity: 10,
      carpoolsEnabled: false,
      status: "published",
      village: "Mill Valley",
      shareToken: newShareToken(),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const open = (await db.select().from(events).where(eq(events.id, openId)).get())!;
  await submitRsvp(open, { guestName: "Grace", email: "grace@example.com", desiredStatus: "going" });
  await submitRsvp(open, { guestName: "Helen", phone: "4155550177", desiredStatus: "going" });
  await db
    .insert(rsvps)
    .values({
      id: newId(),
      eventId: open.id,
      guestName: "Elena",
      email: "elena-wait@example.com",
      phone: null,
      status: "waitlist",
      waitlistOrder: 1,
      manageToken: newSecretToken(18),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const beforeOpen = await getEventCounts(open);
  assert.equal(beforeOpen.spotsLeft, 8);
  assert.equal(beforeOpen.waitlist, 1);
  const joiner = await submitRsvp(open, {
    guestName: "Neighbor",
    email: "neighbor-seats@example.com",
    desiredStatus: "going",
  });
  assert.equal((await getEventCounts(open)).spotsLeft, 7);
  await submitRsvp(open, {
    guestName: "Neighbor",
    email: "neighbor-seats@example.com",
    desiredStatus: "not_going",
    manageToken: joiner.rsvp.manageToken,
  });
  const afterOpen = await getEventCounts(open);
  assert.equal(afterOpen.spotsLeft, 8, "cancel should restore the open seats from before signup");
  assert.equal(afterOpen.waitlist, 1);

  const extra = await submitRsvp(event, {
    guestName: "Dee",
    email: "dee@example.com",
    desiredStatus: "going",
  });
  assert.equal(extra.rsvp.status, "going");
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
  const admin = { id: "a1", role: "admin" as const, village: null };
  const otherAdmin = { id: "a2", role: "admin" as const, village: null };
  const sub = { id: "s1", role: "sub_admin" as const, village: "Mill Valley" };
  const tiburon = { id: "t1", role: "sub_admin" as const, village: "Tiburon" };
  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin(sub), false);
  assert.equal(canManageEvent(admin, { village: "Tiburon" }), true);
  assert.equal(canManageEvent(sub, { village: "Mill Valley" }), true);
  assert.equal(canManageEvent(sub, { village: "Tiburon" }), false);
  assert.equal(canManageEvent(tiburon, { village: "Mill Valley" }), false);

  assert.throws(() => assertCanSetRole(sub, admin, "sub_admin", 1), HostAdminError);
  assert.throws(() => assertCanSetRole(admin, admin, "sub_admin", 2), /own super-administrator role/);
  assert.throws(() => assertCanSetRole(admin, admin, "sub_admin", 1), /own super-administrator role/);
  assert.throws(() => assertCanSetRole(otherAdmin, admin, "sub_admin", 1), /at least one super-administrator/);
  assertCanSetRole(otherAdmin, admin, "sub_admin", 2);
  assertCanSetRole(admin, sub, "admin", 1);

  assert.throws(() => assertCanRemoveHost(sub, admin, 1), HostAdminError);
  assert.throws(() => assertCanRemoveHost(admin, admin, 2), /own account/);
  assert.throws(() => assertCanRemoveHost(otherAdmin, admin, 1), /at least one super-administrator/);
  assertCanRemoveHost(admin, sub, 1);
  assertCanRemoveHost(otherAdmin, admin, 2);
  assert.equal(countAdmins([admin, sub, otherAdmin]), 2);

  const parsed = parseNewSubAdmin({
    name: "Pat Neighbor",
    email: "  Pat@MillValleyVillage.org ",
    password: "temporary1",
    village: "Novato",
  });
  assert.equal(parsed.email, "pat@millvalleyvillage.org");
  assert.equal(parsed.village, "Novato");
  assert.throws(
    () => parseNewSubAdmin({ name: "Pat", email: "pat@example.com", password: "short", village: "Novato" }),
    /at least 8/,
  );
  assert.throws(
    () => parseNewSubAdmin({ name: "Pat", email: "pat@example.com", password: "temporary1", village: "Sausalito" }),
    /one village/,
  );
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
  assert.ok(names.includes("village"), "ensureSchema should add hosts.village on existing databases");
  const db = await getDb();
  const legacy = await db.select().from(hosts).where(eq(hosts.email, "legacy@example.com")).get();
  assert.equal(legacy?.role, "admin");
  assert.equal(legacy?.village ?? null, null);
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

function villageFilters() {
  assert.deepEqual(parseVillageFilter(undefined), []);
  assert.deepEqual(parseVillageFilter("Mill Valley,Nope,Tiburon"), ["Tiburon", "Mill Valley"]);
  assert.deepEqual(parseVillageFilter("Tiburon,Mill Valley,Novato,San Rafael,Twin Cities,Ross Valley"), []);
  assert.equal(villageFilterHref([]), "/");
  assert.equal(toggleVillageHref([], "Novato"), "/?villages=Novato");
  assert.equal(toggleVillageHref(["Novato", "Tiburon"], "Tiburon"), "/?villages=Novato");
  assert.equal(toggleVillageHref(["Novato"], "Ross Valley"), "/?villages=Novato%2CRoss%20Valley");
  assert.equal(safeMemberReturnPath("/my-events"), "/my-events");
  assert.equal(safeMemberReturnPath("/invite/abcDEF123_-tokenvalue"), "/invite/abcDEF123_-tokenvalue");
  assert.equal(safeMemberReturnPath("/invite/short"), "/");
  assert.equal(safeMemberReturnPath("/my-events?ok=done"), "/my-events");
  assert.equal(
    safeMemberReturnPath("/waiver/sign?eventId=11111111-1111-4111-8111-111111111111"),
    "/waiver/sign?eventId=11111111-1111-4111-8111-111111111111",
  );
  assert.equal(safeMemberReturnPath("/waiver/sign?eventId=not-an-id"), "/");
  assert.equal(safeMemberReturnPath("/?villages=Tiburon,Nope"), "/?villages=Tiburon");
  assert.equal(safeMemberReturnPath("//evil.example"), "/");
  assert.equal(safeMemberReturnPath("https://evil.example/my-events"), "/");
}

function versionLabel() {
  assert.equal(APP_VERSION.number, "2.0");
  assert.equal(APP_VERSION.releaseDate, "2026-09-15");
  assert.equal(appVersionLabel(), "Ver. 2.0 · September 15, 2026");
  assert.match(appVersionLabel(), /^Ver\. \d+\.\d+ · [A-Za-z]+ \d{1,2}, \d{4}$/);
}

async function waiverRules() {
  const admin = { role: "admin" as const };
  const sub = { role: "sub_admin" as const };
  assert.doesNotThrow(() => assertCanManageCatalog(admin));
  assert.throws(() => assertCanManageCatalog(sub), HostAdminError);
  assert.equal(needsWaiverSignature(null, null), false);
  assert.equal(needsWaiverSignature("version-1", null), true);
  assert.equal(needsWaiverSignature("version-1", "version-1"), false);
  assert.equal(needsWaiverSignature("version-2", "version-1"), true);
  assert.throws(() => assertWaiverFieldCount(5), /at most 4 fields/);
  assert.equal(WALK_WAIVER_FIELDS.length, 4);
  assert.throws(() => collectWaiverAnswers(WALK_WAIVER_FIELDS, new FormData()), /Enter Emergency contact name/);
  const answered = new FormData();
  answered.set("field_emergency-contact-name", "Pat Lee");
  answered.set("field_emergency-contact-phone", "415-555-0100");
  const collected = collectWaiverAnswers(WALK_WAIVER_FIELDS, answered);
  assert.equal(collected.find((answer) => answer.fieldId === "allergies")?.value, "");
  assert.equal(canViewWaiverAnswers(null, "Mill Valley"), false);
  assert.equal(canViewWaiverAnswers({ role: "sub_admin", village: "Tiburon" }, "Mill Valley"), false);
  assert.equal(canViewWaiverAnswers({ role: "sub_admin", village: "Mill Valley" }, "Mill Valley"), true);
  assert.equal(canViewWaiverAnswers({ role: "admin", village: null }, "Tiburon"), true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoke-waiver-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "spoke.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  closeDb();
  const db = await getDb();
  const now = new Date();
  const walk = await db.select().from(eventTypes).where(eq(eventTypes.name, WALK_TYPE_NAME)).get();
  const book = await db.select().from(eventTypes).where(eq(eventTypes.name, BOOK_TYPE_NAME)).get();
  assert.ok(walk?.waiverId, "Walk/Hike should have a waiver");
  assert.equal(book?.waiverId ?? null, null, "Book club should not have a waiver");
  assert.equal(await unsignedWaiverForEvent(book!.id, "neighbor@example.com"), null);

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
  await db
    .insert(events)
    .values({
      id: eventId,
      hostId,
      eventTypeId: walk!.id,
      title: "Dawn hike",
      description: "",
      startsAt: pacificWallToUtc("2027-06-18", "09:00"),
      endsAt: null,
      locationName: "Trailhead",
      streetAddress: null,
      capacity: 8,
      carpoolsEnabled: false,
      status: "published",
      village: "Mill Valley",
      shareToken: newShareToken(),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const email = "neighbor@example.com";
  const required = await unsignedWaiverForEvent(walk!.id, email);
  assert.ok(required, "signing is required before the first registration");
  assert.equal(required!.version, 1);

  const joined = await submitRsvp((await db.select().from(events).where(eq(events.id, eventId)).get())!, {
    guestName: "Neighbor Person",
    email,
    desiredStatus: "going",
  });
  assert.equal(joined.rsvp.status, "going");

  await db
    .insert(waiverSignatures)
    .values({
      id: newId(),
      waiverId: required!.waiverId,
      waiverVersionId: required!.id,
      version: required!.version,
      email,
      signerName: "Neighbor Person",
      answersJson: JSON.stringify(collected),
      signedAt: now,
    })
    .run();
  assert.equal(await unsignedWaiverForEvent(walk!.id, email), null, "an existing signature skips the waiver");
  const stored = await latestAnswersForWaiver(required!.waiverId, email);
  assert.equal(stored?.find((answer) => answer.fieldId === "emergency-contact-name")?.value, "Pat Lee");
  assert.equal(await latestAnswersForWaiver(required!.id, email), null, "answers are stored on the waiver, not the version id");

  const currentFields = parseStoredFields(required!.fieldsJson);
  assert.equal(currentFields.length, 4);
  const next = await appendWaiverVersion(
    required!.waiverId,
    required!.title,
    `${WALK_WAIVER_BODY}\n\nUpdated trail notice.`,
    currentFields,
  );
  assert.equal(next.createdNew, true);
  assert.equal(next.version.version, 2);
  const requiredFields = currentFields.map((field) =>
    field.id === "blood-type" ? { ...field, required: true } : field,
  );
  const fieldVersion = await appendWaiverVersion(required!.waiverId, required!.title, next.version.body, requiredFields);
  assert.equal(fieldVersion.createdNew, true, "changing a field creates a new waiver version");
  assert.equal(fieldVersion.version.version, 3);
  assert.equal(parseStoredFields(next.version.fieldsJson).find((field) => field.id === "blood-type")?.required, false);
  const resign = await unsignedWaiverForEvent(walk!.id, email);
  assert.ok(resign, "a new waiver version must be signed before the next registration");
  assert.equal(resign!.version, 3);
  const kept = await db.select().from(rsvps).where(eq(rsvps.id, joined.rsvp.id)).get();
  assert.equal(kept?.status, "going", "a new waiver version does not cancel an existing registration");
  const versions = await db.select().from(waiverVersions).where(eq(waiverVersions.waiverId, required!.waiverId)).all();
  assert.equal(versions.length, 3);
  const signatures = await db.select().from(waiverSignatures).all();
  assert.equal(signatures.length, 1);
  assert.equal(signatures[0]?.version, 1);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

async function inviteFlow() {
  const parsed = parseInviteList("Ada@Example.com, ada@example.com\nnot-an-email; bob@example.com bob@example.com");
  assert.deepEqual(parsed.emails, ["ada@example.com", "bob@example.com"]);
  assert.deepEqual(parsed.invalid, ["not-an-email"]);
  assert.equal(configuredEmailProvider(), "outbox");

  const millHost = { role: "sub_admin" as const, village: "Mill Valley" };
  const admin = { role: "admin" as const, village: null };
  const catalog = [
    { id: "mill", village: "Mill Valley" },
    { id: "tiburon", village: "Tiburon" },
    { id: "current", village: "Mill Valley" },
  ];
  assert.deepEqual(
    eventsAvailableToImport(millHost, "current", catalog).map((event) => event.id),
    ["mill"],
  );
  assert.deepEqual(
    eventsAvailableToImport(admin, "current", catalog).map((event) => event.id).sort(),
    ["mill", "tiburon"],
  );

  const now = new Date("2026-09-29T12:00:00.000Z");
  assert.equal(inviteBlockReason({ status: "cancelled", startsAt: new Date("2026-12-01T17:00:00.000Z") }, now), "cancelled");
  assert.equal(inviteBlockReason({ status: "published", startsAt: new Date("2026-09-01T17:00:00.000Z") }, now), "past");
  assert.equal(inviteBlockReason({ status: "published", startsAt: new Date("2026-12-01T17:00:00.000Z") }, now), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoke-invite-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "spoke.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  closeDb();
  const db = await getDb();
  const created = new Date("2026-09-01T12:00:00.000Z");
  const hostId = newId();
  await db
    .insert(hosts)
    .values({
      id: hostId,
      email: "host@example.com",
      passwordHash: "x",
      name: "Host",
      role: "sub_admin",
      village: "Mill Valley",
      createdAt: created,
    })
    .run();
  const social = await db.select().from(eventTypes).where(eq(eventTypes.name, SOCIAL_TYPE_NAME)).get();
  const futureId = newId();
  const pastId = newId();
  const tiburonId = newId();
  await db
    .insert(events)
    .values([
      {
        id: futureId,
        hostId,
        eventTypeId: social!.id,
        title: "Future coffee",
        description: "",
        startsAt: pacificWallToUtc("2026-12-01", "10:00"),
        endsAt: null,
        locationName: "Cafe",
        streetAddress: null,
        capacity: 8,
        carpoolsEnabled: false,
        status: "published",
        village: "Mill Valley",
        shareToken: newShareToken(),
        createdAt: created,
        updatedAt: created,
      },
      {
        id: pastId,
        hostId,
        eventTypeId: social!.id,
        title: "Past coffee",
        description: "",
        startsAt: pacificWallToUtc("2026-01-01", "10:00"),
        endsAt: null,
        locationName: "Cafe",
        streetAddress: null,
        capacity: 8,
        carpoolsEnabled: false,
        status: "published",
        village: "Mill Valley",
        shareToken: newShareToken(),
        createdAt: created,
        updatedAt: created,
      },
      {
        id: tiburonId,
        hostId,
        eventTypeId: social!.id,
        title: "Tiburon social",
        description: "",
        startsAt: pacificWallToUtc("2026-12-02", "10:00"),
        endsAt: null,
        locationName: "Library",
        streetAddress: null,
        capacity: 8,
        carpoolsEnabled: false,
        status: "published",
        village: "Tiburon",
        shareToken: newShareToken(),
        createdAt: created,
        updatedAt: created,
      },
    ])
    .run();

  await db
    .insert(rsvps)
    .values({
      id: newId(),
      eventId: pastId,
      guestName: "Pat Lee",
      email: "pat@example.com",
      phone: null,
      status: "going",
      waitlistOrder: null,
      manageToken: newSecretToken(18),
      createdAt: created,
      updatedAt: created,
    })
    .run();
  await db
    .insert(rsvps)
    .values({
      id: newId(),
      eventId: futureId,
      guestName: "Already There",
      email: "already@example.com",
      phone: null,
      status: "going",
      waitlistOrder: null,
      manageToken: newSecretToken(18),
      createdAt: created,
      updatedAt: created,
    })
    .run();

  const imported = await listImportPeople(pastId, futureId, false);
  assert.equal(imported.length, 1);
  assert.equal(imported[0]?.email, "pat@example.com");
  assert.equal("answers" in (imported[0] || {}), false);
  const storedEvents = await db.select().from(events).all();
  const millOnly = eventsAvailableToImport(
    { role: "sub_admin", village: "Mill Valley" },
    futureId,
    storedEvents,
  ).map((event) => event.village);
  assert.ok(millOnly.every((village) => village === "Mill Valley"));
  assert.equal(millOnly.includes("Tiburon" as never), false);

  const first = await upsertInvitations(futureId, [
    { email: "Pat@Example.com", name: "Pat Lee" },
    { email: "already@example.com", name: "Already There" },
    { email: "new@example.com" },
  ]);
  assert.deepEqual(first.added, ["pat@example.com", "new@example.com"]);
  assert.deepEqual(first.skippedRegistered, ["already@example.com"]);
  const again = await upsertInvitations(futureId, [{ email: "pat@example.com", name: "Pat Lee" }]);
  assert.deepEqual(again.updated, ["pat@example.com"]);
  assert.equal(again.added.length, 0);
  const rows = await db.select().from(invitations).where(eq(invitations.eventId, futureId)).all();
  assert.equal(rows.length, 2);

  const pat = rows.find((row) => row.email === "pat@example.com");
  assert.ok(pat);
  assert.equal(await findInvitationByToken("not-a-real-token"), null);
  const opened = await findInvitationByToken(pat!.token);
  assert.equal(opened?.invitation.email, "pat@example.com");
  assert.equal(opened?.event.title, "Future coffee");
  await markInvitationOpened(opened!.invitation);
  const afterOpen = await findInvitationByToken(pat!.token);
  assert.equal(afterOpen?.invitation.status, "opened");

  const pastEvent = storedEvents.find((event) => event.id === pastId)!;
  assert.equal(inviteBlockReason(pastEvent, now), "past");
  const futureEvent = storedEvents.find((event) => event.id === futureId)!;
  const joined = await submitRsvp(futureEvent, {
    guestName: "Pat Lee",
    email: "pat@example.com",
    desiredStatus: "going",
  });
  assert.equal(joined.rsvp.status, "going");
  const registered = await findInvitationByToken(pat!.token);
  assert.equal(registered?.invitation.status, "registered");
  await markInvitationOpened(registered!.invitation);
  const stillRegistered = await findInvitationByToken(pat!.token);
  assert.equal(stillRegistered?.invitation.status, "registered");

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

function scheduleRules() {
  const during = {
    startsAt: pacificWallToUtc("2026-09-30", "10:00"),
    endsAt: pacificWallToUtc("2026-09-30", "15:00"),
  };
  assert.equal(eventIsPast(during, pacificWallToUtc("2026-09-30", "13:00")), false);
  assert.equal(eventIsPast(during, pacificWallToUtc("2026-09-30", "15:01")), true);
  assert.equal(
    eventIsPast({ startsAt: pacificWallToUtc("2026-09-30", "10:00"), endsAt: null }, pacificWallToUtc("2026-09-30", "10:01")),
    true,
  );
  const sooner = { title: "Soon", startsAt: pacificWallToUtc("2026-10-02", "10:00"), endsAt: null };
  const later = { title: "Later", startsAt: pacificWallToUtc("2026-11-02", "10:00"), endsAt: null };
  const ended = { title: "Ended", startsAt: pacificWallToUtc("2026-01-02", "10:00"), endsAt: null };
  const parts = partitionEvents([later, ended, sooner], pacificWallToUtc("2026-09-30", "12:00"));
  assert.deepEqual(
    parts.upcoming.map((event) => event.title),
    ["Soon", "Later"],
  );
  assert.deepEqual(
    parts.past.map((event) => event.title),
    ["Ended"],
  );
  assert.equal(canPermanentlyDeleteEvent({ going: 0, waitlist: 0, notGoing: 0 }), true);
  assert.equal(canPermanentlyDeleteEvent({ going: 1, waitlist: 0, notGoing: 0 }), false);
  assert.equal(canPermanentlyDeleteEvent({ going: 0, waitlist: 2, notGoing: 0 }), false);
  const mill = { role: "sub_admin" as const, village: "Mill Valley" };
  assert.doesNotThrow(() => assertCanDeleteEvent({ role: "admin", village: null }, { village: "Tiburon" }, { going: 0, waitlist: 0, notGoing: 0 }));
  assert.throws(() => assertCanDeleteEvent(mill, { village: "Tiburon" }, { going: 0, waitlist: 0, notGoing: 0 }), /your village/);
  assert.throws(
    () => assertCanDeleteEvent(mill, { village: "Mill Valley" }, { going: 1, waitlist: 0, notGoing: 0 }),
    /cannot be deleted/,
  );
}

async function deleteKeepsWaivers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spoke-delete-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "spoke.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  closeDb();
  const db = await getDb();
  const now = new Date("2026-09-01T12:00:00.000Z");
  const hostId = newId();
  await db
    .insert(hosts)
    .values({
      id: hostId,
      email: "host@example.com",
      passwordHash: "x",
      name: "Host",
      role: "admin",
      createdAt: now,
    })
    .run();
  const social = await db.select().from(eventTypes).where(eq(eventTypes.name, SOCIAL_TYPE_NAME)).get();
  const walk = await db.select().from(eventTypes).where(eq(eventTypes.name, WALK_TYPE_NAME)).get();
  const version = await db.select().from(waiverVersions).where(eq(waiverVersions.waiverId, walk!.waiverId!)).get();
  assert.ok(version);
  await db
    .insert(waiverSignatures)
    .values({
      id: newId(),
      waiverId: version!.waiverId,
      waiverVersionId: version!.id,
      version: version!.version,
      email: "ada@example.com",
      signerName: "Ada Neighbor",
      answersJson: "[]",
      signedAt: now,
    })
    .run();
  const emptyId = newId();
  const busyId = newId();
  await db
    .insert(events)
    .values([
      {
        id: emptyId,
        hostId,
        eventTypeId: social!.id,
        title: "Empty social",
        description: "",
        startsAt: pacificWallToUtc("2027-07-01", "10:00"),
        endsAt: null,
        locationName: "Park",
        streetAddress: null,
        capacity: 8,
        carpoolsEnabled: false,
        status: "published",
        village: "Mill Valley",
        shareToken: newShareToken(),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: busyId,
        hostId,
        eventTypeId: social!.id,
        title: "Busy social",
        description: "",
        startsAt: pacificWallToUtc("2026-01-15", "10:00"),
        endsAt: pacificWallToUtc("2026-01-15", "12:00"),
        locationName: "Park",
        streetAddress: null,
        capacity: 8,
        carpoolsEnabled: false,
        status: "published",
        village: "Mill Valley",
        shareToken: newShareToken(),
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();
  await db
    .insert(rsvps)
    .values({
      id: newId(),
      eventId: busyId,
      guestName: "Ada Neighbor",
      email: "ada@example.com",
      phone: null,
      status: "going",
      waitlistOrder: null,
      manageToken: newSecretToken(18),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const busy = (await db.select().from(events).where(eq(events.id, busyId)).get())!;
  await assert.rejects(
    () => submitRsvp(busy, { guestName: "Bea", email: "bea@example.com", desiredStatus: "going" }),
    /already ended/,
  );
  await assert.rejects(() => permanentlyDeleteEvent(busyId), /cannot be deleted/);
  assert.ok(await db.select().from(events).where(eq(events.id, busyId)).get());
  await permanentlyDeleteEvent(emptyId);
  assert.equal(await db.select().from(events).where(eq(events.id, emptyId)).get(), undefined);
  assert.equal((await db.select().from(waiverSignatures).all()).length, 1);

  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  roundtripPacific();
  villageFilters();
  versionLabel();
  hostRolePolicies();
  await hostRoleMigration();
  await rsvpFlow();
  await waiverRules();
  await inviteFlow();
  scheduleRules();
  await deleteKeepsWaivers();
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
