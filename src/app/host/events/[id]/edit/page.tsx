import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { EventForm } from "@/components/EventForm";
import { Flash } from "@/components/Ui";
import { updateEvent } from "@/lib/actions/events";
import { requireHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const host = await requireHost();
  const { id } = await params;
  const q = await searchParams;
  const event = getDb()
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.hostId, host.id)))
    .get();
  if (!event) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href={`/host/events/${event.id}`} className="text-lg font-semibold text-teal underline">
          Back to {event.title}
        </Link>
      </p>
      <h1 className="font-display mb-6 text-4xl">Edit event</h1>
      <Flash error={q.error} />
      <EventForm event={event} action={updateEvent} submitLabel="Save changes" />
    </main>
  );
}
