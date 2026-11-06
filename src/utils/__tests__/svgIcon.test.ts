import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { svgIconSource } from "../svgIcon";
import { THEME_PALETTES } from "../themePreferences";
import ThemedIcon from "../../components/ThemedIcon";
import TopicTag from "../../components/TopicTag";

const harness = vi.hoisted(() => ({ theme: "light" as "light" | "dark" }));
vi.mock("react", async (original) => ({
  ...await original<any>(),
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock("@tarojs/components", () => ({ Image: "Image", Text: "Text", View: "View" }));
vi.mock("@tarojs/taro", () => ({ default: {} }));
vi.mock("../CacheService", () => ({ cacheService: {}, CacheCategory: {} }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: harness.theme }) }));

const vector = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" fill="currentColor" d="M4 12h16"/><circle fill="#fff" cx="12" cy="12" r="1"/></svg>';
const decode = (src: string) => decodeURIComponent(src.slice("data:image/svg+xml,".length));
// The app owns theme selection; expand its thin GzkUi adapter to inspect native Image props.
const renderThemedIcon = (props: Parameters<typeof ThemedIcon>[0]) => {
  const adapter = ThemedIcon(props);
  return adapter.type(adapter.props);
};
beforeEach(() => { harness.theme = "light"; });

describe("native SVG color boundary", () => {
  it("encodes one vector document while resolving every currentColor and preserving other paints", () => {
    const image = svgIconSource(vector, "#8bb5ff");
    expect(image).toMatch(/^data:image\/svg\+xml,%3Csvg/);
    const svg = decode(image);
    expect(svg).toContain('stroke="#8bb5ff" fill="#8bb5ff"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toContain("currentColor");
    expect(svg).not.toMatch(/<image\b|base64/i);
    expect(vector).toContain("currentColor");
  });

  it.each(["light", "dark"] as const)("uses the %s accent token and preserves Image sizing and interactions", (theme) => {
    harness.theme = theme;
    const onClick = vi.fn();
    const icon = renderThemedIcon({ src: vector, tone: "accent", className: "fixture", mode: "aspectFit", onClick, style: { width: "24rpx", filter: "brightness(2)" } });
    const color = THEME_PALETTES[theme]["accent-primary"];
    expect(icon.props.svg).toBe(true);
    expect(icon.props.className).toBe("fixture");
    expect(icon.props.mode).toBe("aspectFit");
    expect(icon.props.style).toEqual({ width: "24rpx", color, filter: "none" });
    expect(decode(icon.props.src)).toContain(`stroke="${color}"`);
    icon.props.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("preserves string Image styles and appends the resolved color and disabled filter last", () => {
    harness.theme = "dark";
    const style = "width:24rpx;height:24rpx;color:#000;filter:brightness(2)";
    const icon = renderThemedIcon({ src: vector, tone: "muted", style });
    const color = THEME_PALETTES.dark["text-tertiary"];
    expect(icon.props.style).toBe(`${style};color:${color};filter:none`);
    expect(decode(icon.props.src)).toContain(`stroke="${color}"`);
  });

  it("keeps lightColor only in light mode and lets an explicit container color override a tone", () => {
    const props = { src: vector, tone: "secondary" as const, lightColor: "#000000" };
    expect(decode(renderThemedIcon(props).props.src)).toContain('stroke="#000000"');
    harness.theme = "dark";
    expect(decode(renderThemedIcon(props).props.src)).toContain(`stroke="${THEME_PALETTES.dark["text-secondary"]}"`);
    expect(decode(renderThemedIcon({ ...props, color: "#abcdef" }).props.src)).toContain('stroke="#abcdef"');
  });
});

describe("shared TopicTag", () => {
  it.each(["light", "dark"] as const)("keeps the %s label and hash/announcement icon on the same accent color", (theme) => {
    harness.theme = theme;
    const onClick = vi.fn();
    const tag = TopicTag({ label: "真实分类", className: "fixture", onClick });
    const [icon, text] = tag.props.children;
    const color = THEME_PALETTES[theme]["accent-text"];
    expect(tag.props.className).toBe("topicTag fixture");
    expect(tag.props.style).toEqual({ color });
    expect(tag.props.onClick).toBe(onClick);
    expect(icon.type).toBe(ThemedIcon);
    expect(icon.props.color).toBe(color);
    expect(icon.props.src).toBe(readFileSync("packages/gzk-ui/src/icons/assets/topic-hash.svg", "utf8"));
    expect(text.props.children).toBe("真实分类");
    expect(text.props).toMatchObject({ overflow: "ellipsis", maxLines: 1 });
    const announcement = TopicTag({ label: "公告", announcement: true }).props.children[0];
    expect(announcement.props.src).toBe(readFileSync("packages/gzk-ui/src/icons/assets/home-announcement.svg", "utf8"));
    expect(announcement.props.color).toBe(color);
  });

  it("keeps the shared compact geometry and both tag icon sources vector-only", () => {
    const css = readFileSync("src/components/TopicTag/index.scss", "utf8");
    for (const contract of ["max-width: 158rpx;", "padding: 4rpx 10rpx;", "font-size: 12.61PX;", "width: 20rpx;", "height: 20rpx;"]) {
      expect(css).toContain(contract);
    }
    for (const name of ["topic-hash", "home-announcement"]) {
      const svg = readFileSync(`packages/gzk-ui/src/icons/assets/${name}.svg`, "utf8");
      expect(svg).toMatch(/(?:stroke|fill)="currentColor"/);
      expect(svg).not.toMatch(/<image\b|<foreignObject\b|base64|data:image|\.(?:png|jpe?g|webp|gif)\b/i);
    }
  });
});
