import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/EventForm";
import { Flash } from "@/components/Ui";
import { updateEvent } from "@/lib/actions/events";
import { findManagedEvent } from "@/lib/roles";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const managed = await findManagedEvent(id);
  if (!managed) notFound();
  const { event } = managed;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href={`/host/events/${event.id}`} className="text-[17px] font-bold text-teal underline">
          Back to {event.title}
        </Link>
      </p>
      <h1 className="font-display mb-6 text-[32px] leading-tight font-bold">Edit event</h1>
      <Flash error={q.error} />
      <EventForm event={event} action={updateEvent} submitLabel="Save changes" />
    </main>
  );
}
