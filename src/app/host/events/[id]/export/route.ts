import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentHost } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { toDate } from "@/lib/dates";
import { csvEscape, formatPhoneDisplay } from "@/lib/format";
import { listRsvps } from "@/lib/rsvp-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const host = await getCurrentHost();
  if (!host) {
    return NextResponse.redirect(new URL("/login", _request.url));
  }
  const { id } = await context.params;
  const db = await getDb();
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.hostId, host.id)))
    .get();
  if (!event) return new NextResponse("Not found", { status: 404 });

  const rows = await listRsvps(event.id);
  const header = ["Name", "Email", "Phone", "Status", "Carpool", "Seats", "Ride note", "RSVP updated"];
  const lines = [
    header.join(","),
    ...rows.map(({ rsvp, carpool }) =>
      [
        csvEscape(rsvp.guestName),
        csvEscape(rsvp.email),
        csvEscape(rsvp.phone ? formatPhoneDisplay(rsvp.phone) : ""),
        csvEscape(rsvp.status),
        csvEscape(carpool?.role === "offer" ? "offer" : carpool?.role === "need" ? "need" : ""),
        csvEscape(carpool?.seats),
        csvEscape(carpool?.note),
        csvEscape(toDate(rsvp.updatedAt).toISOString()),
      ].join(","),
    ),
  ];
  const filename = `${event.title.replace(/[^\w]+/g, "-").toLowerCase()}-rsvps.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
