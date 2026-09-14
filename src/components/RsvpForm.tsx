import type { CarpoolRow, EventRow, RsvpRow } from "@/lib/db/schema";
import { guestRsvp } from "@/lib/actions/rsvp";
import { Field, inputClass } from "./Ui";

export function RsvpForm({
  event,
  existing,
  carpool,
  full,
}: {
  event: EventRow;
  existing?: RsvpRow | null;
  carpool?: CarpoolRow | null;
  full: boolean;
}) {
  const goingLabel = full && existing?.status !== "going" ? "Join the waitlist" : "I am going";

  return (
    <form action={guestRsvp} className="card">
      <input type="hidden" name="shareToken" value={event.shareToken} />
      {existing ? <input type="hidden" name="manageToken" value={existing.manageToken} /> : null}
      <h2 className="font-display mb-4 text-3xl">
        {existing ? "Change your RSVP" : "Will you join us?"}
      </h2>
      <Field label="Your name" htmlFor="guestName">
        <input
          id="guestName"
          name="guestName"
          required
          minLength={2}
          defaultValue={existing?.guestName}
          className={inputClass}
          autoComplete="name"
        />
      </Field>
      <Field
        label="Email (optional if you give a phone number)"
        htmlFor="email"
        hint="We use this to confirm your RSVP and to tell you if you move off the waitlist."
      >
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={existing?.email ?? ""}
          className={inputClass}
          autoComplete="email"
        />
      </Field>
      <Field label="Phone (optional if you give an email)" htmlFor="phone">
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={existing?.phone ?? ""}
          className={inputClass}
          autoComplete="tel"
        />
      </Field>
      <fieldset className="mb-6">
        <legend className="mb-2 text-lg font-bold">Your response</legend>
        <label className="mb-2 flex min-h-14 items-center gap-3 rounded-xl bg-sand px-4">
          <input
            type="radio"
            name="status"
            value="going"
            defaultChecked={!existing || existing.status !== "not_going"}
            className="h-6 w-6 accent-teal"
          />
          <span className="text-lg font-semibold">{goingLabel}</span>
        </label>
        <label className="flex min-h-14 items-center gap-3 rounded-xl bg-sand px-4">
          <input
            type="radio"
            name="status"
            value="not_going"
            defaultChecked={existing?.status === "not_going"}
            className="h-6 w-6 accent-terracotta"
          />
          <span className="text-lg font-semibold">I cannot go</span>
        </label>
      </fieldset>
      {event.carpoolsEnabled ? (
        <fieldset className="mb-6">
          <legend className="mb-2 text-lg font-bold">Ride (optional, if you are going)</legend>
          <label className="mb-2 flex min-h-14 items-center gap-3 rounded-xl bg-sand px-4">
            <input
              type="radio"
              name="carpoolRole"
              value="none"
              defaultChecked={!carpool || carpool.role === "none"}
              className="h-6 w-6 accent-teal"
            />
            <span className="text-lg">No ride needed</span>
          </label>
          <label className="mb-2 flex min-h-14 items-center gap-3 rounded-xl bg-sand px-4">
            <input
              type="radio"
              name="carpoolRole"
              value="offer"
              defaultChecked={carpool?.role === "offer"}
              className="h-6 w-6 accent-teal"
            />
            <span className="text-lg">I can offer a ride</span>
          </label>
          <label className="mb-3 flex min-h-14 items-center gap-3 rounded-xl bg-sand px-4">
            <input
              type="radio"
              name="carpoolRole"
              value="need"
              defaultChecked={carpool?.role === "need"}
              className="h-6 w-6 accent-teal"
            />
            <span className="text-lg">I need a ride</span>
          </label>
          <Field label="Seats you can offer (if driving)" htmlFor="seats">
            <input
              id="seats"
              name="seats"
              type="number"
              min={1}
              max={8}
              defaultValue={carpool?.seats ?? 3}
              className={inputClass}
            />
          </Field>
          <Field label="Ride note (optional)" htmlFor="carpoolNote" hint="Neighborhood, extra room for a walker, etc.">
            <input
              id="carpoolNote"
              name="carpoolNote"
              defaultValue={carpool?.note ?? ""}
              className={inputClass}
            />
          </Field>
        </fieldset>
      ) : null}
      <button type="submit" className="btn-primary w-full sm:w-auto">
        {existing ? "Save my RSVP" : "Send my RSVP"}
      </button>
    </form>
  );
}
