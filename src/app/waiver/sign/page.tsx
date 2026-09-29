import Link from "next/link";
import { eq } from "drizzle-orm";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Flash } from "@/components/Ui";
import { memberRsvp, signInMember, signWaiverAndRegister } from "@/lib/actions/member";
import { getMemberEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { safeMemberReturnPath } from "@/lib/member-path";
import { getEventCounts } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";
import { villageTitle } from "@/lib/villages";
import { parseStoredFields, unsignedWaiverForEvent } from "@/lib/waivers";

export default async function SignWaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; returnTo?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const eventId = params.eventId || "";
  const returnTo = safeMemberReturnPath(params.returnTo || "/");
  const here = `/waiver/sign?eventId=${encodeURIComponent(eventId)}`;
  const memberEmail = await getMemberEmail();
  const db = await getDb();
  const event = eventId ? await db.select().from(events).where(eq(events.id, eventId)).get() : undefined;
  const waiver = event && memberEmail ? await unsignedWaiverForEvent(event.eventTypeId, memberEmail) : null;
  const counts = event ? await getEventCounts(event) : null;
  const full = counts ? counts.spotsLeft === 0 : false;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <p className="text-lg font-semibold tracking-wide text-teal">Marin Villages</p>
        <h1 className="font-display mt-2 text-4xl leading-tight font-semibold">Sign the waiver</h1>
        <Flash ok={params.ok} error={params.error} />

        {!event || event.status !== "published" ? (
          <div className="card mt-6">
            <p className="text-[17px] text-ink">That event is not open for sign-up.</p>
            <Link href="/" className="btn-primary mt-4">
              See village events
            </Link>
          </div>
        ) : (
          <>
            <p className="meta-line mt-3">{villageTitle(event.village)}</p>
            <p className="font-display mt-1 text-[28px] font-bold">{event.title}</p>
            <p className="meta-line mt-2">{formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime())}</p>
            <p className="meta-line">{event.locationName}</p>

            {!memberEmail ? (
              <form action={signInMember} className="card mt-6">
                <input type="hidden" name="returnTo" value={here} />
                <label htmlFor="email" className="mb-2 block text-[17px] font-bold text-ink">
                  Your email
                </label>
                <p className="mb-3 text-[17px] text-ink">Enter your email before you sign. No password is needed.</p>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                />
                <button type="submit" className="btn-primary mt-4">
                  Continue with email
                </button>
              </form>
            ) : !waiver ? (
              <form action={memberRsvp} className="card mt-6">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="eventId" value={event.id} />
                <p className="text-[17px] text-ink">
                  Signed in as <span className="font-bold">{memberEmail}</span>. You have already signed the current
                  waiver for this event, or this event does not need one.
                </p>
                <button type="submit" className="btn-primary mt-4">
                  {full ? `Join the waitlist for ${event.title}` : `Sign up for ${event.title}`}
                </button>
              </form>
            ) : (
              <form action={signWaiverAndRegister} className="mt-6">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="versionId" value={waiver.id} />
                <p className="text-[17px] text-ink">
                  Signed in as <span className="font-bold">{memberEmail}</span>. Read the waiver below, then agree and
                  type your full name.
                </p>
                <h2 className="font-display mt-6 text-[28px] font-bold">
                  {waiver.title} · version {waiver.version}
                </h2>
                <div className="card mt-4 max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-[17px] leading-relaxed text-ink">
                  {waiver.body}
                </div>
                {parseStoredFields(waiver.fieldsJson).map((field) => (
                  <div key={field.id} className="mt-5">
                    <label htmlFor={`field_${field.id}`} className="mb-2 block text-[17px] font-bold text-ink">
                      {field.label}
                      {field.required ? <span className="text-terracotta"> (required)</span> : <span className="font-semibold text-muted"> (optional)</span>}
                    </label>
                    {field.help ? <p className="meta-line mb-2">{field.help}</p> : null}
                    {field.multiline ? (
                      <textarea
                        id={`field_${field.id}`}
                        name={`field_${field.id}`}
                        required={field.required}
                        rows={4}
                        className="w-full rounded-[14px] border-2 border-card-border bg-white px-4 py-3 text-[17px] leading-relaxed text-ink"
                      />
                    ) : (
                      <input
                        id={`field_${field.id}`}
                        name={`field_${field.id}`}
                        required={field.required}
                        className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                      />
                    )}
                  </div>
                ))}
                <label className="mt-6 flex min-h-14 items-start gap-3 rounded-[14px] border-2 border-card-border bg-card px-4 py-3 text-[17px] font-bold text-ink">
                  <input type="checkbox" name="agree" value="yes" required className="mt-1 h-6 w-6 accent-teal" />
                  <span>I have read this waiver and I agree.</span>
                </label>
                <label htmlFor="signerName" className="mb-2 mt-5 block text-[17px] font-bold text-ink">
                  Your full name
                </label>
                <input
                  id="signerName"
                  name="signerName"
                  required
                  autoComplete="name"
                  placeholder="First and last name"
                  className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                />
                <button type="submit" className="btn-primary mt-4">
                  {full ? `Sign and join the waitlist for ${event.title}` : `Sign and register for ${event.title}`}
                </button>
              </form>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
