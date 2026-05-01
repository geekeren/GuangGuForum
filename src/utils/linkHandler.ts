import Taro from "@tarojs/taro";

const GUOZAOKE_HOSTS = ["www.guozaoke.com", "guozaoke.com"];

type WhitelistEntry = {
  mode: "webview" | "summary";
};

const DOMAIN_WHITELIST: Record<string, WhitelistEntry> = {
  "github.com": { mode: "webview" },
  "twitter.com": { mode: "summary" },
  "x.com": { mode: "summary" },
  "youtube.com": { mode: "summary" },
  "bilibili.com": { mode: "summary" },
  "www.bilibili.com": { mode: "summary" },
  "zhihu.com": { mode: "webview" },
  "www.zhihu.com": { mode: "webview" },
  "juejin.cn": { mode: "webview" },
  "segmentfault.com": { mode: "webview" },
  "www.segmentfault.com": { mode: "webview" },
  "mp.weixin.qq.com": { mode: "summary" },
};

function resolveGuozaokeLink(pathname: string): string | null {
  const topicMatch = pathname.match(/^\/t\/(\d+)/);
  if (topicMatch) return `/pages/topicDetail/index?tid=${topicMatch[1]}`;

  const userMatch = pathname.match(/^\/u\/([^/]+)/);
  if (userMatch) return `/pages/user/index?username=${userMatch[1]}`;

  const nodeMatch = pathname.match(/^\/node\/([^/]+)/);
  if (nodeMatch) return `/pages/node/topicList/index?node=${nodeMatch[1]}`;

  return null;
}

export function linkHandler(href: string) {
  if (!href) return;

  try {
    const parsed = new URL(href, "https://www.guozaoke.com");

    if (GUOZAOKE_HOSTS.includes(parsed.hostname)) {
      const miniPath = resolveGuozaokeLink(parsed.pathname);
      if (miniPath) {
        Taro.navigateTo({ url: miniPath });
        return;
      }
    }

    const entry = DOMAIN_WHITELIST[parsed.hostname];
    if (entry?.mode === "webview") {
      Taro.navigateTo({
        url: `/pages/webview/index?url=${encodeURIComponent(href)}`,
      });
    } else {
      wx.navigateTo({
        url: `/pages/linkPreview/index?url=${encodeURIComponent(href)}`,
        routeType: "wx://bottom-sheet",
      });
    }
  } catch {
    const miniPath = resolveGuozaokeLink(href);
    if (miniPath) {
      Taro.navigateTo({ url: miniPath });
    } else {
      Taro.setClipboardData({ data: href });
    }
  }
}

export function isUserMentionLink(href: string): boolean {
  return /^\/u\/[^/]+$/.test(href);
}
