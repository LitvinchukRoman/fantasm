import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiResponse, getCurrentUser, getIdeas } from "./api.server";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_INTERNAL_URL;
});

describe("server API client", () => {
  it("uses API_INTERNAL_URL and forwards the session cookie", async () => {
    process.env.API_INTERNAL_URL = "http://backend:8080";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api(new Request("https://fantasm.test/ideas", { headers: { cookie: "session=abc" } }), "/api/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend:8080/api/me");
    expect(new Headers(init.headers).get("cookie")).toBe("session=abc");
  });

  it("forwards the visitor address to the internal API only", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const page = () => new Request("https://fantasm.test/ideas", { headers: { "x-forwarded-for": "203.0.113.7" } });

    process.env.API_INTERNAL_URL = "http://backend:8080";
    await api(page(), "/api/ideas");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-forwarded-for")).toBe("203.0.113.7");

    delete process.env.API_INTERNAL_URL;
    await api(page(), "/api/ideas");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("x-forwarded-for")).toBeNull();
  });

  it("treats a missing cookie and API 401 as signed out", async () => {
    expect(await getCurrentUser(new Request("https://fantasm.test/"))).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "signed out", code: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    )));
    expect(await getCurrentUser(new Request("https://fantasm.test/", { headers: { cookie: "session=expired" } }))).toBeNull();
  });

  it("maps feed filters and preserves structured errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: "next" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "invalid cursor",
        code: "validation_failed",
        fields: { cursor: "invalid" },
      }), { status: 422, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await getIdeas(new Request("https://fantasm.test/ideas"), { sort: "top", cursor: "abc", limit: 50 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/ideas?sort=top&cursor=abc&limit=50");
    await expect(api(new Request("https://fantasm.test/"), "/api/fail")).rejects.toMatchObject({
      status: 422,
      body: { code: "validation_failed", fields: { cursor: "invalid" } },
    });
  });

  it("exposes response headers for session-clearing actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 204,
      headers: { "set-cookie": "__Host-fantasm_session=; Max-Age=0; Path=/; Secure; HttpOnly" },
    })));

    const response = await apiResponse(
      new Request("https://fantasm.test/logout", { headers: { cookie: "session=abc" } }),
      "/api/auth/logout",
      { method: "POST" },
    );

    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
