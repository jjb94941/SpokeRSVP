import Link from "next/link";
import { requireHost } from "@/lib/auth";
import { listOutboxForHost } from "@/lib/invitations";
import { formatPacificRange } from "@/lib/time";

export default async function OutboxPage() {
  const host = await requireHost();
  const messages = await listOutboxForHost(host);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <p className="mb-4">
        <Link href="/host" className="text-[17px] font-bold text-teal underline">
          Back to all village events
        </Link>
      </p>
      <h1 className="font-display text-[32px] leading-tight font-bold">Outbox</h1>
      <p className="mt-3 text-[17px] text-ink">
        This pilot does not send real email. Each message is saved here and written to the server log. A village host
        sees invitations for their own village. A super-administrator sees every message.
      </p>
      {messages.length === 0 ? (
        <p className="card mt-6 text-[17px] text-ink">No messages yet. Send an invitation from an event dashboard.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {messages.map((message) => (
            <li key={message.id} className="card">
              <p className="status-line">{message.provider === "outbox" ? "Saved locally" : `Sent with ${message.provider}`}</p>
              <p className="mt-2 text-[17px] text-ink">
                <span className="font-bold">To:</span> {message.toEmail}
              </p>
              <p className="text-[17px] text-ink">
                <span className="font-bold">Subject:</span> {message.subject}
              </p>
              <p className="meta-line mt-1">{formatPacificRange(message.createdAt.getTime())}</p>
              {message.htmlBody ? (
                <div
                  className="mt-4 overflow-hidden rounded-[14px] border-2 border-card-border"
                  dangerouslySetInnerHTML={{ __html: message.htmlBody }}
                />
              ) : (
                <pre className="mt-4 whitespace-pre-wrap rounded-[14px] border-2 border-card-border bg-white p-4 text-[17px] leading-relaxed text-ink">
                  {message.textBody}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
