import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock functions are available during hoisted vi.mock evaluation
const { navigateToMock, setClipboardDataMock, wxNavigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  setClipboardDataMock: vi.fn(),
  wxNavigateToMock: vi.fn(),
}));

vi.mock("@tarojs/taro", () => ({
  default: {
    navigateTo: navigateToMock,
    setClipboardData: setClipboardDataMock,
  },
}));

// Mock wx global
(globalThis as any).wx = {
  navigateTo: wxNavigateToMock,
};

import {
  isUserMentionLink,
  isWhitelistedDomain,
  extractSummaryUrl,
  linkHandler,
} from "../linkHandler";

describe("linkHandler", () => {
  beforeEach(() => {
    navigateToMock.mockReset();
    setClipboardDataMock.mockReset();
    wxNavigateToMock.mockReset();
  });

  // ─── isUserMentionLink ───

  describe("isUserMentionLink", () => {
    it("returns true for /u/username paths", () => {
      expect(isUserMentionLink("/u/alice")).toBe(true);
      expect(isUserMentionLink("/u/bob123")).toBe(true);
    });

    it("returns false for non-user paths", () => {
      expect(isUserMentionLink("/t/123")).toBe(false);
      expect(isUserMentionLink("/node/tech")).toBe(false);
    });

    it("returns false for paths with extra segments after username", () => {
      expect(isUserMentionLink("/u/alice/posts")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isUserMentionLink("")).toBe(false);
    });
  });

  // ─── isWhitelistedDomain ───

  describe("isWhitelistedDomain", () => {
    it("returns true for whitelisted domains", () => {
      expect(isWhitelistedDomain("https://github.com/user/repo")).toBe(true);
      expect(isWhitelistedDomain("https://zhihu.com/question/1")).toBe(true);
      expect(isWhitelistedDomain("https://juejin.cn/post/1")).toBe(true);
      expect(isWhitelistedDomain("https://mp.weixin.qq.com/s/abc")).toBe(true);
    });

    it("returns false for non-whitelisted domains", () => {
      expect(isWhitelistedDomain("https://example.com")).toBe(false);
      expect(isWhitelistedDomain("https://random.org")).toBe(false);
    });

    it("returns false for invalid URLs", () => {
      expect(isWhitelistedDomain("not a url")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isWhitelistedDomain("")).toBe(false);
    });
  });

  // ─── extractSummaryUrl ───

  describe("extractSummaryUrl", () => {
    it("extracts URL from whitelisted summary domain", () => {
      const result = extractSummaryUrl("Check https://github.com/user/repo for details");
      expect(result).toBe("https://github.com/user/repo");
    });

    it("returns null when no summary domain URL found", () => {
      expect(extractSummaryUrl("Check https://example.com")).toBeNull();
    });

    it("returns null when no URL at all", () => {
      expect(extractSummaryUrl("No URLs here")).toBeNull();
    });

    it("strips trailing punctuation from URL", () => {
      const result = extractSummaryUrl("See https://github.com/user/repo).");
      expect(result).toBe("https://github.com/user/repo");
    });

    it("picks first matching summary domain URL", () => {
      const result = extractSummaryUrl(
        "https://zhihu.com/first and https://github.com/second",
      );
      // zhihu.com is also in the whitelist
      expect(result).toBeTruthy();
    });
  });

  // ─── linkHandler (navigation) ───

  describe("linkHandler", () => {
    it("does nothing for empty href", () => {
      linkHandler("");
      expect(navigateToMock).not.toHaveBeenCalled();
    });

    it("navigates to topic detail for guozaoke.com/t/123", () => {
      linkHandler("https://www.guozaoke.com/t/456");
      expect(navigateToMock).toHaveBeenCalledWith({
        url: "/pages/topicDetail/index?tid=456",
      });
    });

    it("navigates to user page for guozaoke.com/u/name", () => {
      linkHandler("https://www.guozaoke.com/u/alice");
      expect(navigateToMock).toHaveBeenCalledWith({
        url: "/pages/user/index?username=alice",
      });
    });

    it("navigates to node page for guozaoke.com/node/tech", () => {
      linkHandler("https://www.guozaoke.com/node/tech");
      expect(navigateToMock).toHaveBeenCalledWith({
        url: "/pages/node/topicList/index?node=tech",
      });
    });

    it("opens webview for guozaoke.com paths that don't match patterns", () => {
      linkHandler("https://www.guozaoke.com/about");
      expect(navigateToMock).toHaveBeenCalledWith({
        url: `/pages/webview/index?url=${encodeURIComponent("https://www.guozaoke.com/about")}`,
      });
    });

    it("opens link preview for non-whitelisted domains", () => {
      linkHandler("https://example.com/page");
      expect(wxNavigateToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `/pages/linkPreview/index?url=${encodeURIComponent("https://example.com/page")}`,
        }),
      );
    });

    it("uses wx.navigateTo for whitelisted domains (summary mode)", () => {
      linkHandler("https://github.com/user/repo");
      expect(wxNavigateToMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `/pages/linkPreview/index?url=${encodeURIComponent("https://github.com/user/repo")}`,
          routeOptions: { height: "75%" },
        }),
      );
    });

    it("falls back to clipboard for invalid URL that cannot be parsed", () => {
      // "http://" causes new URL to throw, triggering the catch block
      // resolveGuozaokeLink returns null, so setClipboardData is called
      linkHandler("http://");
      expect(setClipboardDataMock).toHaveBeenCalledWith({ data: "http://" });
    });

    it("resolves relative guozaoke paths via fallback catch", () => {
      linkHandler("/t/789");
      expect(navigateToMock).toHaveBeenCalledWith({
        url: "/pages/topicDetail/index?tid=789",
      });
    });
  });
});
