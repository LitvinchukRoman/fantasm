import { describe, expect, it } from "vitest";
import { billingDate, isPaidPlan, isTier, money, sponsorsText, usageText } from "./billing";

describe("money", () => {
  it.each([
    [0, "0\u00a0₴"],
    [14900, "149\u00a0₴"],
    [14950, "149,50\u00a0₴"],
    [5, "0,05\u00a0₴"],
    [12345600, "123\u00a0456\u00a0₴"],
  ])("%i → %s", (minor, text) => {
    expect(money(minor)).toBe(text);
  });
});

describe("billingDate", () => {
  const now = new Date(2026, 9, 31);
  it("omits the current year", () => {
    expect(billingDate(new Date(2026, 11, 1, 12).toISOString(), now)).toBe("1 грудня");
  });
  it("shows another year", () => {
    expect(billingDate(new Date(2027, 0, 31, 12).toISOString(), now)).toBe("31 січня 2027");
  });
});

describe("usageText and sponsorsText", () => {
  it("names the limit or its absence", () => {
    expect(usageText(2, 3)).toBe("2 з 3 активних ідей");
    expect(usageText(0, 1)).toBe("0 з 1 активної ідеї");
    expect(usageText(7, null)).toBe("7 активних ідей, без ліміту");
    expect(usageText(1, null)).toBe("1 активна ідея, без ліміту");
    expect(usageText(3, null)).toBe("3 активні ідеї, без ліміту");
  });
  it.each([
    [1, "1 спонсор"],
    [3, "3 спонсори"],
    [5, "5 спонсорів"],
    [11, "11 спонсорів"],
    [12, "12 спонсорів"],
    [21, "21 спонсор"],
    [22, "22 спонсори"],
  ])("%i → %s", (n, text) => {
    expect(sponsorsText(n)).toBe(text);
  });
});

describe("guards", () => {
  it("accept only what the backend accepts", () => {
    expect(isPaidPlan("PLUS")).toBe(true);
    expect(isPaidPlan("FREE")).toBe(false);
    expect(isPaidPlan("plus")).toBe(false);
    expect(isTier("PATRON")).toBe(true);
    expect(isTier("GOLD")).toBe(false);
  });
});
