import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

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
});
