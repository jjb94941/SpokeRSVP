import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { eventTypes, events, waiverVersions, waivers } from "./db/schema";
import * as schema from "./db/schema";
import { newId } from "./ids";
import type { WaiverField } from "./waivers";

export const WALK_TYPE_NAME = "Walk/Hike";
export const SOCIAL_TYPE_NAME = "Social";
export const BOOK_TYPE_NAME = "Book club";
export const WALK_WAIVER_TITLE = "Walk and hike liability waiver";

export const WALK_WAIVER_BODY = `Walk and hike liability waiver
Marin Villages

Please read this whole page before you agree.

I want to join a walk or hike organized by my village. I understand that walking and hiking are physical activities. Paths can be uneven. Weather, traffic, and other people on the trail can change the conditions.

I am responsible for deciding whether this activity is right for me. I will wear suitable shoes, bring water, and tell the host if I need to stop or turn back.

I understand that volunteer hosts are neighbors, not professional guides. They will do their best to keep the group together. They cannot remove every risk.

I accept the ordinary risks of walking and hiking outdoors. I will not hold Marin Villages, my village, or the volunteer hosts responsible for those ordinary risks.

If I am injured, I will seek the care I need and contact the host as soon as I can.

This waiver is for this local village pilot. It is not medical advice. Signing it does not cancel any event I have already joined. If this text or the questions change, I will be asked to sign the new version before I register for another walk or hike.`;

export const WALK_WAIVER_FIELDS: WaiverField[] = [
  {
    id: "emergency-contact-name",
    label: "Emergency contact name",
    help: "Someone we can call if you need help.",
    required: true,
    multiline: false,
  },
  {
    id: "emergency-contact-phone",
    label: "Emergency contact phone",
    help: "A phone number for that person.",
    required: true,
    multiline: false,
  },
  {
    id: "blood-type",
    label: "Blood type",
    help: "Optional. Leave blank if you do not know it.",
    required: false,
    multiline: false,
  },
  {
    id: "allergies",
    label: "Allergies",
    help: "Optional. Include foods or medicines the host should know about.",
    required: false,
    multiline: true,
  },
];

type Db = LibSQLDatabase<typeof schema>;

async function database(): Promise<Db> {
  const { getDb } = await import("./db");
  return getDb();
}

export function eventTypeNameForTitle(title: string): string {
  const text = title.toLowerCase();
  if (text.includes("book")) return BOOK_TYPE_NAME;
  if (text.includes("walk") || text.includes("hike")) return WALK_TYPE_NAME;
  return SOCIAL_TYPE_NAME;
}

/** Create the pilot event types and walk waiver once. Assign a type to events that do not have one. */
export async function ensureEventCatalog(database: Db) {
  const existing = await database.select().from(eventTypes).all();
  if (existing.length === 0) {
    const now = new Date();
    const waiverId = newId();
    await database.insert(waivers).values({ id: waiverId, title: WALK_WAIVER_TITLE, createdAt: now }).run();
    await database
      .insert(waiverVersions)
      .values({
        id: newId(),
        waiverId,
        version: 1,
        title: WALK_WAIVER_TITLE,
        body: WALK_WAIVER_BODY,
        fieldsJson: JSON.stringify(WALK_WAIVER_FIELDS),
        createdAt: now,
      })
      .run();
    await database
      .insert(eventTypes)
      .values([
        {
          id: newId(),
          name: WALK_TYPE_NAME,
          waiverId,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: newId(),
          name: SOCIAL_TYPE_NAME,
          waiverId: null,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: newId(),
          name: BOOK_TYPE_NAME,
          waiverId: null,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  }

  const types = await database.select().from(eventTypes).all();
  const byName = new Map(types.map((type) => [type.name, type]));
  const fallback = byName.get(SOCIAL_TYPE_NAME) ?? types[0];
  if (!fallback) return;
  const untyped = (await database.select().from(events).all()).filter((event) => !event.eventTypeId);
  for (const event of untyped) {
    const match = byName.get(eventTypeNameForTitle(event.title)) ?? fallback;
    await database.update(events).set({ eventTypeId: match.id }).where(eq(events.id, event.id)).run();
  }
}

export type EventTypeChoice = {
  id: string;
  name: string;
  archived: boolean;
  waiverTitle: string | null;
};

export async function listEventTypeChoices(currentTypeId?: string | null): Promise<EventTypeChoice[]> {
  const db = await database();
  const types = await db.select().from(eventTypes).all();
  const waiverRows = await db.select().from(waivers).all();
  const titles = new Map(waiverRows.map((waiver) => [waiver.id, waiver.title]));
  return types
    .filter((type) => !type.archived || type.id === currentTypeId)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
    .map((type) => ({
      id: type.id,
      name: type.name,
      archived: type.archived,
      waiverTitle: type.waiverId ? titles.get(type.waiverId) ?? null : null,
    }));
}

export async function resolveEventTypeId(raw: string, previousId?: string | null): Promise<string> {
  const id = raw.trim();
  if (!id) throw new Error("Choose an event type.");
  const db = await database();
  const type = await db.select().from(eventTypes).where(eq(eventTypes.id, id)).get();
  if (!type) throw new Error("Choose an event type.");
  if (type.archived && type.id !== previousId) {
    throw new Error("That event type is archived. Choose another.");
  }
  return type.id;
}
