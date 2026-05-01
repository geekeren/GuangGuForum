import Taro from "@tarojs/taro";
import { parse, HTMLElement } from "node-html-parser";

export interface LinkSummary {
  title: string;
  description: string;
  bodyText: string;
  image: string;
  favicon: string;
  siteName: string;
  url: string;
}

const CACHE_PREFIX = "link_html_";
const CACHE_TTL = 30 * 60 * 1000;

interface CachedHtml {
  html: string;
  timestamp: number;
}

function metaContent(doc: HTMLElement, property: string): string {
  const el =
    doc.querySelector(`meta[property="${property}"]`) ||
    doc.querySelector(`meta[name="${property}"]`);
  return el?.getAttribute("content") || "";
}

function extractTitle(doc: HTMLElement): string {
  return (
    metaContent(doc, "og:title") ||
    doc.querySelector("title")?.text ||
    ""
  );
}

function extractDescription(doc: HTMLElement): string {
  return (
    metaContent(doc, "og:description") ||
    metaContent(doc, "description") ||
    ""
  );
}

function extractImage(doc: HTMLElement): string {
  return (
    metaContent(doc, "og:image") ||
    metaContent(doc, "twitter:image") ||
    ""
  );
}

function extractFavicon(doc: HTMLElement, origin: string): string {
  const el =
    doc.querySelector('link[rel="icon"]') ||
    doc.querySelector('link[rel="shortcut icon"]') ||
    doc.querySelector('link[rel="apple-touch-icon"]');
  if (!el) return "";
  const href = el.getAttribute("href") || "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractSiteName(doc: HTMLElement): string {
  return metaContent(doc, "og:site_name") || "";
}

function extractBodyText(doc: HTMLElement): string {
  const body = doc.querySelector("body");
  if (!body) return "";

  const clone = parse(body.innerHTML);
  clone.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());

  const paragraphs = clone.querySelectorAll("p, article, [role=article], .content, .article, .post, .entry");
  if (paragraphs.length > 0) {
    const texts = paragraphs
      .map((el) => el.structuredText || "")
      .filter((t) => t.trim().length > 20);
    if (texts.length > 0) {
      return texts.join(" ").replace(/\s+/g, " ").trim();
    }
  }

  const text = (clone.structuredText || clone.textContent || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function parseSummary(html: string, url: string): LinkSummary {
  let origin = "";
  try { origin = new URL(url).origin; } catch {}

  const doc = parse(html);
  const bodyText = extractBodyText(doc);

  return {
    title: extractTitle(doc) || url,
    description: extractDescription(doc),
    bodyText: bodyText.slice(0, 120),
    image: extractImage(doc),
    favicon: extractFavicon(doc, origin),
    siteName: extractSiteName(doc),
    url,
  };
}

export async function fetchLinkSummary(url: string): Promise<LinkSummary> {
  const cacheKey = CACHE_PREFIX + url;

  let html = "";
  try {
    const stored = Taro.getStorageSync(cacheKey);
    if (stored) {
      const cached: CachedHtml = JSON.parse(stored);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        html = cached.html;
      }
    }
  } catch {}

  if (!html) {
    try {
      const res = await Taro.request({
        url,
        responseType: "text",
        timeout: 8000,
      });
      html = typeof res.data === "string" ? res.data : "";
      try {
        Taro.setStorageSync(cacheKey, JSON.stringify({ html, timestamp: Date.now() }));
      } catch {}
    } catch {}
  }

  if (!html) {
    return { title: url, description: "", bodyText: "", image: "", favicon: "", siteName: "", url };
  }

  return parseSummary(html, url);
}
