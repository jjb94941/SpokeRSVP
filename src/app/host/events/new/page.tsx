import { createEvent } from "@/lib/actions/events";
import { EventForm } from "@/components/EventForm";
import { Flash } from "@/components/Ui";
import { requireHost } from "@/lib/auth";
import { listEventTypeChoices } from "@/lib/event-catalog";
import { isAdmin } from "@/lib/roles";
import Link from "next/link";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const host = await requireHost();
  const admin = isAdmin(host);
  const eventTypes = await listEventTypeChoices();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href="/host" className="text-[17px] font-bold text-teal underline">
          Back to all village events
        </Link>
      </p>
      <h1 className="font-display mb-6 text-[32px] leading-tight font-bold">Create an event</h1>
      <Flash error={params.error} />
      <EventForm
        action={createEvent}
        submitLabel="Create event"
        chooseVillage={admin}
        defaultVillage={host.village || "Mill Valley"}
        eventTypes={eventTypes}
      />
    </main>
  );
}
