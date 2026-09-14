import { completeMagicLogin } from "@/lib/actions/auth";
import { redirect } from "next/navigation";

export default async function MagicLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/login?error=" + encodeURIComponent("Missing sign-in link."));
  await completeMagicLogin(token);
  return null;
}
