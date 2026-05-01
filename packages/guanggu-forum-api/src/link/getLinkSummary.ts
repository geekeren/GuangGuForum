import Taro from "@tarojs/taro";
import { parse, HTMLElement } from "node-html-parser";

export interface LinkSummary {
  title: string;
  description: string;
  bodyText: string;
  bodyHtml: string;
  image: string;
  favicon: string;
  siteName: string;
  url: string;
}

const HTML_CACHE_PREFIX = "link_html_";
const HTML_CACHE_TTL = 30 * 60 * 1000;

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

function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const raw = bodyMatch ? bodyMatch[1] : html;
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/display\s*:\s*none\s*;?/gi, "")
    .trim();
}

function parseSummary(html: string, url: string): LinkSummary {
  let origin = "";
  try { origin = new URL(url).origin; } catch {}

  const doc = parse(html);
  const bodyText = extractBodyText(doc);
  const bodyHtml = extractBodyHtml(html);

  return {
    title: extractTitle(doc) || url,
    description: extractDescription(doc),
    bodyText,
    bodyHtml,
    image: extractImage(doc),
    favicon: extractFavicon(doc, origin),
    siteName: extractSiteName(doc),
    url,
  };
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await Taro.request({
      url,
      responseType: "text",
      timeout: 8000,
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (html) {
      try {
        Taro.setStorageSync(HTML_CACHE_PREFIX + url, JSON.stringify({ html, timestamp: Date.now() }));
      } catch {}
    }
    return html;
  } catch {
    return "";
  }
}

function getCachedHtml(url: string): string {
  try {
    const stored = Taro.getStorageSync(HTML_CACHE_PREFIX + url);
    if (stored) {
      const cached: CachedHtml = JSON.parse(stored);
      if (Date.now() - cached.timestamp < HTML_CACHE_TTL) {
        return cached.html;
      }
    }
  } catch {}
  return "";
}

export async function fetchLinkSummary(url: string): Promise<LinkSummary> {
  const cachedHtml = getCachedHtml(url);
  const html = cachedHtml || await fetchHtml(url);

  if (!html) {
    return { title: url, description: "", bodyText: "", bodyHtml: "", image: "", favicon: "", siteName: "", url };
  }

  const summary = parseSummary(html, url);

  if (!cachedHtml) {
    fetchHtml(url);
  }

  return summary;
}
