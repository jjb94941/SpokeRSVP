import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { requireHost } from "@/lib/auth";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const host = await requireHost();
  return (
    <>
      <SiteHeader variant="host" hostName={host.name} />
      {children}
      <SiteFooter />
    </>
  );
}
