import { createEvent } from "@/lib/actions/events";
import { EventForm } from "@/components/EventForm";
import { Flash } from "@/components/Ui";
import Link from "next/link";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href="/host" className="text-lg font-semibold text-teal underline">
          Back to host home
        </Link>
      </p>
      <h1 className="font-display mb-6 text-4xl">Create an event</h1>
      <Flash error={params.error} />
      <EventForm action={createEvent} submitLabel="Create event" />
    </main>
  );
}
