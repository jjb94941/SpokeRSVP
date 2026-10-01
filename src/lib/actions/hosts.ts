"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { appUrl, requireHost, setNewHostPasswordFlash } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, hosts } from "@/lib/db/schema";
import { newId, newSecretToken } from "@/lib/ids";
import { sendEmail, subAdminWelcomeText, superAdminWelcomeText } from "@/lib/notify";
import {
  HostAdminError,
  assertCanCreateHost,
  assertCanRemoveHost,
  assertCanSetRole,
  countAdmins,
  isAdmin,
  parseNewHost,
} from "@/lib/roles";
import { isVillage, villageTitle } from "@/lib/villages";

function formString(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function adminsError(message: string): never {
  redirect("/host/admins?error=" + encodeURIComponent(message));
}

async function requireAdminActor() {
  const actor = await requireHost();
  if (!isAdmin(actor)) {
    redirect("/host?error=" + encodeURIComponent("Only super-administrators can manage host accounts."));
  }
  return actor;
}

export async function createHost(formData: FormData) {
  const actor = await requireAdminActor();
  const role = formString(formData, "role") || "sub_admin";
  try {
    assertCanCreateHost(actor, role);
  } catch (error) {
    adminsError(error instanceof HostAdminError ? error.message : "Only super-administrators can add hosts.");
  }
  const providedPassword = formString(formData, "password");
  const password = providedPassword || newSecretToken(9);
  let parsed;
  try {
    parsed = parseNewHost({
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      password,
      role,
      village: formString(formData, "village"),
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
      role: parsed.role,
      village: parsed.village,
      createdAt: new Date(),
    })
    .run();

  await setNewHostPasswordFlash(parsed.password);
  const loginUrl = `${await appUrl()}/login`;
  if (parsed.role === "admin") {
    await sendEmail({
      to: parsed.email,
      subject: "You were added as a SpokeRSVP super-admin",
      text: superAdminWelcomeText({ name: parsed.name, loginUrl, appointedBy: actor.name }),
    });
    redirect(
      "/host/admins?ok=" +
        encodeURIComponent(`${parsed.name} is a super-admin. Share the temporary password shown below.`),
    );
  }
  await sendEmail({
    to: parsed.email,
    subject: `You were added as a SpokeRSVP host for ${villageTitle(parsed.village || "")}`,
    text: subAdminWelcomeText({
      name: parsed.name,
      loginUrl,
      appointedBy: actor.name,
      villageTitle: villageTitle(parsed.village || ""),
    }),
  });
  redirect(
    "/host/admins?ok=" +
      encodeURIComponent(
        `${parsed.name} can now manage ${villageTitle(parsed.village || "")} events. Share the temporary password shown below.`,
      ),
  );
}

export async function setHostVillage(formData: FormData) {
  await requireAdminActor();
  const targetId = formString(formData, "hostId");
  const village = formString(formData, "village");
  if (!isVillage(village)) adminsError("Choose one village for this host.");
  const db = await getDb();
  const target = await db.select().from(hosts).where(eq(hosts.id, targetId)).get();
  if (!target) adminsError("That host account was not found.");
  if (isAdmin(target)) {
    adminsError("Super-administrators are not assigned to a single village.");
  }
  await db.update(hosts).set({ village }).where(eq(hosts.id, target.id)).run();
  redirect(
    "/host/admins?ok=" + encodeURIComponent(`${target.name} now manages ${villageTitle(village)}.`),
  );
}

export async function setHostRole(formData: FormData) {
  const actor = await requireAdminActor();
  if (formString(formData, "confirm") !== "yes") {
    adminsError("Check the box to confirm this role change.");
  }
  const targetId = formString(formData, "hostId");
  const nextRole = formString(formData, "role");
  const village = formString(formData, "village");
  const db = await getDb();
  const allHosts = await db.select().from(hosts).all();
  const target = allHosts.find((row) => row.id === targetId);
  if (!target) adminsError("That host account was not found.");
  try {
    assertCanSetRole(actor, target, nextRole, countAdmins(allHosts));
  } catch (error) {
    adminsError(error instanceof HostAdminError ? error.message : "That role change is not allowed.");
  }
  if (nextRole === "sub_admin" && !isVillage(village)) {
    adminsError("Choose one village before assigning this host.");
  }
  await db
    .update(hosts)
    .set({
      role: nextRole as "admin" | "sub_admin",
      village: nextRole === "admin" ? null : village,
    })
    .where(eq(hosts.id, target.id))
    .run();
  const label =
    nextRole === "admin" ? "a super-administrator" : `a host for ${villageTitle(village)}`;
  redirect("/host/admins?ok=" + encodeURIComponent(`${target.name} is now ${label}.`));
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
