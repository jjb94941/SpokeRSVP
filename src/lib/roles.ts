import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireHost } from "./auth";
import { getDb } from "./db";
import { events, HOST_ROLES, type EventRow, type Host, type HostRole } from "./db/schema";
import { normalizeEmail } from "./format";
import { isVillage, type Village } from "./villages";

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
  host: Pick<Host, "role" | "village">,
  event: Pick<EventRow, "village">,
): boolean {
  if (isAdmin(host)) return true;
  return Boolean(host.village) && host.village === event.village;
}

export function roleLabel(role: string | null | undefined): string {
  return normalizeHostRole(role) === "admin" ? "Super-administrator" : "Village host";
}

/** Short label for the host list: "Super-admin" or "Mill Valley host". */
export function accountRoleLabel(host: { role?: string | null; village?: string | null }): string {
  if (isAdmin({ role: normalizeHostRole(host.role) })) return "Super-admin";
  if (host.village) return `${host.village} host`;
  return "Village host";
}

export async function requireAdmin(
  message = "Only super-administrators can manage host accounts.",
): Promise<Host> {
  const host = await requireHost();
  if (!isAdmin(host)) {
    redirect("/host?error=" + encodeURIComponent(message));
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
    throw new HostAdminError("Only super-administrators can manage host accounts.");
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
    throw new HostAdminError("You cannot change your own super-administrator role.");
  }
  if (isAdmin(target) && nextRole !== "admin" && adminCount <= 1) {
    throw new HostAdminError("There must be at least one super-administrator.");
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
    throw new HostAdminError("There must be at least one super-administrator.");
  }
}

export function assertCanCreateHost(actor: Pick<Host, "role">, role: string) {
  assertAdminActor(actor);
  if (role !== "admin" && role !== "sub_admin") {
    throw new HostAdminError("Choose super-admin or village host.");
  }
}

export function parseNewHost(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  village?: string;
}): {
  name: string;
  email: string;
  password: string;
  role: HostRole;
  village: Village | null;
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
  if (input.role === "admin") {
    return { name, email, password, role: "admin", village: null };
  }
  if (input.role !== "sub_admin") {
    throw new HostAdminError("Choose super-admin or village host.");
  }
  if (!isVillage(input.village)) {
    throw new HostAdminError("Choose one village for this host.");
  }
  return { name, email, password, role: "sub_admin", village: input.village };
}

export function parseNewSubAdmin(input: {
  name: string;
  email: string;
  password: string;
  village: string;
}): {
  name: string;
  email: string;
  password: string;
  village: Village;
} {
  const parsed = parseNewHost({ ...input, role: "sub_admin" });
  return { name: parsed.name, email: parsed.email, password: parsed.password, village: parsed.village as Village };
}
