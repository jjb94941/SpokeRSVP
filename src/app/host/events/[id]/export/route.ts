import { NextResponse } from "next/server";
import { csvEscape, formatPhoneDisplay } from "@/lib/format";
import { findManagedEvent } from "@/lib/roles";
import { listRsvps } from "@/lib/rsvp-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const managed = await findManagedEvent(id);
  if (!managed) return new NextResponse("Not found", { status: 404 });
  const { event } = managed;

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
        csvEscape(rsvp.updatedAt.toISOString()),
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
