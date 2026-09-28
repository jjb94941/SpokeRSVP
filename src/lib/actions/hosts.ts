"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { appUrl, requireHost, setNewHostPasswordFlash } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, hosts } from "@/lib/db/schema";
import { newId, newSecretToken } from "@/lib/ids";
import { subAdminWelcomeText, sendEmail } from "@/lib/notify";
import {
  HostAdminError,
  assertCanRemoveHost,
  assertCanSetRole,
  countAdmins,
  isAdmin,
  parseNewSubAdmin,
} from "@/lib/roles";

function formString(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function adminsError(message: string): never {
  redirect("/host/admins?error=" + encodeURIComponent(message));
}

async function requireAdminActor() {
  const actor = await requireHost();
  if (!isAdmin(actor)) {
    redirect("/host?error=" + encodeURIComponent("Only administrators can manage host accounts."));
  }
  return actor;
}

export async function createSubAdmin(formData: FormData) {
  const actor = await requireAdminActor();
  const providedPassword = formString(formData, "password");
  const password = providedPassword || newSecretToken(9);
  let parsed;
  try {
    parsed = parseNewSubAdmin({
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      password,
    });
  } catch (error) {
    adminsError(error instanceof HostAdminError ? error.message : "Please check the form.");
  }

  const db = await getDb();
  const existing = await db.select().from(hosts).where(eq(hosts.email, parsed.email)).get();
  if (existing) {
    adminsError("A host account already uses that email.");
  }

  await db
    .insert(hosts)
    .values({
      id: newId(),
      email: parsed.email,
      passwordHash: bcrypt.hashSync(parsed.password, 10),
      name: parsed.name,
      role: "sub_admin",
      createdAt: new Date(),
    })
    .run();

  await setNewHostPasswordFlash(parsed.password);
  const loginUrl = `${await appUrl()}/login`;
  await sendEmail({
    to: parsed.email,
    subject: "You were added as a SpokeRSVP sub-administrator",
    text: subAdminWelcomeText({ name: parsed.name, loginUrl, appointedBy: actor.name }),
  });
  redirect(
    "/host/admins?ok=" +
      encodeURIComponent(`Sub-administrator ${parsed.name} was added. Share the temporary password shown below.`),
  );
}

export async function setHostRole(formData: FormData) {
  const actor = await requireAdminActor();
  const targetId = formString(formData, "hostId");
  const nextRole = formString(formData, "role");
  const db = await getDb();
  const allHosts = await db.select().from(hosts).all();
  const target = allHosts.find((row) => row.id === targetId);
  if (!target) adminsError("That host account was not found.");
  try {
    assertCanSetRole(actor, target, nextRole, countAdmins(allHosts));
  } catch (error) {
    adminsError(error instanceof HostAdminError ? error.message : "That role change is not allowed.");
  }
  await db
    .update(hosts)
    .set({ role: nextRole as "admin" | "sub_admin" })
    .where(eq(hosts.id, target.id))
    .run();
  const label = nextRole === "admin" ? "administrator" : "sub-administrator";
  redirect("/host/admins?ok=" + encodeURIComponent(`${target.name} is now a ${label}.`));
}

export async function removeHost(formData: FormData) {
  const actor = await requireAdminActor();
  const targetId = formString(formData, "hostId");
  if (formString(formData, "confirm") !== "yes") {
    adminsError("Check the box to confirm removing this host.");
  }
  const db = await getDb();
  const allHosts = await db.select().from(hosts).all();
  const target = allHosts.find((row) => row.id === targetId);
  if (!target) adminsError("That host account was not found.");
  try {
    assertCanRemoveHost(actor, target, countAdmins(allHosts));
  } catch (error) {
    adminsError(error instanceof HostAdminError ? error.message : "That host cannot be removed.");
  }

  const eventCountRow = await db
    .select({ n: count() })
    .from(events)
    .where(eq(events.hostId, target.id))
    .get();
  const eventCount = Number(eventCountRow?.n || 0);
  if (eventCount > 0) {
    await db.update(events).set({ hostId: actor.id, updatedAt: new Date() }).where(eq(events.hostId, target.id)).run();
  }

  await db.delete(hosts).where(eq(hosts.id, target.id)).run();

  const extra =
    eventCount > 0
      ? ` Their ${eventCount} event${eventCount === 1 ? "" : "s"} ${eventCount === 1 ? "was" : "were"} reassigned to you.`
      : "";
  redirect("/host/admins?ok=" + encodeURIComponent(`${target.name} was removed.${extra}`));
}
