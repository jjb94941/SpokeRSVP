import { desc } from "drizzle-orm";
import { Flash } from "@/components/Ui";
import {
  createEventType,
  createWaiver,
  saveWaiverVersion,
  setEventTypeArchived,
  updateEventType,
} from "@/lib/actions/catalog";
import { getDb } from "@/lib/db";
import { eventTypes, waiverSignatures, waiverVersions, waivers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/roles";
import { formatPacificRange } from "@/lib/time";
import { parseStoredAnswers, parseStoredFields, type WaiverField } from "@/lib/waivers";

export default async function EventTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin("Only super-administrators can manage event types and waivers.");
  const params = await searchParams;
  const db = await getDb();
  const types = (await db.select().from(eventTypes).all()).sort((a, b) => a.name.localeCompare(b.name));
  const waiverRows = (await db.select().from(waivers).all()).sort((a, b) => a.title.localeCompare(b.title));
  const versions = await db.select().from(waiverVersions).all();
  const signatures = (await db.select().from(waiverSignatures).orderBy(desc(waiverSignatures.signedAt)).all());
  const latestByWaiver = new Map<string, (typeof versions)[number]>();
  for (const version of versions) {
    const current = latestByWaiver.get(version.waiverId);
    if (!current || version.version > current.version) latestByWaiver.set(version.waiverId, version);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <p className="text-lg font-semibold tracking-wide text-teal">Super-administrator</p>
      <h1 className="font-display mt-2 text-4xl leading-tight font-semibold">Event types and waivers</h1>
      <p className="mt-3 max-w-3xl text-[17px] text-ink">
        Every event has one type. A type can have one waiver. Neighbors sign the current version before they
        register, including when the event is full. Changing the waiver text or its questions starts a new version.
        Old signatures stay on record, and people already signed up are not removed. A waiver can have up to four
        questions.
      </p>
      <Flash ok={params.ok} error={params.error} />

      <section className="mt-8">
        <h2 className="font-display text-[28px] font-bold">Add an event type</h2>
        <form action={createEventType} className="card mt-4 max-w-2xl">
          <label htmlFor="type-name" className="mb-2 block text-[17px] font-bold text-ink">
            Name
          </label>
          <input
            id="type-name"
            name="name"
            required
            minLength={2}
            placeholder="Walk/Hike"
            className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
          />
          <label htmlFor="type-waiver" className="mb-2 mt-4 block text-[17px] font-bold text-ink">
            Waiver
          </label>
          <select
            id="type-waiver"
            name="waiverId"
            className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
            defaultValue=""
          >
            <option value="">No waiver</option>
            {waiverRows.map((waiver) => (
              <option key={waiver.id} value={waiver.id}>
                {waiver.title}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary mt-4">
            Add event type
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[28px] font-bold">Event types</h2>
        <ul className="mt-4 grid gap-[14px]">
          {types.map((type) => {
            const attached = waiverRows.find((waiver) => waiver.id === type.waiverId);
            return (
              <li key={type.id} className="card">
                <p className="status-line">{type.archived ? "Archived" : "Available to hosts"}</p>
                <form action={updateEventType} className="mt-3">
                  <input type="hidden" name="id" value={type.id} />
                  <label htmlFor={`name-${type.id}`} className="mb-2 block text-[17px] font-bold text-ink">
                    Name
                  </label>
                  <input
                    id={`name-${type.id}`}
                    name="name"
                    required
                    defaultValue={type.name}
                    className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                  />
                  <label htmlFor={`waiver-${type.id}`} className="mb-2 mt-4 block text-[17px] font-bold text-ink">
                    Waiver
                  </label>
                  <select
                    id={`waiver-${type.id}`}
                    name="waiverId"
                    defaultValue={type.waiverId || ""}
                    className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                  >
                    <option value="">No waiver</option>
                    {waiverRows.map((waiver) => (
                      <option key={waiver.id} value={waiver.id}>
                        {waiver.title}
                      </option>
                    ))}
                  </select>
                  <p className="meta-line mt-2">
                    {attached ? `Neighbors sign ${attached.title}.` : "No waiver. Neighbors can register directly."}
                  </p>
                  <button type="submit" className="btn-secondary mt-4">
                    Save {type.name}
                  </button>
                </form>
                <form action={setEventTypeArchived} className="mt-3">
                  <input type="hidden" name="id" value={type.id} />
                  <input type="hidden" name="archived" value={type.archived ? "no" : "yes"} />
                  <button type="submit" className="btn-secondary">
                    {type.archived ? `Restore ${type.name}` : `Archive ${type.name}`}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[28px] font-bold">Add a waiver</h2>
        <form action={createWaiver} className="card mt-4">
          <label htmlFor="waiver-title" className="mb-2 block text-[17px] font-bold text-ink">
            Title
          </label>
          <input
            id="waiver-title"
            name="title"
            required
            minLength={3}
            className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
          />
          <label htmlFor="waiver-body" className="mb-2 mt-4 block text-[17px] font-bold text-ink">
            Waiver text
          </label>
          <textarea
            id="waiver-body"
            name="body"
            required
            minLength={40}
            rows={8}
            className="w-full rounded-[14px] border-2 border-card-border bg-white px-4 py-3 text-[17px] leading-relaxed text-ink"
          />
          <WaiverFieldInputs prefix="new" fields={[]} />
          <button type="submit" className="btn-secondary mt-4">
            Create waiver
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[28px] font-bold">Waiver versions and signatures</h2>
        <ul className="mt-4 grid gap-[14px]">
          {waiverRows.map((waiver) => {
            const current = latestByWaiver.get(waiver.id);
            const history = versions
              .filter((version) => version.waiverId === waiver.id)
              .sort((a, b) => b.version - a.version);
            const signed = signatures.filter((row) => row.waiverId === waiver.id);
            return (
              <li key={waiver.id} className="card">
                <p className="status-line">Current version {current?.version ?? "—"}</p>
                <h3 className="font-display mt-1 text-[24px] font-bold">{waiver.title}</h3>
                <form action={saveWaiverVersion} className="mt-4">
                  <input type="hidden" name="waiverId" value={waiver.id} />
                  <label htmlFor={`edit-title-${waiver.id}`} className="mb-2 block text-[17px] font-bold text-ink">
                    Title
                  </label>
                  <input
                    id={`edit-title-${waiver.id}`}
                    name="title"
                    required
                    defaultValue={current?.title || waiver.title}
                    className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
                  />
                  <label htmlFor={`edit-body-${waiver.id}`} className="mb-2 mt-4 block text-[17px] font-bold text-ink">
                    Text for the next version
                  </label>
                  <textarea
                    id={`edit-body-${waiver.id}`}
                    name="body"
                    required
                    rows={8}
                    defaultValue={current?.body || ""}
                    className="w-full rounded-[14px] border-2 border-card-border bg-white px-4 py-3 text-[17px] leading-relaxed text-ink"
                  />
                  <WaiverFieldInputs prefix={waiver.id} fields={parseStoredFields(current?.fieldsJson)} />
                  <button type="submit" className="btn-secondary mt-4">
                    Save new version of {waiver.title}
                  </button>
                </form>
                <h4 className="mt-6 text-[17px] font-bold text-ink">Who signed</h4>
                {signed.length === 0 ? (
                  <p className="mt-2 text-[17px] text-ink">No signatures yet.</p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {signed.map((row) => (
                      <li key={row.id} className="inset-row text-[17px] text-ink">
                        <span className="font-bold">{row.signerName}</span> · {row.email} · version {row.version} ·{" "}
                        {formatPacificRange(row.signedAt.getTime())}
                        <WaiverAnswerList answers={parseStoredAnswers(row.answersJson)} />
                      </li>
                    ))}
                  </ul>
                )}
                {history.length > 1 ? (
                  <p className="meta-line mt-3">
                    Older versions kept: {history.map((version) => `v${version.version}`).join(", ")}.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

function WaiverFieldInputs({ prefix, fields }: { prefix: string; fields: WaiverField[] }) {
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-[17px] font-bold text-ink">Questions (up to 4)</p>
      {[0, 1, 2, 3].map((index) => {
        const field = fields[index];
        return (
          <fieldset key={`${prefix}-${index}`} className="rounded-[14px] border-2 border-card-border p-4">
            <legend className="px-2 text-[17px] font-bold text-ink">Question {index + 1}</legend>
            <input type="hidden" name={`fieldId${index}`} value={field?.id || ""} />
            <label htmlFor={`${prefix}-label-${index}`} className="mb-2 block text-[17px] font-bold text-ink">
              Label
            </label>
            <input
              id={`${prefix}-label-${index}`}
              name={`fieldLabel${index}`}
              defaultValue={field?.label || ""}
              className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
            />
            <label htmlFor={`${prefix}-help-${index}`} className="mb-2 mt-4 block text-[17px] font-bold text-ink">
              Help text (optional)
            </label>
            <input
              id={`${prefix}-help-${index}`}
              name={`fieldHelp${index}`}
              defaultValue={field?.help || ""}
              className="w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink"
            />
            <label className="mt-4 flex min-h-14 items-center gap-3 text-[17px] font-bold text-ink">
              <input type="checkbox" name={`fieldRequired${index}`} defaultChecked={field?.required} className="h-6 w-6 accent-teal" />
              Required
            </label>
            <label className="flex min-h-14 items-center gap-3 text-[17px] font-bold text-ink">
              <input type="checkbox" name={`fieldMultiline${index}`} defaultChecked={field?.multiline} className="h-6 w-6 accent-teal" />
              Larger text box
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}

function WaiverAnswerList({ answers }: { answers: { label: string; value: string }[] }) {
  if (answers.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-1">
      {answers.map((answer) => (
        <li key={answer.label}>
          <span className="font-bold">{answer.label}:</span> {answer.value || "Not answered"}
        </li>
      ))}
    </ul>
  );
}
