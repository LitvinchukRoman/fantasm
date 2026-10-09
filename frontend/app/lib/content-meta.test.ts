import { describe, expect, it } from "vitest";
import { compactToc, type TocItem } from "./content-meta";

const item = (n: number, depth: 2 | 3 = 2): TocItem => ({ depth, text: `Розділ ${n}`, id: `rozdil-${n}` });

describe("compactToc", () => {
  it("hides third-level headings", () => {
    const items = [item(1), item(2, 3), item(3), item(4, 3)];
    expect(compactToc(items).map((i) => i.id)).toEqual(["rozdil-1", "rozdil-3"]);
  });

  it("keeps a short list as is", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(i + 1));
    expect(compactToc(items)).toEqual(items);
  });

  it("caps a long list at the limit and keeps the last section", () => {
    const items = Array.from({ length: 15 }, (_, i) => item(i + 1));
    const out = compactToc(items);
    expect(out).toHaveLength(8);
    expect(out.slice(0, 7).map((i) => i.id)).toEqual(items.slice(0, 7).map((i) => i.id));
    expect(out[7].id).toBe("rozdil-15");
  });
});
