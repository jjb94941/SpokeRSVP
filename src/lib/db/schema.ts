import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const HOST_ROLES = ["admin", "sub_admin"] as const;
export type HostRole = (typeof HOST_ROLES)[number];

export const hosts = sqliteTable("hosts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: HOST_ROLES }).notNull().default("admin"),
  /** Null for super-administrators. Village hosts belong to exactly one community. */
  village: text("village"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

export const waivers = sqliteTable("waivers", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const waiverVersions = sqliteTable(
  "waiver_versions",
  {
    id: text("id").primaryKey(),
    waiverId: text("waiver_id")
      .notNull()
      .references(() => waivers.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** JSON array of up to 4 fields for this version. */
    fieldsJson: text("fields_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("waiver_versions_waiver_version_idx").on(table.waiverId, table.version)],
);

export const waiverSignatures = sqliteTable(
  "waiver_signatures",
  {
    id: text("id").primaryKey(),
    waiverId: text("waiver_id")
      .notNull()
      .references(() => waivers.id, { onDelete: "cascade" }),
    waiverVersionId: text("waiver_version_id")
      .notNull()
      .references(() => waiverVersions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    email: text("email").notNull(),
    signerName: text("signer_name").notNull(),
    /** JSON answers for this version’s fields. Not shown on public pages. */
    answersJson: text("answers_json").notNull().default("[]"),
    signedAt: integer("signed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("waiver_signatures_version_email_idx").on(table.waiverVersionId, table.email)],
);

export const eventTypes = sqliteTable("event_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** When set, registering for this type requires the waiver’s current version. */
  waiverId: text("waiver_id").references(() => waivers.id, { onDelete: "set null" }),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  eventTypeId: text("event_type_id").references(() => eventTypes.id),
  village: text("village").notNull().default("Mill Valley"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }),
  locationName: text("location_name").notNull(),
  streetAddress: text("street_address"),
  capacity: integer("capacity").notNull(),
  carpoolsEnabled: integer("carpools_enabled", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["published", "cancelled"] })
    .notNull()
    .default("published"),
  shareToken: text("share_token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const rsvps = sqliteTable(
  "rsvps",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestName: text("guest_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: text("status", { enum: ["going", "not_going", "waitlist"] }).notNull(),
    waitlistOrder: integer("waitlist_order"),
    manageToken: text("manage_token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("rsvps_manage_token_idx").on(table.manageToken)],
);

export const carpools = sqliteTable("carpools", {
  id: text("id").primaryKey(),
  rsvpId: text("rsvp_id")
    .notNull()
    .unique()
    .references(() => rsvps.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["offer", "need", "none"] })
    .notNull()
    .default("none"),
  seats: integer("seats"),
  note: text("note"),
});

export type Host = typeof hosts.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type EventTypeRow = typeof eventTypes.$inferSelect;
export type WaiverRow = typeof waivers.$inferSelect;
export type WaiverVersionRow = typeof waiverVersions.$inferSelect;
export type WaiverSignatureRow = typeof waiverSignatures.$inferSelect;
export type RsvpRow = typeof rsvps.$inferSelect;
export type CarpoolRow = typeof carpools.$inferSelect;
export type RsvpStatus = RsvpRow["status"];
export type CarpoolRole = CarpoolRow["role"];
