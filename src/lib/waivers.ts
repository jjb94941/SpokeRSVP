import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { eventTypes, waiverSignatures, waiverVersions, waivers, type WaiverVersionRow } from "./db/schema";
import { normalizeEmail } from "./format";
import { newId } from "./ids";
import { HostAdminError, isAdmin } from "./roles";
import type { Host } from "./db/schema";

export function assertCanManageCatalog(actor: Pick<Host, "role">) {
  if (!isAdmin(actor)) {
    throw new HostAdminError("Only super-administrators can manage event types and waivers.");
  }
}

/** A signature counts only for the version that was current when the neighbor signed. */
export function needsWaiverSignature(currentVersionId: string | null, signedVersionId: string | null): boolean {
  if (!currentVersionId) return false;
  return signedVersionId !== currentVersionId;
}

export function isFullSignerName(name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((part) => part.length >= 1);
}

export type CurrentWaiver = WaiverVersionRow & { waiverTitle: string };

export async function currentWaiverForType(eventTypeId: string | null | undefined): Promise<CurrentWaiver | null> {
  if (!eventTypeId) return null;
  const db = await getDb();
  const type = await db.select().from(eventTypes).where(eq(eventTypes.id, eventTypeId)).get();
  if (!type?.waiverId) return null;
  const waiver = await db.select().from(waivers).where(eq(waivers.id, type.waiverId)).get();
  if (!waiver) return null;
  const version = await db
    .select()
    .from(waiverVersions)
    .where(eq(waiverVersions.waiverId, waiver.id))
    .orderBy(desc(waiverVersions.version))
    .get();
  if (!version) return null;
  return { ...version, waiverTitle: waiver.title };
}

export async function signedVersionId(email: string, waiverId: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(waiverSignatures)
    .where(and(eq(waiverSignatures.waiverId, waiverId), eq(waiverSignatures.email, normalized)))
    .all();
  if (rows.length === 0) return null;
  const versions = await db.select().from(waiverVersions).where(eq(waiverVersions.waiverId, waiverId)).all();
  const numberById = new Map(versions.map((version) => [version.id, version.version]));
  const latest = rows.reduce((best, row) => ((numberById.get(row.waiverVersionId) ?? 0) > (numberById.get(best.waiverVersionId) ?? 0) ? row : best));
  return latest.waiverVersionId;
}

export async function unsignedWaiverForEvent(eventTypeId: string | null | undefined, email: string): Promise<CurrentWaiver | null> {
  const current = await currentWaiverForType(eventTypeId);
  if (!current) return null;
  const signed = await signedVersionId(email, current.waiverId);
  return needsWaiverSignature(current.id, signed) ? current : null;
}

export async function appendWaiverVersion(
  waiverId: string,
  title: string,
  body: string,
): Promise<{ version: WaiverVersionRow; createdNew: boolean }> {
  const nextTitle = title.trim();
  const nextBody = body.trim();
  if (nextTitle.length < 3) throw new Error("Enter a waiver title.");
  if (nextBody.length < 40) throw new Error("Enter the full waiver text neighbors will read.");
  const db = await getDb();
  const waiver = await db.select().from(waivers).where(eq(waivers.id, waiverId)).get();
  if (!waiver) throw new Error("That waiver could not be found.");
  const versions = await db.select().from(waiverVersions).where(eq(waiverVersions.waiverId, waiverId)).all();
  const current = versions.reduce((best, row) => (row.version > best.version ? row : best), versions[0]);
  if (!current) throw new Error("That waiver has no version to edit.");
  if (current.body.trim() === nextBody) {
    if (current.title.trim() !== nextTitle || waiver.title.trim() !== nextTitle) {
      await db.update(waivers).set({ title: nextTitle }).where(eq(waivers.id, waiverId)).run();
      await db.update(waiverVersions).set({ title: nextTitle }).where(eq(waiverVersions.id, current.id)).run();
      return { version: { ...current, title: nextTitle }, createdNew: false };
    }
    throw new Error("Change the waiver text to save a new version.");
  }
  const now = new Date();
  const row: WaiverVersionRow = {
    id: newId(),
    waiverId,
    version: current.version + 1,
    title: nextTitle,
    body: nextBody,
    createdAt: now,
  };
  await db.update(waivers).set({ title: nextTitle }).where(eq(waivers.id, waiverId)).run();
  await db.insert(waiverVersions).values(row).run();
  return { version: row, createdNew: true };
}
