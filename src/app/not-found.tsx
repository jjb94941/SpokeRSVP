import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Chrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
        <h1 className="font-display text-4xl">Page not found</h1>
        <p className="mt-4 text-lg">That link may be expired, or the event was removed.</p>
        <Link href="/" className="btn-primary mt-8">
          Back to upcoming events
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
