import { parseVillageFilter, villageFilterHref } from "@/lib/villages";

/** Where a member form may send someone after sign-in, sign-out, or cancel. */
export function safeMemberReturnPath(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return "/";
  }
  if (url.origin !== "http://localhost") return "/";
  if (url.pathname === "/my-events") return "/my-events";
  if (url.pathname !== "/") return "/";
  return villageFilterHref(parseVillageFilter(url.searchParams.get("villages") || ""));
}
