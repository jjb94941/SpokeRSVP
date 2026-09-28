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
      <label htmlFor={htmlFor} className="mb-1 block text-[17px] font-bold text-ink">
        {label}
      </label>
      {hint ? <p className="meta-line mb-2">{hint}</p> : null}
      {children}
    </div>
  );
}

export const inputClass =
  "w-full min-h-14 rounded-[14px] border-2 border-card-border bg-white px-4 text-[17px] text-ink placeholder:text-muted";

export const btnPrimary = "btn-primary";

export const btnTeal = "btn-teal";

export const btnSecondary = "btn-secondary";
