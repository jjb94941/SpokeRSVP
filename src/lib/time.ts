const PACIFIC = "America/Los_Angeles";

function tzWallAsUtcMs(instantMs: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]),
  );
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

/** Convert a Pacific wall-clock date+time to a UTC Date. */
export function pacificWallToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error("Enter a valid date and time.");
  }
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  utc -= tzWallAsUtcMs(utc, PACIFIC) - utc;
  const drift = tzWallAsUtcMs(utc, PACIFIC) - Date.UTC(year, month - 1, day, hour, minute, 0);
  if (drift !== 0) utc -= drift;
  return new Date(utc);
}

export function utcToPacificParts(ms: number): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function formatPacific(ms: number, withTime = true): string {
  const date = new Date(ms);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  if (!withTime) return datePart;
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${datePart} at ${timePart} PT`;
}

export function formatPacificRange(startsAt: number, endsAt?: number | null): string {
  const start = formatPacific(startsAt);
  if (!endsAt) return start;
  const startParts = utcToPacificParts(startsAt);
  const endParts = utcToPacificParts(endsAt);
  const endTime = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(endsAt));
  if (startParts.date === endParts.date) {
    return `${formatPacific(startsAt).replace(/ at .+$/, "")} from ${
      new Intl.DateTimeFormat("en-US", {
        timeZone: PACIFIC,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(startsAt))
    } to ${endTime} PT`;
  }
  return `${start} – ${formatPacific(endsAt)}`;
}
