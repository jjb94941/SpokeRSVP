import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

async function authorize(request: Request) {
  const secret = process.env.REMINDER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
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
  return null;
}

async function run(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const result = await sendDueReminders();
  return NextResponse.json(result);
}

/** Vercel Cron invokes GET. Local / generic cron can POST. */
export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
