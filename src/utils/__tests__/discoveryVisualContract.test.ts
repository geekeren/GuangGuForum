import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(`src/${path}`, "utf8");

describe("discovery reference layout", () => {
  it("keeps the requested title without a discovery search box", () => {
    const home = source("pages/home/index.tsx");
    const header = home.split("ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 1")[1].split("ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 3")[0];
    expect(header).toContain(">过早客</Text>");
    expect(header).not.toContain("SearchEntry");
    expect(home).toContain("root root--discovery");
    expect(home).toContain("selectedTabIndex === 1 && this.state.pageVisible");
    expect(home).toContain("componentDidHide()");
  });
  it("uses real data for all lists and keeps the reference marketing banner separate", () => {
    const page = source("pages/home/discovery/index.tsx");
    for (const title of ["来过早客，聊武汉", "热门讨论", "热门板块", "我的关注"]) expect(page).toContain(title);
    expect(page).toContain("getHotTopicPage(hotTopics || [], hotPage)");
    expect(page).toContain("{rank}</Text>");
    expect(page).toContain("loadDiscoveryTopicMetadata");
    expect(page).toContain("hotNodes.slice(0, 8)");
    expect(page).toContain("interestTopics.slice(0, 10)");
    expect(page).toContain("<NodePicker");
    expect(page).toContain("topicTab=interest");
    expect(page).toContain("encodeURIComponent(slug)");
    expect(page).toContain("event.stopPropagation()");
    expect(page).not.toContain("武汉地铁新线开通后");
  });
  it("uses the shared live-category tag in followed topics without losing node navigation", () => {
    const page = source("pages/home/discovery/index.tsx");
    const interest = page.split("interestTopics.slice(0, 10).map(topic => (")[1];
    expect(interest).toContain("<TopicTag label={topic.category} onClick={event => {");
    expect(interest).toContain("event.stopPropagation();");
    expect(interest).toContain("const slug = topic.categoryLink?.match(/^\\/node\\/([^?#/]+)/)?.[1];");
    expect(interest).toContain("if (slug) openNode(slug, topic.category);");
    expect(interest).not.toContain("className='interestCategory'");
  });
  it("stagger-fades only the hot rows while preserving layout and click identity", () => {
    const page = source("pages/home/discovery/index.tsx"), css = source("pages/home/discovery/index.scss");
    expect(page).toContain('hotTopicItem--${hotFadingOut ? "exit" : "enter"}');
    expect(page).toContain("if (!hotFadingOut) openTopic(topic.topicLink)");
    expect(css).toContain("animation: discoveryTopicEnter 180ms ease-out both;");
    expect(css).toContain("animation: discoveryTopicExit 180ms ease-in both;");
    expect(css).toContain("animation-delay: 240ms;");
    expect(css).toContain("@keyframes discoveryTopicEnter");
  });

  it("maps the artwork to a four-column grid and compact rounded sections", () => {
    const css = source("pages/home/discovery/index.scss");
    for (const contract of ["height: 178rpx;", "border-radius: 30rpx;", "height: 96rpx;", "width: 22.3%;", "height: 116rpx;", "height: 118rpx;", "height: 100%;", "flex-direction: row;"]) expect(css).toContain(contract);
    const page = source("pages/home/discovery/index.tsx");
    for (const asset of ["scene", "trend", "flame", "heart", ...["water", "work", "code", "house", "car", "chat", "food", "city"].map(name => `node-${name}`)]) {
      const semantic = `Discovery${asset.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')}Url`;
      expect(page).toContain(asset === 'scene' ? 'assets/discovery-scene.svg?raw' : `${semantic} as `);
      expect(page).not.toContain(`assets/discovery-${asset}.png`);
      const svg = asset === 'scene' ? source('assets/discovery-scene.svg') : readFileSync(`packages/gzk-ui/src/icons/assets/discovery-${asset}.svg`, 'utf8');
      expect(svg).toMatch(/<svg\b[^>]*\bviewBox=/);
      expect(svg).toMatch(/<(?:path|rect|circle|ellipse|polygon|polyline)\b/);
      expect(svg).not.toMatch(/<image\b|<foreignObject\b|base64|data:image|\.(?:png|jpe?g|webp|gif)\b/i);
    }
    expect(page).toContain('assets/discovery-scene.svg?raw');
    expect(page).toContain("discoverySceneSource(Scene, theme)");
    expect(page).toContain("<Image src={scene} svg mode='aspectFit'");
    expect(page).toContain("<Image src={nodeIcons[node.title] || WaterIcon} svg mode='aspectFit'");
    for (const icon of ["TrendIcon", "FlameIcon", "HeartIcon"]) {
      expect(page).toContain(`<Image src={${icon}} svg mode='aspectFit'`);
    }
    expect(css).not.toContain("display: grid");
  });
});
