import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRequire } from 'node:module';
const requireProject = createRequire(`${process.cwd()}/package.json`);
function declarations(selector: string) {
  const result: Record<string, string> = {};
  requireProject('postcss').parse(requireProject('sass').compile('src/pages/home/discovery/index.scss').css).walkRules((rule: any) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((decl: any) => { result[decl.prop] = decl.value; });
  });
  return result;
}

const source = (path: string) => readFileSync(`src/${path}`, "utf8");

describe('desktop discovery geometry and mobile baseline', () => {
  it('fixes hero, cards, ranks, node art and followed avatars without a breakpoint', () => {
    const pc = (suffix: string) => declarations(`.themePageHost--desktop .discoveryPage ${suffix}`);
    expect(pc('.discoveryScroll')).toMatchObject({ height: '0', 'flex-basis': '0', 'flex-grow': '1', 'flex-shrink': '1' });
    expect(pc('.discoveryHero')).toMatchObject({ height: '89PX', margin: '8PX 9PX 15PX', 'border-radius': '15PX' });
    expect(pc('.discoveryHeroScene')).toMatchObject({ width: '223PX', height: '89PX' });
    expect(pc('.section')).toMatchObject({ margin: '0 9PX 13PX', padding: '14PX 14PX 11PX', 'border-radius': '15PX' });
    expect(pc('.hotTopicItem')).toMatchObject({ height: '48PX', 'border-bottom-width': '0.5PX' });
    expect(pc('.discoveryRank')).toMatchObject({ width: '25PX', height: '20PX', 'margin-right': '12PX', 'border-radius': '7PX' });
    expect(pc('.hotNodeTag')).toMatchObject({ height: '58PX', 'border-radius': '11PX' });
    expect(pc('.hotNodeIcon')).toMatchObject({ width: '36PX', height: '34PX' });
    expect(pc('.interestAvatar')).toMatchObject({ width: '36PX', height: '36PX', 'margin-right': '10PX' });
    expect(pc('.interestMeta .topicTag')).toMatchObject({ padding: '2PX 5PX', 'border-radius': '12PX' });
    expect(declarations('.themePageHost--desktop.themePageHost--dark .discoveryPage .discoveryHero')).toMatchObject({ 'border-width': '0.5PX' });
    expect(pc('.loginPromptBtn')).toMatchObject({ 'min-height': '44PX', 'min-width': '120PX' });
    expect(declarations('.discoveryPage .discoveryHero')).toMatchObject({ height: '178rpx', 'border-radius': '30rpx' });
    expect(declarations('.discoveryPage .discoveryRank')).toMatchObject({ width: '50rpx', height: '40rpx' });
  });
});

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
