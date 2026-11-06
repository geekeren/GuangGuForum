import { describe, expect, it, vi } from "vitest";
import { GzkLoading } from "../components/Loading";
import { GzkTag } from "../components/Tag";
import { GzkIcon, type IconTone } from "../components/Icon";
import { BASE_THEME_PALETTES, type ColorTheme } from "../theme";

vi.mock("react", async (original) => ({
  ...await original<any>(),
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Image: "Image" }));
vi.mock("../components/Tag/index.module.scss", () => ({ default: { gzkTag: "gzkTagScoped" } }));

const vector = '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="currentColor"/><circle fill="#fff"/></svg>';
const decode = (src: string) => decodeURIComponent(src.slice("data:image/svg+xml,".length));
const tones: IconTone[] = ["primary", "secondary", "muted", "accent", "accent-text"];
const themes: ColorTheme[] = ["light", "dark"];
const cases = themes.flatMap(theme => tones.map(tone => [theme, tone] as const));

describe("GzkLoading", () => {
  it("retains the default 32px eight-blade spinner, label and non-fullscreen geometry", () => {
    const tree = GzkLoading({});
    expect(tree.props.className).toBe("gzkLoading");
    const [spinner, label] = tree.props.children;
    expect(spinner.props.className).toBe("gzkLoadingSpinner");
    expect(spinner.props.style).toEqual({ width: "32px", height: "32px" });
    expect(spinner.props.children).toHaveLength(8);
    for (const blade of spinner.props.children) expect(blade.props.className).toBe("gzkLoadingBlade");
    expect(label.props.className).toBe("gzkLoadingLabel");
    expect(label.props.children).toBe("加载中...");
  });

  it("preserves caller size, fullscreen and explicit compatibility selector hooks", () => {
    const tree = GzkLoading({ size: 40, fullscreen: true, className: "loading loading--fullscreen fixture", labelClassName: "tip" });
    expect(tree.props.className).toBe("gzkLoading gzkLoading--fullscreen loading loading--fullscreen fixture");
    expect(tree.props.children[0].props.style).toEqual({ width: "40px", height: "40px" });
    expect(tree.props.children[1].props.className).toBe("gzkLoadingLabel tip");
  });
});

describe("GzkTag", () => {
  it("keeps children and the optional click callback without introducing business behavior", () => {
    const onClick = vi.fn();
    const children = ["tag", "content"];
    const tag = GzkTag({ children, onClick });
    expect(tag.props.children).toBe(children);
    expect(tag.props.className).toBe("gzkTagScoped");
    expect(tag.props.onClick).toBe(onClick);
    tag.props.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("appends caller classes to its CSS-module class and permits a non-clickable tag", () => {
    const tag = GzkTag({ children: "展示标签", className: "fixture" });
    expect(tag.props.className).toBe("gzkTagScoped fixture");
    expect(tag.props.onClick).toBeUndefined();
  });
});

describe("GzkIcon", () => {
  it.each(cases)("resolves the %s %s tone without leaking theme props into native Image", (theme, tone) => {
    const icon = GzkIcon({ src: vector, theme, tone });
    const palette = BASE_THEME_PALETTES[theme];
    const colors = {
      primary: palette["text-primary"], secondary: palette["text-secondary"],
      muted: palette["text-tertiary"], accent: palette["accent-primary"], "accent-text": palette["accent-text"],
    };
    expect(icon.type).toBe("Image");
    expect(icon.props.svg).toBe(true);
    expect(icon.props).not.toHaveProperty("theme");
    expect(icon.props).not.toHaveProperty("tone");
    expect(icon.props).not.toHaveProperty("lightColor");
    expect(icon.props.style).toEqual({ color: colors[tone], filter: "none" });
    expect(decode(icon.props.src)).toContain(`stroke="${colors[tone]}"`);
    expect(decode(icon.props.src)).toContain('fill="#fff"');
  });

  it("defaults to the secondary tone", () => {
    expect(GzkIcon({ src: vector, theme: "dark" }).props.style.color).toBe(BASE_THEME_PALETTES.dark["text-secondary"]);
  });

  it("retains lightColor only in light mode and gives explicit color highest priority", () => {
    const props = { src: vector, tone: "secondary" as const, lightColor: "#000000" };
    expect(decode(GzkIcon({ ...props, theme: "light" }).props.src)).toContain('stroke="#000000"');
    expect(decode(GzkIcon({ ...props, theme: "dark" }).props.src)).toContain(`stroke="${BASE_THEME_PALETTES.dark["text-secondary"]}"`);
    for (const theme of themes) {
      expect(decode(GzkIcon({ ...props, theme, color: "#abcdef" }).props.src)).toContain('stroke="#abcdef"');
    }
  });

  it("preserves native Image sizing, callbacks and object styles while disabling legacy filters", () => {
    const onClick = vi.fn();
    const onLoad = vi.fn();
    const icon = GzkIcon({ src: vector, theme: "dark", className: "fixture", mode: "aspectFit", lazyLoad: true, onClick, onLoad, style: { width: "24rpx", height: "24rpx", filter: "brightness(2)" } });
    expect(icon.props).toMatchObject({ className: "fixture", mode: "aspectFit", lazyLoad: true, onClick, onLoad });
    expect(icon.props.style).toEqual({ width: "24rpx", height: "24rpx", color: BASE_THEME_PALETTES.dark["text-secondary"], filter: "none" });
    icon.props.onClick();
    icon.props.onLoad();
    expect(onClick).toHaveBeenCalledOnce();
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("preserves string styles and appends the resolved color and disabled filter last", () => {
    const style = "width:24rpx;height:24rpx;color:#000;filter:brightness(2)";
    const icon = GzkIcon({ src: vector, theme: "dark", tone: "muted", style });
    const color = BASE_THEME_PALETTES.dark["text-tertiary"];
    expect(icon.props.style).toBe(`${style};color:${color};filter:none`);
    expect(decode(icon.props.src)).toContain(`stroke="${color}"`);
  });

  it("refreshes the SVG document when either the explicit theme or vector changes", () => {
    const light = GzkIcon({ src: vector, theme: "light", tone: "accent" });
    const dark = GzkIcon({ src: vector, theme: "dark", tone: "accent" });
    expect(light.props.src).not.toBe(dark.props.src);
    const next = GzkIcon({ src: vector.replace("path", "rect"), theme: "dark", tone: "accent" });
    expect(next.props.src).not.toBe(dark.props.src);
    expect(decode(next.props.src)).toContain("<rect");
  });
});
