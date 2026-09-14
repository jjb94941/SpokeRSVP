import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { hosts, magicLinks, sessions, type Host } from "./db/schema";
import { newId, newSecretToken, sha256Hex } from "./ids";
import { normalizeEmail } from "./format";

export const SESSION_COOKIE = "spoke_session";
export const GUEST_COOKIE_PREFIX = "spoke_guest_";
const SESSION_DAYS = 30;
const MAGIC_MINUTES = 30;

export async function getCurrentHost(): Promise<Host | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const db = getDb();
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }
  return db.select().from(hosts).where(eq(hosts.id, session.hostId)).get() ?? null;
}

export async function requireHost(): Promise<Host> {
  const host = await getCurrentHost();
  if (!host) redirect("/login");
  return host;
}

export async function createSession(hostId: string) {
  const db = getDb();
  const id = newSecretToken(24);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.insert(sessions).values({ id, hostId, expiresAt }).run();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    getDb().delete(sessions).where(eq(sessions.id, sessionId)).run();
  }
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function verifyHostPassword(host: Host, password: string): boolean {
  return bcrypt.compareSync(password, host.passwordHash);
}

export function findHostByEmail(email: string): Host | undefined {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  return getDb().select().from(hosts).where(eq(hosts.email, normalized)).get();
}

export function createMagicLink(email: string): { token: string; expiresAt: Date } {
  const db = getDb();
  const token = newSecretToken(24);
  const expiresAt = new Date(Date.now() + MAGIC_MINUTES * 60 * 1000);
  db.insert(magicLinks)
    .values({
      id: newId(),
      email: normalizeEmail(email) || email.trim().toLowerCase(),
      tokenHash: sha256Hex(token),
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export function consumeMagicLink(token: string): string | null {
  const db = getDb();
  const row = db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, sha256Hex(token)))
    .get();
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  db.update(magicLinks).set({ usedAt: new Date() }).where(eq(magicLinks.id, row.id)).run();
  return row.email;
}

export async function setGuestCookie(eventId: string, manageToken: string) {
  const jar = await cookies();
  jar.set(`${GUEST_COOKIE_PREFIX}${eventId}`, manageToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function getGuestManageToken(eventId: string): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(`${GUEST_COOKIE_PREFIX}${eventId}`)?.value;
}

export async function appUrl(): Promise<string> {
  if (process.env.APP_URL?.trim()) return process.env.APP_URL.trim().replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}
