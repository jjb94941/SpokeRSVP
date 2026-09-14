import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DEFAULT_DB = path.join(process.cwd(), "data", "spoke.db");

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (!configured) return DEFAULT_DB;
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

type GlobalDb = {
  sqlite?: Database.Database;
  db?: ReturnType<typeof drizzle<typeof schema>>;
  dbPath?: string;
};

const globalForDb = globalThis as unknown as { __spoke?: GlobalDb };

function open() {
  const dbPath = resolveDbPath();
  if (globalForDb.__spoke?.db && globalForDb.__spoke.dbPath === dbPath) {
    return globalForDb.__spoke;
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  globalForDb.__spoke = { sqlite, db, dbPath };
  return globalForDb.__spoke;
}

export function getSqlite(): Database.Database {
  return open().sqlite!;
}

export function getDb() {
  return open().db!;
}

export function closeDb() {
  if (globalForDb.__spoke?.sqlite) {
    globalForDb.__spoke.sqlite.close();
    globalForDb.__spoke = {};
  }
}

export function ensureSchema(sqlite: Database.Database = getSqlite()) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      location_name TEXT NOT NULL,
      street_address TEXT,
      capacity INTEGER NOT NULL,
      carpools_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      share_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      guest_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      status TEXT NOT NULL,
      waitlist_order INTEGER,
      manage_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS carpools (
      id TEXT PRIMARY KEY,
      rsvp_id TEXT NOT NULL UNIQUE REFERENCES rsvps(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'none',
      seats INTEGER,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS sessions_host_id_idx ON sessions(host_id);
    CREATE INDEX IF NOT EXISTS events_host_id_idx ON events(host_id);
    CREATE INDEX IF NOT EXISTS rsvps_event_id_idx ON rsvps(event_id);
    CREATE INDEX IF NOT EXISTS rsvps_event_status_idx ON rsvps(event_id, status);
  `);
}
