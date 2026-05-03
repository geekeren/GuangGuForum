import { describe, it, expect, vi, beforeEach } from "vitest";

const wxNavigateToMock = vi.fn();

vi.mock("@tarojs/taro", () => ({
  default: {},
}));

vi.mock("../renderer", () => ({
  isSkyline: vi.fn(() => false),
}));

// Mock wx global
(globalThis as any).wx = {
  navigateTo: wxNavigateToMock,
};

// Mock getCurrentPages
const mockGetCurrentPages = vi.fn(() => []);
(globalThis as any).getCurrentPages = mockGetCurrentPages;

import { openLoginModal } from "../auth";
import { isSkyline } from "../renderer";

describe("openLoginModal", () => {
  beforeEach(() => {
    wxNavigateToMock.mockReset();
    mockGetCurrentPages.mockReset();
    mockGetCurrentPages.mockReturnValue([]);
  });

  it("navigates to login page with home as default redirect", () => {
    openLoginModal();
    expect(wxNavigateToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/pages/login/index?redirect="),
        routeType: "wx://cupertino-modal",
      }),
    );
    // Default redirect should be /pages/home/index
    const call = wxNavigateToMock.mock.calls[0][0];
    expect(decodeURIComponent(call.url)).toContain("/pages/home/index");
  });

  it("uses provided fromUrl as redirect", () => {
    openLoginModal("/pages/topicDetail/index?tid=123");
    expect(wxNavigateToMock).toHaveBeenCalled();
    const call = wxNavigateToMock.mock.calls[0][0];
    expect(decodeURIComponent(call.url)).toContain("/pages/topicDetail/index?tid=123");
  });

  it("derives redirect from current page when no fromUrl", () => {
    mockGetCurrentPages.mockReturnValue([
      { route: "pages/topicDetail/index", options: { tid: "456" } },
    ]);
    openLoginModal();
    expect(wxNavigateToMock).toHaveBeenCalled();
    const call = wxNavigateToMock.mock.calls[0][0];
    const decoded = decodeURIComponent(call.url);
    expect(decoded).toContain("/pages/topicDetail/index?tid=456");
  });

  it("appends modal=true when isSkyline returns true", () => {
    vi.mocked(isSkyline).mockReturnValue(true);
    openLoginModal("/pages/test");
    const call = wxNavigateToMock.mock.calls[0][0];
    expect(call.url).toContain("&modal=true");
    vi.mocked(isSkyline).mockReturnValue(false);
  });

  it("does not append modal=true when isSkyline returns false", () => {
    vi.mocked(isSkyline).mockReturnValue(false);
    openLoginModal("/pages/test");
    const call = wxNavigateToMock.mock.calls[0][0];
    expect(call.url).not.toContain("&modal=true");
  });

  it("sets routeOptions with semi-transparent background", () => {
    openLoginModal();
    expect(wxNavigateToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routeOptions: { backgroundColor: "#00000066" },
      }),
    );
  });
});
