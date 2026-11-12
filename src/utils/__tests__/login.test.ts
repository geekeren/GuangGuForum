import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "node-html-parser";
import { login } from "../../../packages/guanggu-forum-api/src/login/login";
import { request, getCacheService } from "../../../packages/guanggu-forum-api/src/client";

vi.mock("@tarojs/taro", () => ({ default: { showToast: vi.fn() } }));
vi.mock("../../../packages/guanggu-forum-api/src/client", () => ({ request: vi.fn(), getCacheService: vi.fn() }));
vi.mock("../../../packages/guanggu-forum-api/src/login/getLoginXsrfCode", () => ({ getLoginXsrfCode: async () => ({ xsrf_form: "test-xsrf" }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCacheService).mockReturnValue({ get: () => ({ sid: { value: "test-session" } }) } as any);
  vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200 } });
});

describe("login completion", () => {
  it("waits for live account confirmation before completing", async () => {
    let confirm: (value: any) => void;
    const response = new Promise<any>(resolve => { confirm = resolve; });
    vi.mocked(request).mockReturnValueOnce(response);
    let completed = false;
    const pending = login({ email: "test-account", password: "test-password" }).then(() => { completed = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    confirm!({ rawRes: { statusCode: 200 }, body: parse('<div id="navbar5"><div class="navbar-right"><a class="avatar" href="/u/test-user">账号</a></div></div>') });
    await pending;
    expect(completed).toBe(true);
    expect(request).toHaveBeenLastCalledWith("");
  });

  it("rejects anonymous cookies rather than reporting login success", async () => {
    vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200 }, body: parse('<a href="/login">登录</a>') });
    await expect(login({ email: "test-account", password: "test-password" })).rejects.toThrow("登录失败");
  });
});
