import { describe, expect, it } from "vitest";
import { toIdeaCard, toIdeaView, viewerCampuses } from "./ideas";

const card = {
  slug: "typed-api",
  title: "Typed API",
  category: "PROJECT" as const,
  status: "OPEN" as const,
  visibility: "PUBLIC" as const,
  author: { handle: "roman", name: "Roman" },
  createdAt: "2026-10-08T00:00:00Z",
};

describe("idea adapters", () => {
  it("supplies stable UI defaults for optional API fields", () => {
    expect(toIdeaCard(card)).toMatchObject({
      summary: "",
      story: "",
      votes: 0,
      comments: 0,
      participants: 0,
      tags: [],
    });
  });

  it("maps the API toc level to the existing component depth", () => {
    expect(toIdeaView({ ...card, toc: [{ id: "part", text: "Part", level: 2 }] }).toc)
      .toEqual([{ id: "part", text: "Part", depth: 2 }]);
  });
});

describe("viewerCampuses", () => {
  it("gives no campus filter to a user outside any university", () => {
    expect(viewerCampuses(null)).toEqual([]);
    expect(viewerCampuses({ memberships: [] })).toEqual([]);
  });

  it("offers only the viewer's own universities", () => {
    expect(viewerCampuses({ memberships: [{ organizationId: "naukma", name: "НаУКМА" }] }))
      .toEqual([{ id: "naukma", label: "Могилянка" }]);
    expect(viewerCampuses({ memberships: [{ organizationId: "kpi", name: "КПІ" }] }))
      .toEqual([{ id: "kpi", label: "КПІ" }]);
  });
});
