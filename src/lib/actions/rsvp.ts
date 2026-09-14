"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { appUrl, setGuestCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { sendEmail, rsvpConfirmationText } from "@/lib/notify";
import { submitRsvp } from "@/lib/rsvp-service";
import { formatPacificRange } from "@/lib/time";
import type { CarpoolRole } from "@/lib/db/schema";

export async function guestRsvp(formData: FormData) {
  const shareToken = String(formData.get("shareToken") || "");
  const db = await getDb();
  const event = await db.select().from(events).where(eq(events.shareToken, shareToken)).get();
  if (!event) redirect("/");
  if (event.status === "cancelled") {
    redirect(`/e/${shareToken}?error=` + encodeURIComponent("This event has been cancelled."));
  }

  const desired = String(formData.get("status") || "going") === "not_going" ? "not_going" : "going";
  const roleRaw = String(formData.get("carpoolRole") || "none");
  const carpoolRole: CarpoolRole =
    roleRaw === "offer" || roleRaw === "need" || roleRaw === "none" ? roleRaw : "none";

  let rsvp;
  try {
    ({ rsvp } = await submitRsvp(event, {
      guestName: String(formData.get("guestName") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      desiredStatus: desired,
      carpoolRole,
      seats: Number(formData.get("seats") || 0) || null,
      carpoolNote: String(formData.get("carpoolNote") || ""),
      manageToken: String(formData.get("manageToken") || "") || null,
    }));
  } catch (error) {
    redirect(`/e/${shareToken}?error=` + encodeURIComponent((error as Error).message));
  }

  await setGuestCookie(event.id, rsvp.manageToken);
  const origin = await appUrl();
  const manageUrl = `${origin}/e/${event.shareToken}?m=${rsvp.manageToken}`;
  if (rsvp.email) {
    await sendEmail({
      to: rsvp.email,
      subject: `RSVP for ${event.title}`,
      text: rsvpConfirmationText({
        guestName: rsvp.guestName,
        eventTitle: event.title,
        when: formatPacificRange(event.startsAt.getTime(), event.endsAt?.getTime()),
        where: event.locationName,
        status: rsvp.status,
        manageUrl,
      }),
    });
  }
  const thanks =
    rsvp.status === "going"
      ? "You are going. Thank you."
      : rsvp.status === "waitlist"
        ? "This gathering is full, so we put you on the waitlist. We will contact you if a spot opens."
        : "We saved that you are not going.";
  redirect(`/e/${shareToken}?m=${rsvp.manageToken}&ok=` + encodeURIComponent(thanks));
}
