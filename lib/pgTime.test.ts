import { describe, expect, it } from "vitest";
import { pgTimestampToIso } from "./pgTime";

describe("pgTimestampToIso (Postgres timestamp text → one fixed format)", () => {
  it.each([
    ["2026-10-21 03:48:01.004591+00", "2026-10-21T03:48:01.004591Z"],
    ["2026-10-21 03:48:01.0045+00", "2026-10-21T03:48:01.004500Z"], // Postgres drops trailing zeros
    ["2026-10-21 03:48:01+00", "2026-10-21T03:48:01.000000Z"],
    ["2026-10-21 03:48:01.5-04", "2026-10-21T07:48:01.500000Z"], // another zone: moved to UTC
    ["2026-10-21 23:30:00+05:30", "2026-10-21T18:00:00.000000Z"],
    ["2026-10-21 03:48:01.004591", "2026-10-21T03:48:01.004591Z"], // no zone: taken as UTC
    ["2026-10-21", "2026-10-21T00:00:00.000000Z"],
  ])("%s → %s", (pg, iso) => expect(pgTimestampToIso(pg)).toBe(iso));
  it("keeps microseconds, so text order is time order", () => {
    const a = pgTimestampToIso("2026-10-21 03:48:01.004+00");
    const b = pgTimestampToIso("2026-10-21 03:48:01.004591+00");
    expect(a < b).toBe(true);
    expect(pgTimestampToIso("2026-10-21 03:48:01.9+00") < pgTimestampToIso("2026-10-21 03:48:02+00")).toBe(true);
  });
  it("refuses text that isn't a timestamp, rather than guess", () => {
    expect(() => pgTimestampToIso("yesterday")).toThrow();
  });
});
