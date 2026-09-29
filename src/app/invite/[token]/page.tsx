import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Flash } from "@/components/Ui";
import { acceptInvitation } from "@/lib/actions/invitations";
import { findInvitationByToken, inviteBlockReason, markInvitationOpened } from "@/lib/invitations";
import { formatPacificRange } from "@/lib/time";
import { villageTitle } from "@/lib/villages";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { token } = await params;
  const q = await searchParams;
  const found = await findInvitationByToken(token);
  const reason = found ? inviteBlockReason(found.event, new Date()) : "invalid";
  if (found && !reason) await markInvitationOpened(found.invitation);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <p className="text-lg font-semibold tracking-wide text-teal">Marin Villages</p>
        <h1 className="font-display mt-2 text-4xl leading-tight font-semibold">You are invited</h1>
        <Flash ok={q.ok} error={q.error} />

        {!found || reason === "invalid" ? (
          <div className="card mt-6">
            <p className="text-[17px] text-ink">This invitation link is not valid. Ask the host to send a new one.</p>
            <Link href="/" className="btn-primary mt-4">
              See village events
            </Link>
          </div>
        ) : reason === "cancelled" ? (
          <div className="card mt-6">
            <p className="font-display text-[28px] font-bold">{found.event.title}</p>
            <p className="mt-3 text-[17px] text-ink">This event was cancelled, so this invitation link no longer works.</p>
            <Link href="/" className="btn-primary mt-4">
              See village events
            </Link>
          </div>
        ) : reason === "past" ? (
          <div className="card mt-6">
            <p className="font-display text-[28px] font-bold">{found.event.title}</p>
            <p className="mt-3 text-[17px] text-ink">
              This event has already happened, so this invitation link no longer works.
            </p>
            <Link href="/" className="btn-primary mt-4">
              See village events
            </Link>
          </div>
        ) : (
          <>
            <p className="meta-line mt-3">{villageTitle(found.event.village)}</p>
            <p className="font-display mt-1 text-[28px] font-bold">{found.event.title}</p>
            <p className="meta-line mt-2">
              {formatPacificRange(found.event.startsAt.getTime(), found.event.endsAt?.getTime())}
            </p>
            <p className="meta-line">{found.event.locationName}</p>
            {found.event.description ? (
              <p className="mt-4 whitespace-pre-wrap text-[17px] leading-relaxed text-ink">{found.event.description}</p>
            ) : null}

            {found.invitation.status === "registered" ? (
              <div className="card mt-6">
                <p className="text-[17px] text-ink">
                  <span className="font-bold">{found.invitation.email}</span> is signed up for {found.event.title}. No
                  password is needed.
                </p>
                <Link href="/my-events" className="btn-primary mt-4">
                  See my events
                </Link>
              </div>
            ) : (
              <form action={acceptInvitation} className="card mt-6">
                <input type="hidden" name="token" value={token} />
                <p className="text-[17px] text-ink">
                  This invitation is for <span className="font-bold">{found.invitation.email}</span>. No password is
                  needed.
                </p>
                <label htmlFor="guestName" className="mb-2 mt-5 block text-[17px] font-bold text-ink">
                  Your name
                </label>
                <input
                  id="guestName"
                  name="guestName"
                  required
                  defaultValue={found.invitation.name || ""}
                  autoComplete="name"
                  className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                />
                <button type="submit" className="btn-primary mt-4">
                  Register
                </button>
                <p className="meta-line mt-3">
                  If the gathering is full, registering puts you on the waitlist. A waiver, when this event needs one,
                  comes next.
                </p>
              </form>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
