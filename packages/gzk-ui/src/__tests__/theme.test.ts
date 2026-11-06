import { describe, expect, it } from "vitest";
import { BASE_THEME_PALETTES, themeVariables, themePageStyle, type ColorTheme } from "../theme";
import { svgIconSource } from "../svgIcon";

const applicationRoles = [
  "navigation-surface", "navigation-shadow", "compose-shadow",
  "profile-bg", "profile-surface", "profile-surface-alt",
];

describe("GzkUi pure visual theme", () => {
  it("keeps matching light/dark base roles without application-only extensions", () => {
    expect(Object.keys(BASE_THEME_PALETTES.light)).toEqual(Object.keys(BASE_THEME_PALETTES.dark));
    for (const palette of Object.values(BASE_THEME_PALETTES)) {
      for (const role of applicationRoles) expect(palette).not.toHaveProperty(role);
    }
    expect(BASE_THEME_PALETTES.light.bg).toBe("#f4f5fa");
    expect(BASE_THEME_PALETTES.light.surface).toBe("#ffffff");
    expect(BASE_THEME_PALETTES.dark.bg).toBe("#000000");
    expect(BASE_THEME_PALETTES.dark.surface).toBe("#1c1c1e");
    expect(BASE_THEME_PALETTES.light["accent-primary"]).toBe("#1f69ff");
    expect(BASE_THEME_PALETTES.dark["accent-primary"]).toBe("#3478ff");
    expect(BASE_THEME_PALETTES.light["input-caret"]).toBe("#0754d7");
    expect(BASE_THEME_PALETTES.dark["input-caret"]).toBe("#8bb5ff");
  });

  it.each(["light", "dark"] as ColorTheme[])("emits every %s role under its original CSS variable name", (theme) => {
    const palette = BASE_THEME_PALETTES[theme];
    const variables = themeVariables(theme);
    expect(variables).toEqual(Object.fromEntries(Object.entries(palette).map(([role, value]) => [`--theme-${role}`, value])));
    expect(themePageStyle(theme)).toBe(Object.entries(palette).map(([role, value]) => `--theme-${role}:${value}`).join(";") +
      `;background-color:${palette.bg};color:${palette["text-primary"]}`);
  });

  it("accepts a selected composed host palette without mutating it or the base palettes", () => {
    const base = { ...BASE_THEME_PALETTES.dark };
    const palette = Object.freeze({ ...base, bg: "#101010", "text-primary": "#eeeeee", "navigation-surface": "#171719" });
    const variables = themeVariables("dark", palette);
    expect(variables["--theme-navigation-surface"]).toBe("#171719");
    expect(variables["--theme-bg"]).toBe("#101010");
    expect(themePageStyle("dark", palette)).toContain("--theme-navigation-surface:#171719");
    expect(themePageStyle("dark", palette)).toContain("background-color:#101010;color:#eeeeee");
    variables["--theme-bg"] = "#ffffff";
    expect(themeVariables("dark", palette)["--theme-bg"]).toBe("#101010");
    expect(palette.bg).toBe("#101010");
    expect(BASE_THEME_PALETTES.dark).toEqual(base);
  });

  it("returns fresh variable maps so one consumer cannot mutate another theme scope", () => {
    const first = themeVariables("light");
    first["--theme-bg"] = "#000000";
    expect(themeVariables("light")["--theme-bg"]).toBe("#f4f5fa");
    expect(themeVariables("dark")["--theme-bg"]).toBe("#000000");
  });
});

describe("GzkUi SVG document boundary", () => {
  it("resolves every currentColor and encodes the original vector without changing other paints", () => {
    const vector = '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="currentColor" fill="currentColor"/><text>A &amp; B #中文</text><circle fill="#fff"/></svg>';
    const result = svgIconSource(vector, "#8bb5ff");
    expect(result).toMatch(/^data:image\/svg\+xml,%3Csvg/);
    expect(decodeURIComponent(result.slice("data:image/svg+xml,".length))).toBe(vector.replace(/currentColor/g, "#8bb5ff"));
    expect(vector).toContain("currentColor");
  });
});
