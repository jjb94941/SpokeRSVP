import { loginWithPassword, requestMagicLink } from "@/lib/actions/auth";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Field, Flash, inputClass } from "@/components/Ui";
import { getCurrentHost } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; devLink?: string }>;
}) {
  const host = await getCurrentHost();
  if (host) redirect("/host");
  const params = await searchParams;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
        <h1 className="font-display text-4xl">Host sign in</h1>
        <p className="mt-3 text-lg">
          For village chairs and event hosts. Guests RSVP from the event link — they do not need an
          account.
        </p>
        <Flash error={params.error} ok={params.sent ? "Check your email for a sign-in link." : undefined} />
        {params.devLink ? (
          <p className="mb-6 rounded-2xl border-2 border-teal bg-teal/10 px-4 py-3 text-lg">
            Email sending is in stub mode (no <code>RESEND_API_KEY</code>). Open this magic link:{" "}
            <a href={params.devLink} className="font-semibold break-all text-teal underline">
              {params.devLink}
            </a>
          </p>
        ) : null}

        <section className="card mb-6 border-2 border-terracotta/40">
          <h2 className="text-xl font-bold">Local / development demo hosts</h2>
          <p className="mt-2 text-base">
            These accounts are seeded for trying the app on your computer. Do not use these credentials on a
            public website.
          </p>
          <p className="mt-3 text-lg">
            Administrator: <strong>chair@millvalleyvillage.org</strong> / <strong>millvalley</strong>
            <br />
            Sub-administrator: <strong>volunteer@millvalleyvillage.org</strong> / <strong>millvalley</strong>
          </p>
        </section>

        <form action={loginWithPassword} className="card mb-6">
          <h2 className="font-display mb-4 text-2xl">Email and password</h2>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className={inputClass}
              defaultValue="chair@millvalleyvillage.org"
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </Field>
          <button type="submit" className="btn-primary">
            Sign in with password
          </button>
        </form>

        <form action={requestMagicLink} className="card">
          <h2 className="font-display mb-4 text-2xl">Or email me a sign-in link</h2>
          <p className="mb-4 text-base">
            The link expires in 30 minutes. Without a Resend API key, the link is shown on this page
            instead of being emailed.
          </p>
          <Field label="Email" htmlFor="magic-email">
            <input
              id="magic-email"
              name="email"
              type="email"
              required
              className={inputClass}
              defaultValue="chair@millvalleyvillage.org"
            />
          </Field>
          <button type="submit" className="btn-teal">
            Send magic link
          </button>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
