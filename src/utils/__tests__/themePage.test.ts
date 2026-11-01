import { Component, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import App from "../../app";
import ThemePage from "../../components/ThemePage";

vi.mock("@tarojs/components", () => ({ PageMeta: "PageMeta", NavigationBar: "NavigationBar" }));
vi.mock("@tarojs/taro", () => ({ default: {} }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "dark", preference: "dark" }) }));
vi.mock("../CacheService", () => ({ cacheService: {}, CacheCategory: { System: "system" } }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../unreadNotifications", () => ({ updateUnreadNotifications: vi.fn() }));
vi.mock("guanggu-forum-api", () => ({ setCacheService: vi.fn(), setOnLoginRequired: vi.fn(), setOnUnreadNotifications: vi.fn() }));

class NativePage extends Component<{ tid: string }> {
  render() { return createElement("root", { id: this.props.tid }, createElement("view", { className: "pageContent" })); }
}

describe("native theme metadata", () => {
  it("inserts metadata inside each Taro page root, without remounting a page on app renders", () => {
    const app = new App({ children: [createElement(NativePage, { tid: "page1", key: "one" }), createElement(NativePage, { tid: "page2", key: "two" })] });
    const first = app.render() as any[];
    const second = app.render() as any[];
    expect(first).toHaveLength(2);
    expect(first[0].type).toBe(second[0].type);
    expect(first[0].key).toBe(second[0].key);
    const wrapper = new first[0].type(first[0].props);
    const root = wrapper.render();
    expect(root.type).toBe("root");
    expect(root.props.id).toBe("page1");
    expect(root.props.children.type).toBe(ThemePage);
    expect(root.props.children.props.children.props.className).toBe("pageContent");
  });
  it("emits dark variables before the page body and sets native foreground/background", () => {
    const body = createElement("view");
    const tree = ThemePage({ children: body });
    const [meta, content] = tree.props.children;
    expect(meta.type).toBe("PageMeta");
    expect(meta.props.pageStyle).toContain("--theme-bg:#10141d");
    expect(meta.props.backgroundColor).toBe("#10141d");
    expect(meta.props.children.props.frontColor).toBe("#ffffff");
    expect(content).toBe(body);
  });
  it("enables native metadata and dark configuration for every registered page", () => {
    const config = readFileSync("src/app.config.ts", "utf8");
    expect(config).toContain("darkmode: true");
    expect(config).toContain('themeLocation: "theme.json"');
    for (const match of config.matchAll(/"(pages\/[^"]+\/index)"/g)) {
      expect(readFileSync(`src/${match[1]}.config.ts`, "utf8")).toContain("enablePageMeta: true");
    }
    expect(JSON.parse(readFileSync("src/theme.json", "utf8")).dark.backgroundColor).toBe("#10141d");
  });
});
