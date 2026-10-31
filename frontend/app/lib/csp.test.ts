import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";
import { supportOrigin } from "./support/client";

const directives = (policy: string) =>
  new Map(policy.split("; ").map((part) => {
    const [name, ...values] = part.split(" ");
    return [name, values] as const;
  }));

describe("content security policy", () => {
  it("allows inline scripts only by the request nonce", () => {
    const script = directives(contentSecurityPolicy("abc123=="))
      .get("script-src");
    expect(script).toContain("'nonce-abc123=='");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("forbids framing, plugins and base rewriting", () => {
    const policy = directives(contentSecurityPolicy("n"));
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
  });

  it("lets the browser reach a support bot on its own host and nothing else new", () => {
    const own = directives(contentSecurityPolicy("n", null)).get("connect-src") ?? [];
    const withBot = directives(contentSecurityPolicy("n", "https://support.example.com")).get("connect-src") ?? [];
    expect(own).not.toContain("https://support.example.com");
    expect(withBot).toEqual(["'self'", "https://support.example.com", ...own.slice(1)]);
  });
});

describe("support origin", () => {
  it("is null for the same-origin default and the bot's origin for an absolute URL", () => {
    expect(supportOrigin("/api/support")).toBeNull();
    expect(supportOrigin("https://support.example.com/api/support")).toBe("https://support.example.com");
    expect(supportOrigin("javascript:alert(1)")).toBeNull();
  });
});
