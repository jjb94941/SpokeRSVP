/**
 * Product version shown in site chrome.
 *
 * Bump `number` and `releaseDate` together on every release:
 * - XX (major) for new capabilities
 * - YY (minor) for smaller changes and bug fixes
 *
 * The visible footer string is always `Ver. XX.YY · Month D, YYYY` — never the
 * version number alone.
 */
export const APP_VERSION = {
  number: "2.0",
  /** ISO calendar date of this release (UTC). */
  releaseDate: "2026-09-15",
} as const;

export function formatReleaseDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid APP_VERSION.releaseDate: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid APP_VERSION.releaseDate: ${isoDate}`);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Elder-friendly label used in the footer on every page. */
export function appVersionLabel(): string {
  return `Ver. ${APP_VERSION.number} · ${formatReleaseDate(APP_VERSION.releaseDate)}`;
}
