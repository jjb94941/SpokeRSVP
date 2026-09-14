import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const hosts = sqliteTable("hosts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
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

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
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
export type RsvpRow = typeof rsvps.$inferSelect;
export type CarpoolRow = typeof carpools.$inferSelect;
export type RsvpStatus = RsvpRow["status"];
export type CarpoolRole = CarpoolRow["role"];
