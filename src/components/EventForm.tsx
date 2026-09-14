import { Field, inputClass } from "./Ui";
import type { EventRow } from "@/lib/db/schema";
import { utcToPacificParts } from "@/lib/time";

export function EventForm({
  event,
  action,
  submitLabel,
}: {
  event?: EventRow;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  const start = event ? utcToPacificParts(event.startsAt) : { date: "", time: "10:00" };
  const end = event?.endsAt ? utcToPacificParts(event.endsAt) : { date: "", time: "" };

  return (
    <form action={action} className="card max-w-2xl">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <Field label="Event title" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          minLength={3}
          defaultValue={event?.title}
          className={inputClass}
          placeholder="Third Wednesday Walkers"
        />
      </Field>
      <Field label="Description" htmlFor="description" hint="What should neighbors know before they RSVP?">
        <textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={event?.description}
          className={`${inputClass} min-h-32 py-3`}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="date">
          <input id="date" name="date" type="date" required defaultValue={start.date} className={inputClass} />
        </Field>
        <Field label="Start time" htmlFor="startTime" hint="Pacific Time">
          <input
            id="startTime"
            name="startTime"
            type="time"
            required
            defaultValue={start.time}
            className={inputClass}
          />
        </Field>
        <Field label="End time (optional)" htmlFor="endTime">
          <input id="endTime" name="endTime" type="time" defaultValue={end.time} className={inputClass} />
        </Field>
      </div>
      <Field
        label="Location name"
        htmlFor="locationName"
        hint="A place name guests will recognize, such as Old Mill Park or Equator Coffees."
      >
        <input
          id="locationName"
          name="locationName"
          required
          defaultValue={event?.locationName}
          className={inputClass}
        />
      </Field>
      <Field
        label="Street address (optional, private)"
        htmlFor="streetAddress"
        hint="Only you will see this on the host dashboard. Guests see the location name, not the street address."
      >
        <input
          id="streetAddress"
          name="streetAddress"
          defaultValue={event?.streetAddress ?? ""}
          className={inputClass}
          autoComplete="street-address"
        />
      </Field>
      <Field label="Capacity" htmlFor="capacity" hint="When this many people are Going, new RSVPs join the waitlist.">
        <input
          id="capacity"
          name="capacity"
          type="number"
          min={1}
          required
          defaultValue={event?.capacity ?? 12}
          className={inputClass}
        />
      </Field>
      <div className="mb-8 rounded-2xl bg-sand px-4 py-4">
        <label className="flex items-start gap-3 text-lg">
          <input
            type="checkbox"
            name="carpoolsEnabled"
            defaultChecked={event?.carpoolsEnabled}
            className="mt-1 h-6 w-6 accent-teal"
          />
          <span>
            <span className="font-bold">Offer carpools</span>
            <span className="mt-1 block text-base text-ink/80">
              Guests who are Going can offer seats or ask for a ride. The list is visible to Going guests and
              to you.
            </span>
          </span>
        </label>
      </div>
      <button type="submit" className="btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
