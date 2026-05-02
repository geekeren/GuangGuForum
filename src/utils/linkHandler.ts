import Taro from "@tarojs/taro";

const GUOZAOKE_HOSTS = ["www.guozaoke.com", "guozaoke.com"];

type WhitelistEntry = {
  mode: "webview" | "summary";
};

export const DOMAIN_WHITELIST: Record<string, WhitelistEntry> = {
  "github.com": { mode: "summary" },
  "bilibili.com": { mode: "summary" },
  "www.bilibili.com": { mode: "summary" },
  "zhihu.com": { mode: "summary" },
  "www.zhihu.com": { mode: "summary" },
  "juejin.cn": { mode: "summary" },
  "mp.weixin.qq.com": { mode: "summary" },
  "www.toutiao.com": { mode: "summary" },
  "www.xiaohongshu.com": { mode: "summary" },
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
      } else {
        Taro.navigateTo({
          url: `/pages/webview/index?url=${encodeURIComponent(href)}`,
        });
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

export function isWhitelistedDomain(url: string): boolean {
  try {
    const parsed = new URL(url, "https://www.guozaoke.com");
    return !!DOMAIN_WHITELIST[parsed.hostname];
  } catch {
    return false;
  }
}

export function extractSummaryUrl(text: string): string | null {
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  const matches = text.match(urlRegex);
  if (!matches) return null;
  const summaryDomains = Object.entries(DOMAIN_WHITELIST)
    .filter(([, v]) => v.mode === "summary")
    .map(([k]) => k);
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)\]}>]+$/, "");
    try {
      const parsed = new URL(cleaned);
      if (summaryDomains.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
        return cleaned;
      }
    } catch {}
  }
  return null;
}
