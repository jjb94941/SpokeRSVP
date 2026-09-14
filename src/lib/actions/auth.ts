"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  appUrl,
  consumeMagicLink,
  createMagicLink,
  createSession,
  destroySession,
  findHostByEmail,
  verifyHostPassword,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hosts } from "@/lib/db/schema";
import { magicLinkText, sendEmail } from "@/lib/notify";

function formString(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

export async function loginWithPassword(formData: FormData) {
  const email = formString(formData, "email");
  const password = formString(formData, "password");
  const host = await findHostByEmail(email);
  if (!host || !password || !verifyHostPassword(host, password)) {
    redirect("/login?error=" + encodeURIComponent("That email or password did not match."));
  }
  await createSession(host.id);
  redirect("/host");
}

export async function requestMagicLink(formData: FormData) {
  const email = formString(formData, "email");
  const host = await findHostByEmail(email);
  if (!host) {
    redirect(
      "/login?error=" +
        encodeURIComponent("No host account uses that email. For this pilot, use the demo chair login."),
    );
  }
  const { token } = await createMagicLink(host.email);
  const url = `${await appUrl()}/login/magic?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: host.email,
    subject: "Your SpokeRSVP sign-in link",
    text: magicLinkText({ url }),
  });
  if (result.stubbed) {
    redirect(`/login?sent=1&devLink=${encodeURIComponent(url)}`);
  }
  redirect("/login?sent=1");
}

export async function completeMagicLogin(token: string) {
  const email = await consumeMagicLink(token);
  if (!email) {
    redirect("/login?error=" + encodeURIComponent("That sign-in link is invalid or has expired."));
  }
  const db = await getDb();
  const host = await db.select().from(hosts).where(eq(hosts.email, email)).get();
  if (!host) {
    redirect("/login?error=" + encodeURIComponent("No host account uses that email."));
  }
  await createSession(host.id);
  redirect("/host");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
