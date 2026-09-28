import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { requireHost } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const host = await requireHost();
  return (
    <>
      <SiteHeader variant="host" hostName={host.name} isAdminUser={isAdmin(host)} />
      {children}
      <SiteFooter />
    </>
  );
}
