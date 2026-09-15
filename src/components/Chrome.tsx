import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getCurrentHost } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { SpokeMark } from "./SpokeMark";

export async function SiteHeader({
  hostName,
  variant = "public",
  isAdminUser = false,
}: {
  hostName?: string | null;
  variant?: "public" | "host";
  isAdminUser?: boolean;
}) {
  const sessionHost = variant === "public" ? await getCurrentHost() : null;
  const signedInName = hostName || sessionHost?.name;
  const showAdminNav = isAdminUser || (sessionHost ? isAdmin(sessionHost) : false);

  return (
    <header className="bg-terracotta text-cream">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <Link href={variant === "host" || sessionHost ? "/host" : "/"} className="flex items-center gap-3 text-cream">
          <SpokeMark className="h-11 w-11" />
          <span>
            <span className="font-display block text-2xl leading-none font-semibold">SpokeRSVP</span>
            <span className="mt-1 block text-base tracking-wide">Mill Valley Village</span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-lg">
          {variant === "host" || sessionHost ? (
            <>
              <Link href="/" className="rounded-lg px-3 py-2 font-semibold underline-offset-4 hover:underline">
                Public events
              </Link>
              <Link href="/host" className="rounded-lg px-3 py-2 font-semibold underline-offset-4 hover:underline">
                Host home
              </Link>
              <Link
                href="/host/events/new"
                className="rounded-lg px-3 py-2 font-semibold underline-offset-4 hover:underline"
              >
                New event
              </Link>
              {showAdminNav ? (
                <Link
                  href="/host/admins"
                  className="rounded-lg px-3 py-2 font-semibold underline-offset-4 hover:underline"
                >
                  Manage hosts
                </Link>
              ) : null}
              <form action={logout}>
                <button type="submit" className="rounded-lg px-3 py-2 font-semibold underline-offset-4 hover:underline">
                  Sign out{signedInName ? ` (${signedInName.split(" ")[0]})` : ""}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/" className="rounded-lg px-3 py-2 font-semibold underline-offset-4 hover:underline">
                Upcoming events
              </Link>
              <Link href="/login" className="rounded-lg bg-cream/15 px-4 py-2 font-semibold">
                Host sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-sand-deep bg-sand/60">
      <div className="mx-auto max-w-5xl px-5 py-8 text-base leading-relaxed text-ink/85">
        <p className="font-semibold">Mill Valley Village · Marin Villages pilot</p>
        <p className="mt-2">
          SpokeRSVP is a lightweight RSVP, waitlist, and carpool tool. It complements Helpful Village — it is
          not a CRM and it does not match volunteers.
        </p>
        <p className="mt-2">
          Guest names and contact details are visible to the event host. Street addresses on events stay
          private unless the host shares them. This is a local pilot; do not use it for medical, financial, or
          other sensitive records.
        </p>
      </div>
    </footer>
  );
}
