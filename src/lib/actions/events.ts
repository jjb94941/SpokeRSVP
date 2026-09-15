"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { appUrl, requireHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { newId, newShareToken } from "@/lib/ids";
import { findManagedEvent } from "@/lib/roles";
import { pacificWallToUtc } from "@/lib/time";
import { promoteRsvp } from "@/lib/rsvp-service";

const eventSchema = z.object({
  title: z.string().trim().min(3, "Please enter a title."),
  description: z.string().trim().default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Please choose a start time."),
  endTime: z.string().optional(),
  locationName: z.string().trim().min(2, "Please enter a location name."),
  streetAddress: z.string().trim().optional(),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1."),
  carpoolsEnabled: z.boolean().default(false),
});

function readEventForm(formData: FormData) {
  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || "",
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: String(formData.get("endTime") || "").trim() || undefined,
    locationName: formData.get("locationName"),
    streetAddress: String(formData.get("streetAddress") || "").trim() || undefined,
    capacity: formData.get("capacity"),
    carpoolsEnabled: formData.get("carpoolsEnabled") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Please check the form.");
  }
  const startsAt = pacificWallToUtc(parsed.data.date, parsed.data.startTime);
  const endsAt = parsed.data.endTime ? pacificWallToUtc(parsed.data.date, parsed.data.endTime) : null;
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("End time must be after the start time.");
  }
  return {
    title: parsed.data.title,
    description: parsed.data.description,
    startsAt,
    endsAt,
    locationName: parsed.data.locationName,
    streetAddress: parsed.data.streetAddress || null,
    capacity: parsed.data.capacity,
    carpoolsEnabled: parsed.data.carpoolsEnabled,
  };
}

export async function createEvent(formData: FormData) {
  const host = await requireHost();
  let values;
  try {
    values = readEventForm(formData);
  } catch (error) {
    redirect("/host/events/new?error=" + encodeURIComponent((error as Error).message));
  }
  const now = new Date();
  const id = newId();
  const db = await getDb();
  await db
    .insert(events)
    .values({
      id,
      hostId: host.id,
      shareToken: newShareToken(),
      status: "published",
      createdAt: now,
      updatedAt: now,
      ...values,
    })
    .run();
  redirect(`/host/events/${id}?ok=` + encodeURIComponent("Event created. Copy the RSVP link to share it."));
}

export async function updateEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  const managed = await findManagedEvent(id);
  if (!managed) redirect("/host");
  let values;
  try {
    values = readEventForm(formData);
  } catch (error) {
    redirect(`/host/events/${id}/edit?error=` + encodeURIComponent((error as Error).message));
  }
  const db = await getDb();
  await db
    .update(events)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(events.id, id))
    .run();
  redirect(`/host/events/${id}?ok=` + encodeURIComponent("Event updated."));
}

export async function cancelEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== "yes") {
    redirect(`/host/events/${id}?error=` + encodeURIComponent("Check the box to confirm cancellation."));
  }
  const managed = await findManagedEvent(id);
  if (!managed) redirect("/host");
  const db = await getDb();
  await db
    .update(events)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(events.id, id))
    .run();
  redirect(`/host/events/${id}?ok=` + encodeURIComponent("Event cancelled. Guests will see that it is no longer happening."));
}

export async function restoreEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  const managed = await findManagedEvent(id);
  if (!managed) redirect("/host");
  const db = await getDb();
  await db
    .update(events)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(events.id, id))
    .run();
  redirect(`/host/events/${id}?ok=` + encodeURIComponent("Event is open again."));
}

export async function hostPromote(formData: FormData) {
  const eventId = String(formData.get("eventId") || "");
  const rsvpId = String(formData.get("rsvpId") || "");
  const managed = await findManagedEvent(eventId);
  if (!managed) redirect("/host");
  try {
    await promoteRsvp(rsvpId, await appUrl());
  } catch (error) {
    redirect(`/host/events/${eventId}?error=` + encodeURIComponent((error as Error).message));
  }
  redirect(`/host/events/${eventId}?ok=` + encodeURIComponent("Guest promoted to Going."));
}
