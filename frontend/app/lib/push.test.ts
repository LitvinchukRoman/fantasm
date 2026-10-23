import { describe, expect, it } from "vitest";
import { vapidKeyBytes } from "./push";

describe("vapid key", () => {
  it("decodes unpadded url-safe base64", () => {
    expect(Array.from(vapidKeyBytes("AQ"))).toEqual([1]);
    expect(Array.from(vapidKeyBytes("AAH_"))).toEqual([0, 1, 255]);
  });
});
