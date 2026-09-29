import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { eventTypes, waiverSignatures, waiverVersions, waivers, type Host, type WaiverVersionRow } from "./db/schema";
import { normalizeEmail } from "./format";
import { newId } from "./ids";
import { HostAdminError, isAdmin } from "./roles";

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

export const MAX_WAIVER_FIELDS = 4;

export type WaiverField = {
  id: string;
  label: string;
  help: string;
  required: boolean;
  multiline: boolean;
};

export type WaiverAnswer = {
  fieldId: string;
  label: string;
  value: string;
};

export function assertWaiverFieldCount(count: number) {
  if (count > MAX_WAIVER_FIELDS) {
    throw new Error("A waiver can have at most 4 fields.");
  }
}

export function parseStoredFields(raw: string | null | undefined): WaiverField[] {
  try {
    const value = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is WaiverField => {
        if (!item || typeof item !== "object") return false;
        const field = item as WaiverField;
        return typeof field.id === "string" && typeof field.label === "string";
      })
      .slice(0, MAX_WAIVER_FIELDS)
      .map((field) => ({
        id: field.id,
        label: field.label,
        help: typeof field.help === "string" ? field.help : "",
        required: Boolean(field.required),
        multiline: Boolean(field.multiline),
      }));
  } catch {
    return [];
  }
}

export function parseStoredAnswers(raw: string | null | undefined): WaiverAnswer[] {
  try {
    const value = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is WaiverAnswer => {
        if (!item || typeof item !== "object") return false;
        const answer = item as WaiverAnswer;
        return typeof answer.fieldId === "string" && typeof answer.label === "string";
      })
      .map((answer) => ({
        fieldId: answer.fieldId,
        label: answer.label,
        value: typeof answer.value === "string" ? answer.value : "",
      }));
  } catch {
    return [];
  }
}

export function waiverFieldsEqual(left: WaiverField[], right: WaiverField[]): boolean {
  assertWaiverFieldCount(left.length);
  assertWaiverFieldCount(right.length);
  if (left.length !== right.length) return false;
  return left.every((field, index) => {
    const other = right[index];
    return (
      field.id === other.id &&
      field.label === other.label &&
      field.help === other.help &&
      field.required === other.required &&
      field.multiline === other.multiline
    );
  });
}

export function readWaiverFields(formData: FormData): WaiverField[] {
  const fields: WaiverField[] = [];
  for (let index = 0; index < MAX_WAIVER_FIELDS; index += 1) {
    const label = String(formData.get(`fieldLabel${index}`) || "").trim();
    const help = String(formData.get(`fieldHelp${index}`) || "").trim();
    const required = formData.get(`fieldRequired${index}`) === "on";
    const multiline = formData.get(`fieldMultiline${index}`) === "on";
    if (!label && !help && !required && !multiline) continue;
    if (!label) throw new Error(`Field ${index + 1} needs a label, or clear that field.`);
    if (label.length > 80) throw new Error("Keep each field label to 80 characters or fewer.");
    if (help.length > 160) throw new Error("Keep each help note to 160 characters or fewer.");
    const existingId = String(formData.get(`fieldId${index}`) || "").trim();
    fields.push({ id: existingId || newId(), label, help, required, multiline });
  }
  assertWaiverFieldCount(fields.length);
  return fields;
}

export function collectWaiverAnswers(fields: WaiverField[], formData: FormData): WaiverAnswer[] {
  assertWaiverFieldCount(fields.length);
  return fields.map((field) => {
    const value = String(formData.get(`field_${field.id}`) || "").trim();
    if (field.required && !value) {
      throw new Error(`Enter ${field.label}.`);
    }
    return { fieldId: field.id, label: field.label, value };
  });
}

/** Public visitors never see answers. A village host sees them only for that village’s events. */
export function canViewWaiverAnswers(
  viewer: Pick<Host, "role" | "village"> | null,
  eventVillage: string,
): boolean {
  if (!viewer) return false;
  if (isAdmin(viewer)) return true;
  return Boolean(viewer.village) && viewer.village === eventVillage;
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

export async function latestAnswersForWaiver(waiverId: string, email: string): Promise<WaiverAnswer[] | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(waiverSignatures)
    .where(and(eq(waiverSignatures.waiverId, waiverId), eq(waiverSignatures.email, normalized)))
    .all();
  if (rows.length === 0) return null;
  const latest = rows.reduce((best, row) => (row.version > best.version ? row : best));
  return parseStoredAnswers(latest.answersJson);
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
  fields: WaiverField[],
): Promise<{ version: WaiverVersionRow; createdNew: boolean }> {
  const nextTitle = title.trim();
  const nextBody = body.trim();
  assertWaiverFieldCount(fields.length);
  if (nextTitle.length < 3) throw new Error("Enter a waiver title.");
  if (nextBody.length < 40) throw new Error("Enter the full waiver text neighbors will read.");
  const db = await getDb();
  const waiver = await db.select().from(waivers).where(eq(waivers.id, waiverId)).get();
  if (!waiver) throw new Error("That waiver could not be found.");
  const versions = await db.select().from(waiverVersions).where(eq(waiverVersions.waiverId, waiverId)).all();
  const current = versions.reduce((best, row) => (row.version > best.version ? row : best), versions[0]);
  if (!current) throw new Error("That waiver has no version to edit.");
  const sameBody = current.body.trim() === nextBody;
  const sameFields = waiverFieldsEqual(parseStoredFields(current.fieldsJson), fields);
  if (sameBody && sameFields) {
    if (current.title.trim() !== nextTitle || waiver.title.trim() !== nextTitle) {
      await db.update(waivers).set({ title: nextTitle }).where(eq(waivers.id, waiverId)).run();
      await db.update(waiverVersions).set({ title: nextTitle }).where(eq(waiverVersions.id, current.id)).run();
      return { version: { ...current, title: nextTitle }, createdNew: false };
    }
    throw new Error("Change the waiver text or the fields to save a new version.");
  }
  const now = new Date();
  const row: WaiverVersionRow = {
    id: newId(),
    waiverId,
    version: current.version + 1,
    title: nextTitle,
    body: nextBody,
    fieldsJson: JSON.stringify(fields),
    createdAt: now,
  };
  await db.update(waivers).set({ title: nextTitle }).where(eq(waivers.id, waiverId)).run();
  await db.insert(waiverVersions).values(row).run();
  return { version: row, createdNew: true };
}
