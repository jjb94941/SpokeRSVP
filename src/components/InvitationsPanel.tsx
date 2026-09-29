import { CopyLinkButton } from "@/components/CopyLinkButton";
import {
  addImportedInvites,
  addPastedInvites,
  deliverInvitations,
} from "@/lib/actions/invitations";
import type { EventRow, InvitationRow } from "@/lib/db/schema";
import { invitationEmail, invitationMailto, inviteStatusLabel, type ImportPerson } from "@/lib/invitations";
import { formatPacificRange } from "@/lib/time";
import { villageTitle } from "@/lib/villages";

const fieldClass =
  "w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink";

export function InvitationsPanel({
  event,
  origin,
  invitations,
  importChoices,
  selectedImportId,
  includeWaitlist,
  importPeople,
  linksOpen,
}: {
  event: EventRow;
  origin: string;
  invitations: InvitationRow[];
  importChoices: { id: string; label: string }[];
  selectedImportId: string;
  includeWaitlist: boolean;
  importPeople: ImportPerson[] | null;
  linksOpen: boolean;
}) {
  const unsent = invitations.filter((row) => row.status === "not_sent").length;
  const when = formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime());

  return (
    <section id="invitations" className="card mt-8">
      <h2 className="font-display text-2xl">Invitations</h2>
      <p className="mt-2 text-[17px] text-ink">
        Add people, then send each person a private registration link. No password is needed. You can also copy a
        link or open it in your own email program.
      </p>
      {!linksOpen ? (
        <p className="mt-4 rounded-2xl border-2 border-terracotta bg-terracotta/10 px-4 py-3 text-[17px] font-bold text-ink">
          This event is {event.status === "cancelled" ? "cancelled" : "already in the past"}, so invitation links no
          longer open registration.
        </p>
      ) : null}

      <form action={addPastedInvites} className="mt-6">
        <input type="hidden" name="eventId" value={event.id} />
        <label htmlFor="invite-emails" className="mb-2 block text-[17px] font-bold text-ink">
          Paste email addresses
        </label>
        <p className="meta-line mb-2">Separate them with commas, spaces, or new lines. Duplicates are kept once.</p>
        <textarea
          id="invite-emails"
          name="emails"
          rows={4}
          placeholder="ada@example.com, sam@example.com"
          className="w-full rounded-[14px] border-2 border-card-border bg-white px-4 py-3 text-[17px] leading-relaxed text-ink"
        />
        <button type="submit" className={invitations.length === 0 ? "btn-primary mt-4" : "btn-secondary mt-4"}>
          Add these emails
        </button>
      </form>

      <form method="get" action={`/host/events/${event.id}#invitations`} className="mt-8">
        <label htmlFor="import-event" className="mb-2 block text-[17px] font-bold text-ink">
          Import from another event
        </label>
        <p className="meta-line mb-2">
          Only events you manage are listed. This shows names and emails, never waiver answers.
        </p>
        <select id="import-event" name="importEvent" defaultValue={selectedImportId} className={fieldClass}>
          <option value="">Choose an event</option>
          {importChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        <label className="mt-4 flex min-h-14 items-center gap-3 text-[17px] font-bold text-ink">
          <input type="checkbox" name="waitlist" value="1" defaultChecked={includeWaitlist} className="h-6 w-6 accent-teal" />
          Include people on the waitlist
        </label>
        <button type="submit" className="btn-secondary mt-2">
          Show people from that event
        </button>
      </form>

      {importPeople ? (
        <form action={addImportedInvites} className="mt-6">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="sourceEventId" value={selectedImportId} />
          <p className="text-[17px] font-bold text-ink">People you can invite</p>
          {importPeople.length === 0 ? (
            <p className="mt-2 text-[17px] text-ink">No one on that list has an email address.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {importPeople.map((person) => (
                <li key={`${person.name}-${person.email || "none"}`} className="inset-row">
                  {person.email && !person.alreadyRegistered ? (
                    <label className="flex min-h-14 items-start gap-3 text-[17px] text-ink">
                      <input
                        type="checkbox"
                        name="email"
                        value={person.email}
                        defaultChecked={!person.alreadyInvited}
                        className="mt-1 h-6 w-6 accent-teal"
                      />
                      <input type="hidden" name={`name:${person.email}`} value={person.name} />
                      <span>
                        <span className="font-bold">{person.name}</span>
                        <span className="meta-line block">{person.email}</span>
                        {person.rsvpStatus === "waitlist" ? <span className="meta-line block">On the waitlist</span> : null}
                        {person.alreadyInvited ? (
                          <span className="meta-line block">Already invited. Saving again keeps the same link.</span>
                        ) : null}
                      </span>
                    </label>
                  ) : (
                    <p className="text-[17px] text-ink">
                      <span className="font-bold">{person.name}</span>
                      <span className="meta-line block">
                        {person.email
                          ? `${person.email} — already registered for this event`
                          : "No email address, so they cannot be invited"}
                      </span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="submit" className="btn-secondary mt-4">
            Add selected people
          </button>
        </form>
      ) : null}

      <div className="mt-8">
        <h3 className="font-display text-[24px] font-bold">Invite list</h3>
        {invitations.length === 0 ? (
          <p className="mt-2 text-[17px] text-ink">No invitations yet.</p>
        ) : (
          <form action={deliverInvitations} className="mt-4">
            <input type="hidden" name="eventId" value={event.id} />
            <ul className="grid gap-3">
              {invitations.map((invitation) => {
                const url = `${origin}/invite/${invitation.token}`;
                const content = invitationEmail({
                  name: invitation.name,
                  eventTitle: event.title,
                  village: event.village,
                  when,
                  where: event.locationName,
                  message: invitation.message,
                  registerUrl: url,
                });
                return (
                  <li key={invitation.id} className="inset-row">
                    <p className="text-[17px] font-bold text-ink">{invitation.name || invitation.email}</p>
                    {invitation.name ? <p className="meta-line">{invitation.email}</p> : null}
                    <p className="status-line mt-1">{inviteStatusLabel(invitation.status)}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <CopyLinkButton url={url} label="Copy link" />
                      <a href={invitationMailto(invitation.email, content.subject, content.text)} className="btn-secondary">
                        Open in my email
                      </a>
                      {linksOpen ? (
                        <button type="submit" name="invitationId" value={invitation.id} className="btn-secondary">
                          Resend invitation
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {linksOpen ? (
              <>
                <label htmlFor="invite-message" className="mb-2 mt-6 block text-[17px] font-bold text-ink">
                  Personal note (optional)
                </label>
                <textarea
                  id="invite-message"
                  name="message"
                  rows={3}
                  maxLength={500}
                  placeholder="A short note from you, included in the email."
                  className="w-full rounded-[14px] border-2 border-card-border bg-white px-4 py-3 text-[17px] leading-relaxed text-ink"
                />
                <button type="submit" className="btn-primary mt-4" disabled={unsent === 0}>
                  {unsent === 0 ? "No new invitations to send" : `Send ${unsent} new ${unsent === 1 ? "invitation" : "invitations"}`}
                </button>
                <p className="meta-line mt-3">
                  Sending stores the email in the{" "}
                  <a href="/host/outbox" className="font-bold text-teal underline">
                    Outbox
                  </a>
                  . It is not delivered to a real inbox in this pilot.
                </p>
              </>
            ) : null}
          </form>
        )}
      </div>
      <p className="meta-line mt-4">{villageTitle(event.village)}</p>
    </section>
  );
}
