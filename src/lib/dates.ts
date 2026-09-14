/** Values Turso / @libsql/client may return for Drizzle `timestamp_ms` columns. */
export type InstantLike = Date | number | string | bigint;

function isBlank(value: unknown): boolean {
  return value == null || value === "";
}

/**
 * Coerce a Drizzle/libsql timestamp into a Date.
 *
 * `integer(..., { mode: "timestamp_ms" })` is typed as `Date`, but the LibSQL
 * HTTP driver often yields a number, numeric string, or bigint instead. Calling
 * `.getTime()` on those values crashes the host dashboard after login.
 */
export function toDate(value: InstantLike): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("Invalid date.");
    }
    return value;
  }
  if (typeof value === "bigint") {
    return toDate(Number(value));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Invalid date.");
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError("Invalid date.");
    }
    return date;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError("Invalid date.");
  }
  if (/^-?\d+$/.test(trimmed)) {
    return toDate(Number(trimmed));
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid date.");
  }
  return date;
}

export function toOptionalDate(value: InstantLike | null | undefined): Date | null {
  if (isBlank(value)) return null;
  return toDate(value as InstantLike);
}

export function toDateMs(value: InstantLike): number {
  return toDate(value).getTime();
}

export function toOptionalDateMs(value: InstantLike | null | undefined): number | null {
  const date = toOptionalDate(value);
  return date ? date.getTime() : null;
}

/** True on Vercel (always HTTPS) and any production Node build. */
export function isSecureSessionCookie(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    return true;
  }
  return env.NODE_ENV === "production";
}
