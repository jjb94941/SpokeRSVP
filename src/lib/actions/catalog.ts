"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/roles";
import { getDb } from "@/lib/db";
import { eventTypes, waiverVersions, waivers } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { appendWaiverVersion, readWaiverFields } from "@/lib/waivers";

const PAGE = "/host/event-types";

function done(message: string): never {
  redirect(`${PAGE}?ok=` + encodeURIComponent(message));
}

function fail(message: string): never {
  redirect(`${PAGE}?error=` + encodeURIComponent(message));
}

export async function createEventType(formData: FormData) {
  await requireAdmin("Only super-administrators can manage event types and waivers.");
  const name = String(formData.get("name") || "").trim();
  if (name.length < 2) fail("Enter a name for the event type.");
  const waiverId = String(formData.get("waiverId") || "").trim() || null;
  const db = await getDb();
  if (waiverId) {
    const waiver = await db.select().from(waivers).where(eq(waivers.id, waiverId)).get();
    if (!waiver) fail("Choose a waiver that exists, or leave it blank.");
  }
  const now = new Date();
  await db
    .insert(eventTypes)
    .values({ id: newId(), name, waiverId, archived: false, createdAt: now, updatedAt: now })
    .run();
  done(`Added the event type ${name}.`);
}

export async function updateEventType(formData: FormData) {
  await requireAdmin("Only super-administrators can manage event types and waivers.");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const waiverRaw = String(formData.get("waiverId") || "").trim();
  const waiverId = waiverRaw || null;
  if (name.length < 2) fail("Enter a name for the event type.");
  const db = await getDb();
  const type = await db.select().from(eventTypes).where(eq(eventTypes.id, id)).get();
  if (!type) fail("That event type could not be found.");
  if (waiverId) {
    const waiver = await db.select().from(waivers).where(eq(waivers.id, waiverId)).get();
    if (!waiver) fail("Choose a waiver that exists, or choose no waiver.");
  }
  await db
    .update(eventTypes)
    .set({ name, waiverId, updatedAt: new Date() })
    .where(eq(eventTypes.id, id))
    .run();
  done(waiverId ? `Saved ${name}.` : `${name} has no waiver.`);
}

export async function setEventTypeArchived(formData: FormData) {
  await requireAdmin("Only super-administrators can manage event types and waivers.");
  const id = String(formData.get("id") || "");
  const archived = String(formData.get("archived") || "") === "yes";
  const db = await getDb();
  const type = await db.select().from(eventTypes).where(eq(eventTypes.id, id)).get();
  if (!type) fail("That event type could not be found.");
  await db.update(eventTypes).set({ archived, updatedAt: new Date() }).where(eq(eventTypes.id, id)).run();
  done(archived ? `${type.name} is archived. Hosts cannot choose it for new events.` : `${type.name} is available again.`);
}

export async function createWaiver(formData: FormData) {
  await requireAdmin("Only super-administrators can manage event types and waivers.");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (title.length < 3) fail("Enter a waiver title.");
  if (body.length < 40) fail("Enter the full waiver text neighbors will read.");
  let fields;
  try {
    fields = readWaiverFields(formData);
  } catch (error) {
    fail((error as Error).message);
  }
  const db = await getDb();
  const now = new Date();
  const waiverId = newId();
  await db.insert(waivers).values({ id: waiverId, title, createdAt: now }).run();
  await db
    .insert(waiverVersions)
    .values({ id: newId(), waiverId, version: 1, title, body, fieldsJson: JSON.stringify(fields), createdAt: now })
    .run();
  done(`Created ${title}, version 1.`);
}

export async function saveWaiverVersion(formData: FormData) {
  await requireAdmin("Only super-administrators can manage event types and waivers.");
  const waiverId = String(formData.get("waiverId") || "");
  try {
    const saved = await appendWaiverVersion(
      waiverId,
      String(formData.get("title") || ""),
      String(formData.get("body") || ""),
      readWaiverFields(formData),
    );
    if (!saved.createdNew) done(`Updated the title of ${saved.version.title}. Existing signatures still count.`);
    done(
      `Saved ${saved.version.title}, version ${saved.version.version}. Neighbors sign this version the next time they register. People already signed up stay signed up.`,
    );
  } catch (error) {
    fail((error as Error).message);
  }
}
