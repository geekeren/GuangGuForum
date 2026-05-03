import { describe, it, expect } from "vitest";
import { urlPathVaiable, getUrl } from "../urls";

describe("urlPathVaiable", () => {
  it("matches a simple pattern and extracts path variables", () => {
    const matchFn = urlPathVaiable("/t/:tid");
    const result = matchFn("https://www.guozaoke.com/t/123");
    expect(result).not.toBe(false);
    if (result !== false) {
      expect((result as any).params.tid).toBe("123");
    }
  });

  it("matches pattern with multiple variables", () => {
    const matchFn = urlPathVaiable("/node/:node/page/:page");
    const result = matchFn("https://www.guozaoke.com/node/tech/page/2");
    expect(result).not.toBe(false);
    if (result !== false) {
      expect((result as any).params.node).toBe("tech");
      expect((result as any).params.page).toBe("2");
    }
  });

  it("returns false for non-matching URL", () => {
    const matchFn = urlPathVaiable("/t/:tid");
    const result = matchFn("https://www.guozaoke.com/u/alice");
    expect(result).toBe(false);
  });

  it("handles URL without pathname", () => {
    const matchFn = urlPathVaiable("/t/:tid");
    const result = matchFn("https://www.guozaoke.com");
    expect(result).toBe(false);
  });

  it("decodes URI-encoded path variables", () => {
    const matchFn = urlPathVaiable("/u/:username");
    const result = matchFn("https://www.guozaoke.com/u/alice%20smith");
    expect(result).not.toBe(false);
    if (result !== false) {
      expect((result as any).params.username).toBe("alice smith");
    }
  });
});

describe("getUrl", () => {
  it("compiles a simple pattern with one variable", () => {
    const result = getUrl("/t/:tid", { tid: "123" });
    expect(result).toBe("/t/123");
  });

  it("compiles a pattern with multiple variables", () => {
    const result = getUrl("/node/:node/page/:page", { node: "tech", page: "2" });
    expect(result).toBe("/node/tech/page/2");
  });

  it("encodes special characters in variables", () => {
    const result = getUrl("/u/:username", { username: "alice smith" });
    expect(result).toBe("/u/alice%20smith");
  });

  it("compiles pattern with no variables", () => {
    const result = getUrl("/about", {});
    expect(result).toBe("/about");
  });
});
