import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const notifications = readFileSync("src/pages/home/notifications/index.scss", "utf8");
const html = readFileSync("src/components/HtmlRender/index.scss", "utf8");
const accent = "color: var(--theme-accent-text, #0754d7);";
function rule(source: string, selector: string): string {
  const block = source.split(`${selector} {`)[1];
  expect(block).toBeDefined();
  return block.split("}")[0];
}

describe("notification and HTML accent consistency", () => {
  it("keeps the reply badge, action and topic link on the same readable accent token", () => {
    for (const selector of [".notificationBadge", ".notificationAction", ".notificationTopicLink"]) {
      expect(rule(notifications, selector)).toContain(accent);
    }
    expect(rule(notifications, ".notificationBadge")).toContain("background: var(--theme-accent-muted, #e8efff);");
  });

  it("keeps notification excerpt colors without overriding shared mention geometry", () => {
    expect(rule(notifications, ".h5-a, .html-link")).toContain(accent);
    const mention = rule(notifications, ".html-link--mention");
    expect(mention).toContain("background: var(--theme-accent-muted, #e8efff);");
    expect(mention).not.toMatch(/padding:|border-radius:/);
  });

  it("keeps shared links and rounded padded mention labels on the same accent", () => {
    expect(rule(html, ".h5-a")).toContain(accent);
    expect(rule(html, ".html-link")).toContain(accent);
    const mention = html.split(".html-link {")[1].split("&--mention {")[1].split("&:active")[0];
    expect(mention).toContain(accent);
    expect(mention).toContain("border-radius: 10rpx;");
    expect(mention).toContain("padding: 0 12rpx;");
    expect(rule(html, ".html-mentionLabel")).toContain(accent);
  });
});
