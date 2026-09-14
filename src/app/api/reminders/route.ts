import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.REMINDER_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Set REMINDER_SECRET to enable the HTTP reminder endpoint. Use npm run reminders locally." },
      { status: 401 },
    );
  }
  const header = request.headers.get("authorization") || "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendDueReminders();
  return NextResponse.json(result);
}
