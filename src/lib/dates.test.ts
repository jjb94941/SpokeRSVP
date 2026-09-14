import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isSecureSessionCookie, toDate, toDateMs, toOptionalDateMs } from "./dates";
import { formatPacificRange, utcToPacificParts } from "./time";

const START_MS = Date.UTC(2026, 8, 16, 17, 0, 0); // 10:00 PT
const END_MS = Date.UTC(2026, 8, 16, 19, 0, 0); // 12:00 PT

describe("toDate / timestamp_ms coercion", () => {
  test("accepts Date, number, numeric string, and bigint", () => {
    assert.equal(toDateMs(new Date(START_MS)), START_MS);
    assert.equal(toDateMs(START_MS), START_MS);
    assert.equal(toDateMs(String(START_MS)), START_MS);
    assert.equal(toDateMs(BigInt(START_MS)), START_MS);
  });

  test("toOptionalDateMs treats nullish as null", () => {
    assert.equal(toOptionalDateMs(null), null);
    assert.equal(toOptionalDateMs(undefined), null);
    assert.equal(toOptionalDateMs(""), null);
    assert.equal(toOptionalDateMs(END_MS), END_MS);
  });
});

describe("host dashboard timestamp regression", () => {
  test("formats an event whose startsAt is a number, not a Date", () => {
    const event = { startsAt: START_MS, endsAt: END_MS };
    const label = formatPacificRange(event.startsAt, event.endsAt);
    assert.equal(label.includes("September 16, 2026"), true);
    assert.equal(label.includes("10:00"), true);
    assert.equal(label.includes("12:00"), true);
    assert.equal(utcToPacificParts(event.startsAt).date, "2026-09-16");
    assert.equal(utcToPacificParts(event.startsAt).time, "10:00");
  });

  test("sorts mixed Date and number startsAt without throwing", () => {
    const rows = [
      { status: "published" as const, startsAt: new Date(END_MS) },
      { status: "published" as const, startsAt: START_MS },
    ];
    rows.sort((a, b) => toDateMs(a.startsAt) - toDateMs(b.startsAt));
    assert.equal(toDateMs(rows[0]!.startsAt), START_MS);
  });

  test("session expiry check works when expiresAt is a number", () => {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    assert.equal(toDateMs(expiresAt) < Date.now(), false);
    assert.equal(toDateMs(Date.now() - 1000) < Date.now(), true);
  });
});

describe("session cookie secure flag", () => {
  test("is secure on Vercel and production Node", () => {
    assert.equal(isSecureSessionCookie({ NODE_ENV: "production" }), true);
    assert.equal(isSecureSessionCookie({ NODE_ENV: "development" }), false);
    assert.equal(isSecureSessionCookie({ NODE_ENV: "development", VERCEL: "1" }), true);
    assert.equal(isSecureSessionCookie({ NODE_ENV: "development", VERCEL_ENV: "preview" }), true);
  });
});

describe("toDate invalid values", () => {
  test("rejects NaN and unparsable strings", () => {
    assert.throws(() => toDate(Number.NaN));
    assert.throws(() => toDate("not-a-date"));
    assert.equal(toDate("2026-09-16T17:00:00.000Z").getTime(), START_MS);
  });
});
