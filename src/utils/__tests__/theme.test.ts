import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BRAND_COLOR, SURFACE_RGB, TEXT_FAINT_COLOR } from "../theme";

const styles = readFileSync("packages/gzk-ui/src/styles/tokens.scss", "utf8");
function token(name: string) {
  return styles.match(new RegExp(`\\$${name}:\\s*(#[a-f0-9]{6})`))![1];
}
describe("restored original foundation", () => {
  it("restores the original blue brand, accent, text and surfaces", () => {
    expect(token("color-brand")).toBe("#1f69ff");
    expect(token("color-brand-light")).toBe("#578fff");
    expect(token("color-brand-dark")).toBe("#1954cc");
    expect(token("color-brand-soft")).toBe("#e8efff");
    expect(token("color-accent")).toBe("#ff8a3d");
    expect(token("text-primary")).toBe("#0f1626");
    expect(token("text-sub")).toBe("#2c3548");
    expect(token("bgColor")).toBe("#f4f5fa");
    expect(token("surfaceAlt")).toBe("#f0f3f8");
    expect(token("surface")).toBe("#ffffff");
  });
  it("keeps runtime colors aligned with Sass tokens", () => {
    expect(BRAND_COLOR).toBe(token("color-brand"));
    expect(TEXT_FAINT_COLOR).toBe(token("text-faint"));
    expect(SURFACE_RGB).toBe([1, 3, 5].map(i => parseInt(token("surface").slice(i, i + 2), 16)).join(", "));
  });
  it("restores the original blue on home tabs and publish button without a selected underline", () => {
    const home = readFileSync("src/pages/home/index.scss", "utf8");
    const topics = readFileSync("src/pages/home/topics/index.scss", "utf8");
    expect(home).toContain(".tabTitle {\n        color: $color-brand;");
    expect(home).toContain("background: linear-gradient(135deg, $color-brand-light, $color-brand);");
    expect(topics).toContain("&--active {\n    font-weight: 700;");
    expect(topics).not.toContain("&::after");
    const topicControls = readFileSync("src/pages/home/topics/index.tsx", "utf8");
    expect(topicControls).toContain('const color = selected ? "#fff" : palette["text-primary"];');
    expect(topicControls).toContain('"linear-gradient(150deg, #4b8cff, #0754ee)"');
    expect(topicControls).toContain('<Text style={{ color }}>{tab.title}</Text>');
    expect(home).not.toContain("background: $color-brand;");
  });
  it("resolves the four currentColor active navigation vectors from the restored brand", () => {
    for (const [name, paint] of [["home", "fill"], ["discover", "stroke"], ["notification", "stroke"], ["user", "stroke"]]) {
      const svg = readFileSync(`packages/gzk-ui/src/icons/assets/${name}-active.svg`, "utf8");
      expect(svg).toContain(`${paint}="currentColor"`);
      expect(svg).not.toMatch(/<image\b|base64|data:image/i);
      expect(svg).not.toContain(BRAND_COLOR);
    }
    const home = readFileSync("src/pages/home/index.tsx", "utf8");
    expect(home).toContain("<ThemedIcon src={(active ? tab.activeIcon : tab.icon)!}");
    expect(home).toContain("tone={active ? 'accent' : 'secondary'}");
    expect(home).toContain(`lightColor={active ? '${BRAND_COLOR}' : '#6b7488'}`);
    const wrapper = readFileSync("src/components/ThemedIcon/index.tsx", "utf8");
    expect(wrapper).toContain("GzkIcon");
    expect(wrapper).toContain("useTheme");
    const themedIcon = readFileSync("packages/gzk-ui/src/components/Icon/index.tsx", "utf8");
    expect(themedIcon).toContain('accent: palette["accent-primary"]');
    expect(themedIcon).toContain('theme === "light" && lightColor ? lightColor : roles[tone]');
    expect(themedIcon).toContain("svgIconSource(src, resolvedColor)");
  });
});
