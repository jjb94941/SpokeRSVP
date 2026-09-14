export function Flash({
  ok,
  error,
}: {
  ok?: string | string[] | undefined;
  error?: string | string[] | undefined;
}) {
  const okText = Array.isArray(ok) ? ok[0] : ok;
  const errorText = Array.isArray(error) ? error[0] : error;
  if (!okText && !errorText) return null;
  return (
    <div className="mb-6 space-y-3">
      {okText ? (
        <p className="rounded-2xl border-2 border-teal bg-teal/10 px-4 py-3 text-lg" role="status">
          {okText}
        </p>
      ) : null}
      {errorText ? (
        <p className="rounded-2xl border-2 border-terracotta bg-terracotta/10 px-4 py-3 text-lg" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="mb-1 block text-lg font-bold">
        {label}
      </label>
      {hint ? <p className="mb-2 text-base text-ink/80">{hint}</p> : null}
      {children}
    </div>
  );
}

export const inputClass =
  "w-full min-h-14 rounded-xl border-2 border-sand-deep bg-white px-4 text-lg text-ink placeholder:text-ink/45";

export const btnPrimary =
  "inline-flex min-h-14 items-center justify-center rounded-xl bg-terracotta px-6 text-lg font-bold text-cream shadow-sm hover:bg-terracotta-dark disabled:opacity-60";

export const btnTeal =
  "inline-flex min-h-14 items-center justify-center rounded-xl bg-teal px-6 text-lg font-bold text-cream shadow-sm hover:bg-teal-dark";

export const btnSecondary =
  "inline-flex min-h-14 items-center justify-center rounded-xl border-2 border-ink/20 bg-white px-6 text-lg font-bold text-ink hover:bg-sand";
