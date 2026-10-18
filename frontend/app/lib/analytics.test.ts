import { describe, expect, it } from "vitest";
import { buildBatch, pageViewProps, shouldTrackPath } from "./analytics";
import { composeChart, niceScale } from "./chart-scale";

describe("analytics beacon", () => {
  it("keeps the referrer host only on the first view and only when it is another site", () => {
    const first = pageViewProps({
      path: "/ideas", search: "?utm_source=telegram&x=1", host: "ideas.naukma.com",
      referrer: "https://t.me/fantasm", first: true,
    });
    expect(first).toEqual({
      name: "page_view", path: "/ideas",
      props: { referrer: "t.me", utm_source: "telegram" },
    });
    const later = pageViewProps({ path: "/ideas/x", search: "?utm_source=telegram", host: "ideas.naukma.com", referrer: "https://t.me/fantasm", first: false });
    expect(later.props).toEqual({});
  });

  it("does not count the operator walking the admin", () => {
    expect(shouldTrackPath("/admin")).toBe(false);
    expect(shouldTrackPath("/admin/users")).toBe(false);
    expect(shouldTrackPath("/moderation")).toBe(false);
    expect(shouldTrackPath("/ideas")).toBe(true);
  });

  it("sends at most ten events", () => {
    const body = JSON.parse(buildBatch(Array.from({ length: 12 }, (_, i) => ({ name: "page_view" as const, path: `/${i}` }))));
    expect(body.events).toHaveLength(10);
  });
});

describe("chart scale", () => {
  it("rounds the axis up to a readable step and includes zero", () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceScale(370).ticks).toEqual([0, 200, 400]);
    expect(niceScale(12).ticks).toEqual([0, 5, 10, 15]);
    expect(niceScale(2, 2).ticks).toEqual([0, 1, 2]);
  });

  it("keeps several series, drops the rest, and sums only the chosen ones", () => {
    const series = [
      { name: "Ідеї", color: "#111", points: [{ day: "2026-10-01", value: 2 }, { day: "2026-10-02", value: 3 }] },
      { name: "Голоси", color: "#222", points: [{ day: "2026-10-01", value: 5 }, { day: "2026-10-02", value: 1 }] },
      { name: "Пости", color: "#333", points: [{ day: "2026-10-01", value: 4 }, { day: "2026-10-02", value: 4 }] },
    ];
    expect(composeChart(series, ["Ідеї", "Пости"], "split").map((item) => item.name)).toEqual(["Ідеї", "Пости"]);
    expect(composeChart(series, ["Ідеї", "Голоси"], "sum")[0].points).toEqual([
      { day: "2026-10-01", value: 7 },
      { day: "2026-10-02", value: 4 },
    ]);
    expect(composeChart(series, [], "stack")).toEqual([]);
  });
});
