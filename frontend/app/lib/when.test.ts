import { describe, expect, it } from "vitest";
import { formatPickedWhen, keepAhead, monthGrid, parseWhen, pickedIsFuture } from "./when";

describe("when", () => {
  it("formats a picked slot without seconds", () => {
    expect(formatPickedWhen("2026-10-23T18:15")).toBe("23 жовтня, 18:15");
    expect(parseWhen("2026-10-23T18:15")).toMatchObject({ year: 2026, month: 9, day: 23, hour: 18, minute: 15 });
  });

  it("rejects a slot that is not after now", () => {
    const now = new Date(2026, 9, 23, 18, 0).getTime();
    expect(pickedIsFuture("2026-10-23T18:00", now)).toBe(false);
    expect(pickedIsFuture("2026-10-23T18:15", now)).toBe(true);
  });

  it("moves a past time on the same day to the next quarter hour", () => {
    const now = new Date(2026, 9, 23, 18, 7).getTime();
    expect(keepAhead({ year: 2026, month: 9, day: 23, hour: 18, minute: 0 }, now)).toMatchObject({ hour: 18, minute: 30 });
  });

  it("starts October 2026 on Thursday", () => {
    const cells = monthGrid(2026, 9);
    expect(cells.slice(0, 4)).toEqual([null, null, null, 1]);
  });
});
