import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BRAND_COLOR, SURFACE_RGB, TEXT_FAINT_COLOR } from "../theme";

const styles = readFileSync("src/vars.scss", "utf8");
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
    expect(topics).toContain("&--active {\n    color: #fff;");
    expect(topics).toContain("background: linear-gradient(150deg, #4b8cff, #0754ee);");
    expect(home).not.toContain("background: $color-brand;");
  });
  it("matches the four active navigation icons to the restored brand", () => {
    expect(readFileSync("src/assets/home-active.svg", "utf8")).toContain(`fill="${BRAND_COLOR}"`);
    for (const name of ["discover", "notification", "user"]) {
      expect(readFileSync(`src/assets/${name}-active.svg`, "utf8")).toContain(`stroke="${BRAND_COLOR}"`);
    }
  });
});
