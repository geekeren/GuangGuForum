import type { HTMLElement } from "node-html-parser";

/** Unknown markup is not evidence of zero unread notifications. */
export function parseUnreadNotifications(body: HTMLElement): number | undefined {
  const link = body.querySelector('#navbar5 .navbar-right a[href="/notifications"]');
  if (!link) return undefined;
  const text = link.textContent.replace(/\s+/g, " ").trim();
  const numericChild = link.querySelectorAll("span, strong, b, em").map((node) => node.textContent.trim())
    .find((value) => /^\d+$/.test(value));
  const value = numericChild || text.match(/(?:通知|消息|提醒)\s*[（(]?\s*(\d+)\s*[）)]?$/)?.[1] ||
    (/^\d+$/.test(text) ? text : undefined);
  const title = link.getAttribute("title") || "";
  if (value === undefined && /没有未读提醒/.test(title)) return 0;
  const countText = value ?? title.match(/(?:有\s*)?(\d+)\s*条未读(?:提醒|通知|消息)/)?.[1];
  if (countText === undefined) return undefined;
  const count = Number(countText);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}
