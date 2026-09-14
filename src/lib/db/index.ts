import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

const DEFAULT_URL = "file:./data/spoke.db";

export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  return configured || DEFAULT_URL;
}

export function fileUrlToPath(url: string): string | null {
  if (url === ":memory:") return null;
  if (!url.startsWith("file:")) return null;
  let rest = url.slice("file:".length);
  if (rest.startsWith("///")) rest = rest.slice(2);
  else if (rest.startsWith("//localhost/")) rest = rest.slice("//localhost".length);
  else if (rest.startsWith("//")) {
    try {
      return decodeURIComponent(new URL(url).pathname);
    } catch {
      rest = rest.replace(/^\/\/[^/]*/, "");
    }
  }
  if (!rest) return null;
  return path.isAbsolute(rest) ? rest : path.join(process.cwd(), rest);
}

type Db = LibSQLDatabase<typeof schema>;

type GlobalDb = {
  url?: string;
  authToken?: string;
  client?: Client;
  db?: Db;
  ready?: Promise<void>;
};

const globalForDb = globalThis as unknown as { __spoke?: GlobalDb };

function authTokenFromEnv(): string | undefined {
  const token = process.env.DATABASE_AUTH_TOKEN?.trim();
  return token || undefined;
}

async function connect(): Promise<Required<Pick<GlobalDb, "client" | "db">> & GlobalDb> {
  const url = resolveDatabaseUrl();
  const authToken = authTokenFromEnv();
  const existing = globalForDb.__spoke;
  if (existing?.db && existing.client && existing.url === url && existing.authToken === authToken) {
    if (existing.ready) await existing.ready;
    return existing as Required<Pick<GlobalDb, "client" | "db">> & GlobalDb;
  }
  if (existing?.client) {
    try {
      existing.client.close();
    } catch {
      // ignore stale connection
    }
  }

  const filePath = fileUrlToPath(url);
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  const slot: GlobalDb = { url, authToken, client, db };
  slot.ready = (async () => {
    if (filePath) {
      await client.execute("PRAGMA foreign_keys = ON");
    }
    await ensureSchema(client);
  })();
  globalForDb.__spoke = slot;
  await slot.ready;
  return slot as Required<Pick<GlobalDb, "client" | "db">> & GlobalDb;
}

export async function getClient(): Promise<Client> {
  const slot = await connect();
  return slot.client;
}

export async function getDb(): Promise<Db> {
  const slot = await connect();
  return slot.db;
}

export function closeDb() {
  if (globalForDb.__spoke?.client) {
    try {
      globalForDb.__spoke.client.close();
    } catch {
      // already closed
    }
  }
  globalForDb.__spoke = {};
}

/** Wipe all app rows. Used by `npm run db:reset` against Turso or a local file DB. */
export async function wipeData() {
  const client = await getClient();
  await client.executeMultiple(`
    DELETE FROM carpools;
    DELETE FROM rsvps;
    DELETE FROM magic_links;
    DELETE FROM sessions;
    DELETE FROM events;
    DELETE FROM hosts;
  `);
}

export async function ensureSchema(client?: Client) {
  const target = client ?? (await getClient());
  await target.executeMultiple(`
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
