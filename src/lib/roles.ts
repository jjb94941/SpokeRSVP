import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireHost } from "./auth";
import { getDb } from "./db";
import { events, HOST_ROLES, type EventRow, type Host, type HostRole } from "./db/schema";
import { normalizeEmail } from "./format";

export { HOST_ROLES, type HostRole };

export class HostAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostAdminError";
  }
}

export function normalizeHostRole(role: string | null | undefined): HostRole {
  return role === "sub_admin" ? "sub_admin" : "admin";
}

export function isAdmin(host: Pick<Host, "role">): boolean {
  return normalizeHostRole(host.role) === "admin";
}

export function canManageEvent(
  host: Pick<Host, "id" | "role">,
  event: Pick<EventRow, "hostId">,
): boolean {
  return isAdmin(host) || event.hostId === host.id;
}

export function roleLabel(role: string | null | undefined): string {
  return normalizeHostRole(role) === "admin" ? "Administrator" : "Sub-administrator";
}

export async function requireAdmin(): Promise<Host> {
  const host = await requireHost();
  if (!isAdmin(host)) {
    redirect("/host?error=" + encodeURIComponent("Only administrators can manage host accounts."));
  }
  return host;
}

export async function findManagedEvent(
  eventId: string,
): Promise<{ host: Host; event: EventRow } | null> {
  const host = await requireHost();
  if (!eventId) return null;
  const db = await getDb();
  const event = await db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event || !canManageEvent(host, event)) return null;
  return { host, event };
}

export function assertAdminActor(actor: Pick<Host, "role">) {
  if (!isAdmin(actor)) {
    throw new HostAdminError("Only administrators can manage host accounts.");
  }
}

export function countAdmins(rows: Pick<Host, "role">[]): number {
  return rows.filter((row) => isAdmin(row)).length;
}

export function assertCanSetRole(
  actor: Pick<Host, "id" | "role">,
  target: Pick<Host, "id" | "role">,
  nextRole: string,
  adminCount: number,
) {
  assertAdminActor(actor);
  if (!HOST_ROLES.includes(nextRole as HostRole)) {
    throw new HostAdminError("That role is not valid.");
  }
  if (target.id === actor.id && nextRole !== "admin") {
    throw new HostAdminError("You cannot change your own administrator role.");
  }
  if (isAdmin(target) && nextRole !== "admin" && adminCount <= 1) {
    throw new HostAdminError("There must be at least one administrator.");
  }
}

export function assertCanRemoveHost(
  actor: Pick<Host, "id" | "role">,
  target: Pick<Host, "id" | "role">,
  adminCount: number,
) {
  assertAdminActor(actor);
  if (target.id === actor.id) {
    throw new HostAdminError("You cannot remove your own account.");
  }
  if (isAdmin(target) && adminCount <= 1) {
    throw new HostAdminError("There must be at least one administrator.");
  }
}

export function parseNewSubAdmin(input: { name: string; email: string; password: string }): {
  name: string;
  email: string;
  password: string;
} {
  const name = input.name.trim();
  const email = normalizeEmail(input.email) || "";
  const password = input.password.trim();
  if (name.length < 2) {
    throw new HostAdminError("Please enter the person's name.");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HostAdminError("Please enter a valid email address.");
  }
  if (password.length < 8) {
    throw new HostAdminError("Temporary password must be at least 8 characters.");
  }
  return { name, email, password };
}
