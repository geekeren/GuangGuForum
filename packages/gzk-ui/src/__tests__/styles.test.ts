import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileString } from "sass";
import { BASE_THEME_PALETTES } from "../theme";

const sourceRoot = resolve("packages/gzk-ui/src");
function stylesheet(name: string) {
  const directory = resolve(sourceRoot, "components", name);
  const file = resolve(directory, name === "Tag" ? "index.module.scss" : "index.scss");
  return compileString(readFileSync(file, "utf8"), { loadPaths: [directory] }).css;
}

describe("GzkUi native stylesheet contracts", () => {
  it("compiles Loading with namespaced classes/animation and the original native geometry", () => {
    const css = stylesheet("Loading");
    expect(css).toContain(".gzkLoading {");
    expect(css).toContain(".gzkLoading--fullscreen {");
    expect(css).toContain("animation: gzkLoadingSpin 1s linear infinite;");
    expect(css).toContain("@keyframes gzkLoadingSpin");
    expect(css).toContain("padding: 40rpx 0;");
    expect(css).toContain("font-size: 14.91PX;");
    expect(css).toContain("color: var(--theme-text-muted, #6b7488);");
    expect(css).not.toMatch(/\.(?:loading|spinner|spinnerBlade|tip)\b|@keyframes spin\b/);
  });

  it("compiles Tag with the original geometry and a dark-safe semantic foreground", () => {
    const css = stylesheet("Tag");
    expect(css).toContain(".gzkTag {");
    expect(css).toContain("background: var(--theme-brand-soft, #e8efff);");
    expect(css).toContain("color: var(--theme-accent-text, #1954cc);");
    expect(css).toContain("border-radius: 12rpx;");
    expect(css).toContain("padding: 6rpx 12rpx;");
    expect(css).toContain("font-size: 12.61PX;");
    expect(css).toContain("max-width: 100%;");
    expect(css).toContain("word-break: break-all;");
    expect(css).toContain("background: var(--theme-surface-hover, #dce7ff);");
    expect(css).not.toContain("color: #1954cc;");
  });

  it("keeps the dark Tag foreground readable against its inherited chip background", () => {
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const dark = BASE_THEME_PALETTES.dark;
    expect((luminance(dark["accent-text"]) + 0.05) / (luminance(dark["brand-soft"]) + 0.05)).toBeGreaterThan(4.5);
  });

  it("retains raw Sass brand colors for rgba callers while exposing runtime semantic variables", () => {
    const css = compileString('@import "tokens"; .fixture { color: $text-primary; background: rgba($color-brand, 0.5); border-radius: $radius-sm; }', {
      loadPaths: [resolve(sourceRoot, "styles")],
    }).css;
    expect(css).toContain("color: var(--theme-text-primary, #0f1626);");
    expect(css).toContain("background: rgba(31, 105, 255, 0.5);");
    expect(css).toContain("border-radius: 12rpx;");
  });
});
