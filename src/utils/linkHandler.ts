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
    const isSummary = entry?.mode === "summary";
    if (entry?.mode === "webview") {
      Taro.navigateTo({
        url: `/pages/webview/index?url=${encodeURIComponent(href)}`,
      });
    } else {
      wx.navigateTo({
        url: `/pages/linkPreview/index?url=${encodeURIComponent(href)}`,
        routeType: "wx://bottom-sheet",
        routeOptions: { height: isSummary ? "75%" : "40%" },
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

const URL_TEXT = /^(?:https?:\/\/|www\.)/i;
const BARE_HOST = /^[\w-]+(?:\.[\w-]+)+(?:\/|$)/;
const CHIP_MAX = 42;
const SEGMENT_MAX = 16;

function clip(value: string, max = CHIP_MAX): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * 正文链接统一显示成“域名胶囊”：链接文字本身就是 URL 时，只展示域名 + 前两段路径，
 * 避免整条长链被逐字符折成好几行。普通文字链接保留原文字，仅做长度截断。
 */
export function linkChipLabel(href: string, text?: string): string {
  const raw = (text || "").replace(/\s+/g, " ").trim();
  if (raw && !URL_TEXT.test(raw) && !BARE_HOST.test(raw)) {
    return clip(raw);
  }
  const source = raw || href;
  try {
    const parsed = new URL(source, "https://www.guozaoke.com");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return clip(source);
    }
    const host = parsed.hostname.replace(/^www\./i, "");
    const segments = parsed.pathname.split("/").filter(Boolean).map(safeDecode);
    const kept: string[] = [];
    let moreSegments = false;
    for (const segment of segments) {
      if (kept.length === 2) {
        moreSegments = true;
        break;
      }
      if (segment.length > SEGMENT_MAX) {
        kept.push(`${segment.slice(0, SEGMENT_MAX - 1)}…`);
        break;
      }
      kept.push(segment);
    }
    const label = [host, ...kept].join("/");
    return clip(moreSegments ? `${label}/…` : label);
  } catch {
    return clip(source);
  }
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
