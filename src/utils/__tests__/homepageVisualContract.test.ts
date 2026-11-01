import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(`src/${path}`, "utf8");

// Reference screenshot is 852px wide, mapped to the mini-program's 750rpx grid.
describe("homepage reference geometry", () => {
  it("scopes the pale-blue surface and search capsule to the topic tab", () => {
    const home = source("pages/home/index.tsx");
    const css = source("pages/home/index.scss");
    expect(home).toContain('this.state.selectedTabIndex === 0 ? "root root--topics"');
    expect(css).toMatch(/&--topics\s*\{\s*background: linear-gradient\(180deg, var\(--theme-brand-soft, #e7efff\)/);
    expect(css).toContain("background: rgba(var(--theme-surface-rgb, 255, 255, 255), 0.78);");
    expect(home).toContain('height: getNavInfo().capsuleHeight + "px"');
    expect(source("components/SearchEntry/index.tsx")).toContain("useSearchPlaceholder(!node)");
  });

  it("adds a scoped left inset to the home and discovery wordmark", () => {
    const css = source("pages/home/index.scss");
    const inset = css.split("&--topics,\n  &--discovery {")[1].split("&--topics {")[0];
    expect(inset).toContain(".navContent {");
    expect(inset).toContain("box-sizing: border-box;");
    expect(inset).toContain("padding-left: 24rpx;");
  });

  it("reserves only the top inset and blue pills in the fixed header and list measurement", () => {
    const css = source("pages/home/topics/index.scss");
    const header = css.split(".tab-header {")[1].split(".tab-scroll {")[0];
    const scroll = css.split(".tab-scroll {")[1].split(".tab-item {")[0];
    expect(header).toContain("height: 64rpx;");
    expect(header).toContain("padding-top: 10rpx;");
    expect(header).not.toMatch(/padding-bottom:|margin-bottom:/);
    expect(scroll).toContain("height: 54rpx;");
    expect(css).toContain("line-height: 54rpx;");
    expect(css).toContain("border-radius: 30rpx;");
    expect(css).toContain("background: linear-gradient(150deg, #4b8cff, #0754ee);");
    expect(css).not.toContain("&::after");
    expect(source("pages/home/topics/index.tsx")).toContain("Math.max(0, res.height - rpxToPx(64))");
  });

  it("scrolls the former 28rpx header gap before announcements and regular topics in both renderers", () => {
    const list = source("pages/home/topics/topicList/index.tsx");
    const scroll = list.split("<ScrollView")[1].split("</ScrollView>")[0];
    expect(scroll).toContain("className={isSkyline() ? 'topicList topicList--skyline' : 'topicList'}");
    // The spacer is the first scroll child, not part of the header/refresh wrapper.
    expect(scroll).toMatch(/>\s*<View className='topicListTopSpacer' \/>/);
    expect(scroll.indexOf("topicListTopSpacer")).toBeLessThan(scroll.indexOf("<HomepageAnnouncement"));
    expect(scroll.indexOf("topicListTopSpacer")).toBeLessThan(scroll.indexOf("regularTopics.map"));
    expect(list.match(/className='topicListTopSpacer'/g)).toHaveLength(1);
    const css = source("pages/home/topics/topicList/index.scss");
    const [shared, native] = css.split(".topicList--skyline");
    const spacer = shared.match(/\.topicListTopSpacer\s*\{([^}]+)\}/)?.[1];
    expect(spacer).toContain("display: block;");
    expect(spacer).toContain("height: 28rpx;");
    expect(spacer).toContain("flex: none;");
    expect(native).not.toContain(".topicListTopSpacer");
    // Keep the first loaded card at the former 92rpx offset.
    const headerHeight = Number(source("pages/home/topics/index.scss").match(/\.tab-header\s*\{[^}]*height: (\d+)rpx;/)?.[1]);
    const spacerHeight = Number(spacer?.match(/height: (\d+)rpx;/)?.[1]);
    expect(headerHeight + spacerHeight).toBe(92);
  });

  it("matches roomy white cards with blue category pills and bare reply counts", () => {
    const [css, native] = source("pages/home/topics/topicList/index.scss").split(".topicList--skyline");
    expect(css).toContain("margin: 0 22rpx 14rpx;");
    expect(css).toContain("padding: 22rpx 26rpx 20rpx;");
    expect(css).toContain("min-height: 132rpx;");
    expect(css).toContain("border-radius: 24rpx;");
    expect(css).toContain("font-size: 30rpx;");
    expect(css).toContain("line-height: 1.4;");
    expect(css).toContain("flex-wrap: nowrap;");
    const category = css.split(".categoryTag {")[1].split(".user {")[0];
    expect(category).toContain("color: #0754d7;");
    expect(category).toContain("border-radius: 24rpx;");
    const replies = css.split(".right {")[1].split(".commentIcon")[0];
    expect(replies).not.toMatch(/background:|border-radius:|padding:/);
    expect(native).toContain("height: auto;");
    expect(native).toContain("flex: none;");
    expect(source("pages/home/topics/topicList/index.tsx")).toContain("className='lastUpdateTime' overflow='ellipsis' maxLines={1}");
  });

  it("renders only the selected real announcement with native copy and extracted artwork", () => {
    const list = source("pages/home/topics/topicList/index.tsx");
    expect(list).not.toContain("过早客论坛小红书号正式上线啦!");
    expect(list).not.toContain("更多精彩内容，欢迎关注");
    expect(list).toContain("splitTopicAnnouncement(topics)");
    const announcement = list.split("const HomepageAnnouncement =")[1].split("const TopicItem =")[0];
    expect(announcement).toContain("{topic.title}</Text>");
    expect(announcement).toContain('{topic.category} · {topic.lastUpdated}更新 · {topic.commentCount === "" ? 0 : topic.commentCount} 评论');
    expect(announcement).toContain("urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)");
    expect(announcement).toContain("if (tid) Taro.navigateTo");
    expect(announcement).not.toContain(" svg ");
    const scroll = list.split("<ScrollView")[1].split("</ScrollView>")[0];
    expect(scroll).toContain("{announcement && <HomepageAnnouncement topic={announcement} />}");
    expect(scroll.indexOf("<HomepageAnnouncement")).toBeLessThan(scroll.indexOf("regularTopics.map"));
    for (const asset of ["home-announcement-icon.png", "home-announcement-scene.png"]) {
      expect(list).toContain(`assets/${asset}`);
      expect(readFileSync(`src/assets/${asset}`).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
    const css = source("pages/home/topics/topicList/index.scss");
    expect(css).toContain("height: 114rpx;");
    expect(css).toContain("width: 276rpx;");
    expect(css).toContain("min-height: 114rpx;");
    expect(css).not.toContain("margin-right: 224rpx;");
    expect(css).not.toContain(".homeAnnouncementArrow");
    expect(announcement).not.toContain("homeAnnouncementArrow");
    expect(announcement).toContain("<Text className='homeAnnouncementTitle'>{topic.title}</Text>");
    const title = css.split(".homeAnnouncementTitle {")[1].split(".homeAnnouncementSubtitle {")[0];
    const regularTitle = css.split(".title {")[1].split(".meta {")[0];
    expect(title.match(/font-size: ([^;]+);/)?.[1]).toBe(regularTitle.match(/font-size: ([^;]+);/)?.[1]);
    expect(title).toContain("white-space: normal;");
    expect(title).not.toContain("text-overflow: ellipsis;");
    const copy = css.split(".homeAnnouncementCopy {")[1].split(".homeAnnouncementTitle {")[0];
    expect(copy).toContain("z-index: 1;");
    expect(copy).not.toContain("margin-right:");
    const icon = css.split(".homeAnnouncementIconWrap {")[1].split(".homeAnnouncementCopy {")[0];
    expect(icon).not.toContain("background:");
    expect(icon).toContain("width: 44rpx;");
    expect(icon).toContain("height: 44rpx;");
  });

  it("keeps the blue circular compose button and real device safe area without a tab underline", () => {
    const css = source("pages/home/index.scss");
    const add = css.split(".addIcon {")[1].split("&:active .addIcon")[0];
    expect(add).toContain("width: 72rpx;");
    expect(add).toContain("height: 72rpx;");
    expect(add).toContain("border-radius: 50%;");
    expect(add).toContain("align-items: center;");
    expect(css).toContain("height: 112rpx;");
    expect(css).not.toContain("width: 58rpx;");
    expect(css).not.toContain("height: 5rpx;");
    expect(css).not.toMatch(/\.tabItem[\s\S]{0,220}?&::after\s*\{/);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(source("pages/home/index.tsx")).toContain("Math.max(rpxToPx(16), getBottomSafeAreaInset())");
  });

  it("centers the compose image independently of text baselines and the share-element wrapper", () => {
    const home = source("pages/home/index.tsx");
    const css = source("pages/home/index.scss");
    expect(home).toContain('mapkey="create_topic_btn" className="composeShareElement"');
    expect(home).toContain('<Image src={ComposePlusIcon} svg mode="aspectFit" className="composePlusIcon" />');
    expect(home).not.toContain("<Text>+</Text>");
    const add = css.split("&--add {")[1];
    expect(add).toContain("align-self: stretch;");
    expect(add).toContain("padding: 0;");
    const wrapper = add.split(".composeShareElement {")[1].split(".composePlusIcon {")[0];
    expect(wrapper).toContain("width: 72rpx;");
    expect(wrapper).toContain("height: 72rpx;");
    expect(wrapper).toContain("justify-content: center;");
    expect(wrapper).toContain("align-items: center;");
    const icon = source("assets/home-compose-plus.svg");
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('d="M12 4v16M4 12h16"');
    expect(icon).not.toContain("<text");
  });

  it("continues to render live topics, hot nodes, search labels and server unread counts", () => {
    const topics = source("pages/home/topics/index.tsx");
    const list = source("pages/home/topics/topicList/index.tsx");
    expect(topics).toContain("getNodeTopics({ node: tab.node, page })");
    expect(topics).toContain("getRecentTopics({ type: tab.type, page })");
    expect(topics).toContain("nodes.map((node)");
    expect(list).toContain("{title}</Text>");
    expect(list).toContain("{username}</Text>");
    expect(list).toContain('{commentCount === "" ? 0 : commentCount}');
    expect(list).toContain('category === "公告" ? AnnouncementIcon : NodeIcon');
    expect(source("assets/home-node.svg")).toContain('fill="#1f69ff"');
    expect(source("assets/home-active.svg")).toContain('fill="#1f69ff"');
    expect(source("pages/home/index.tsx")).toContain("subscribeUnreadNotifications((count)");
  });
});
