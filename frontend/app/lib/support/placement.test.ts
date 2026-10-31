import { describe, expect, it } from "vitest";
import { clampPanelWidth, ideaSlugFrom, isWide, launcherHidden, PANEL_WIDTH } from "./placement";

describe("launcherHidden", () => {
  it.each([
    ["/", false],
    ["/ideas", false],
    ["/ideas/hackathon", false],
    ["/help", true],
    ["/admin", true],
    ["/admin/moderation", true],
    ["/administrator", false],
    ["/moderation", true],
  ])("%s → %s", (path, hidden) => {
    expect(launcherHidden(path)).toBe(hidden);
  });
});

describe("ideaSlugFrom", () => {
  it("reads the idea slug from its page only", () => {
    expect(ideaSlugFrom("/ideas/hackathon")).toBe("hackathon");
    expect(ideaSlugFrom("/ideas/new")).toBeUndefined();
    expect(ideaSlugFrom("/ideas")).toBeUndefined();
    expect(ideaSlugFrom("/ideas/a/b")).toBeUndefined();
  });
});

describe("clampPanelWidth", () => {
  it("keeps the panel between the minimum and the screen", () => {
    expect(clampPanelWidth(200, 1440)).toBe(PANEL_WIDTH.min);
    expect(clampPanelWidth(700, 1440)).toBe(700);
    expect(clampPanelWidth(2000, 1440)).toBe(1392);
  });

  it("never goes below the minimum on a narrow screen", () => {
    expect(clampPanelWidth(900, 420)).toBe(PANEL_WIDTH.min);
  });

  it("calls a panel wide past the midpoint", () => {
    expect(isWide(PANEL_WIDTH.default)).toBe(false);
    expect(isWide(PANEL_WIDTH.wide)).toBe(true);
  });
});
