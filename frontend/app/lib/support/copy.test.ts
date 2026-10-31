import { describe, expect, it } from "vitest";
import { isInternalPath, promptsFor, SILENT_STAGES, STAGE_LABEL, wasRedacted } from "./copy";
import { STAGES } from "./types";

describe("isInternalPath", () => {
  it.each([
    ["/ideas/x", true],
    ["/campus/yak-znaity-komandu-dlia-proiektu", true],
    ["//evil.com", false],
    ["/\\evil.com", false],
    ["https://evil.com", false],
    ["javascript:alert(1)", false],
    ["ideas", false],
  ])("%s → %s", (to, expected) => {
    expect(isInternalPath(to)).toBe(expected);
  });
});

describe("stage labels", () => {
  it("label every stage except the silent ones", () => {
    for (const stage of STAGES) {
      expect(Boolean(STAGE_LABEL[stage]), stage).toBe(!SILENT_STAGES.includes(stage));
    }
  });
});

describe("promptsFor", () => {
  it("puts the topic from the link first", () => {
    expect(promptsFor("seal")[0].topic).toBe("seal");
    expect(promptsFor("login").map((p) => p.topic)).toEqual(["login", "idea", "seal"]);
  });

  it("falls back to the default order", () => {
    expect(promptsFor(null).map((p) => p.topic)).toEqual(["idea", "seal", "team"]);
    expect(promptsFor("nope")).toHaveLength(3);
  });
});

describe("wasRedacted", () => {
  it("spots placeholders the backend leaves instead of personal data", () => {
    expect(wasRedacted("пиши на [EMAIL]")).toBe(true);
    expect(wasRedacted("Чому моєї ідеї немає в стрічці?")).toBe(false);
  });
});
