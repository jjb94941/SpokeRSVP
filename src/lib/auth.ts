import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { hosts, magicLinks, sessions, type Host } from "./db/schema";
import { isSecureSessionCookie, toDateMs, toOptionalDate } from "./dates";
import { newId, newSecretToken, sha256Hex } from "./ids";
import { normalizeEmail } from "./format";

export const SESSION_COOKIE = "spoke_session";
export const GUEST_COOKIE_PREFIX = "spoke_guest_";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const MAGIC_MINUTES = 30;

function sessionCookieOptions(overrides: { expires?: Date; maxAge?: number } = {}) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Vercel is HTTPS; secure cookies must still be set in the same Server Action
    // that redirects (Next.js 15 cookies().set before redirect()).
    secure: isSecureSessionCookie(),
    path: "/",
    ...overrides,
  };
}

export async function getCurrentHost(): Promise<Host | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const db = await getDb();
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session || toDateMs(session.expiresAt) < Date.now()) {
    if (session) await db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }
  return (await db.select().from(hosts).where(eq(hosts.id, session.hostId)).get()) ?? null;
}

export async function requireHost(): Promise<Host> {
  const host = await getCurrentHost();
  if (!host) redirect("/login");
  return host;
}

export async function createSession(hostId: string) {
  const db = await getDb();
  const id = newSecretToken(24);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id, hostId, expiresAt }).run();
  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    id,
    sessionCookieOptions({
      expires: expiresAt,
      maxAge: SESSION_MAX_AGE,
    }),
  );
}

export async function destroySession() {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }
  jar.set(SESSION_COOKIE, "", sessionCookieOptions({ maxAge: 0 }));
}

export function verifyHostPassword(host: Host, password: string): boolean {
  return bcrypt.compareSync(password, host.passwordHash);
}

export async function findHostByEmail(email: string): Promise<Host | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  const db = await getDb();
  return db.select().from(hosts).where(eq(hosts.email, normalized)).get();
}

export async function createMagicLink(email: string): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = newSecretToken(24);
  const expiresAt = new Date(Date.now() + MAGIC_MINUTES * 60 * 1000);
  await db
    .insert(magicLinks)
    .values({
      id: newId(),
      email: normalizeEmail(email) || email.trim().toLowerCase(),
      tokenHash: sha256Hex(token),
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export async function consumeMagicLink(token: string): Promise<string | null> {
  const db = await getDb();
  const row = await db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, sha256Hex(token)))
    .get();
  if (!row || toOptionalDate(row.usedAt) || toDateMs(row.expiresAt) < Date.now()) return null;
  await db.update(magicLinks).set({ usedAt: new Date() }).where(eq(magicLinks.id, row.id)).run();
  return row.email;
}

export async function setGuestCookie(eventId: string, manageToken: string) {
  const jar = await cookies();
  jar.set(
    `${GUEST_COOKIE_PREFIX}${eventId}`,
    manageToken,
    sessionCookieOptions({ maxAge: 60 * 60 * 24 * 180 }),
  );
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
