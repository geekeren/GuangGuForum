import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecentTopics } from "guanggu-forum-api";
import { cacheService } from "../CacheService";
import { resolveCurrentUsername } from "../currentUser";

vi.mock("guanggu-forum-api", () => ({ getRecentTopics: vi.fn() }));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn() } }));

let username: string;
let cookies: Record<string, unknown> | null;
beforeEach(() => {
  vi.clearAllMocks();
  username = "";
  cookies = { sid: { value: "test-session" } };
  vi.mocked(cacheService.get).mockImplementation((key) => key === "current_username" ? username : cookies);
});

describe("current account recovery", () => {
  it("uses an existing account without another request", async () => {
    username = "test-user";
    expect(await resolveCurrentUsername()).toBe("test-user");
    expect(getRecentTopics).not.toHaveBeenCalled();
  });

  it.each([
    { sid: "synthetic-legacy-session" },
    { sid: { value: "synthetic-current-session" } },
  ])("recovers a missing legacy username without rewriting the session %j", async (session) => {
    cookies = session;
    vi.mocked(getRecentTopics).mockImplementationOnce(async () => { username = "restored-user"; return []; });
    expect(await resolveCurrentUsername()).toBe("restored-user");
    expect(cookies).toBe(session);
    expect(getRecentTopics).toHaveBeenCalledWith({ type: "default", page: 1 }, { cache: false });
  });

  it("recovers missing username from a live response, sharing concurrent requests", async () => {
    vi.mocked(getRecentTopics).mockImplementationOnce(async () => { username = "test-user"; return []; });
    const [first, second] = await Promise.all([resolveCurrentUsername(), resolveCurrentUsername()]);
    expect([first, second]).toEqual(["test-user", "test-user"]);
    expect(getRecentTopics).toHaveBeenCalledTimes(1);
    expect(getRecentTopics).toHaveBeenCalledWith({ type: "default", page: 1 }, { cache: false });
  });

  it("does not treat an anonymous cookie as proof of login", async () => {
    vi.mocked(getRecentTopics).mockResolvedValueOnce([]);
    expect(await resolveCurrentUsername()).toBe("");
  });

  it("preserves session and allows retry after network failure", async () => {
    vi.mocked(getRecentTopics).mockRejectedValueOnce(new Error("offline"));
    await expect(resolveCurrentUsername()).rejects.toThrow("offline");
    expect(cookies).not.toBeNull();
    vi.mocked(getRecentTopics).mockImplementationOnce(async () => { username = "test-user"; return []; });
    expect(await resolveCurrentUsername()).toBe("test-user");
  });

  it("does not request account data without any cookies", async () => {
    cookies = null;
    expect(await resolveCurrentUsername()).toBe("");
    expect(getRecentTopics).not.toHaveBeenCalled();
  });
});
