import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { ScrollView, Text, View } from "@tarojs/components";
import { getHotNodes, getNodeTopics, getRecentTopics, GetTopicsParam } from "guanggu-forum-api";
import { usePageScrollViewType } from "../../../hooks/usePageRenderer";
import { usePageScope } from "../../../hooks/usePageScope";
import { createPageSelectorQuery, nextTickForPage } from "../../../utils/pageScope";
import { fetchAndCacheNodeNavigation } from "../../../utils/nodeNavigation";
import { useDataWithCache } from "../../../hooks/useDataWithCache";
import { useViewport } from "../../../hooks/useViewport";
import { getHomeRailMode } from "../../../components/DesktopLayout/homeRailLayout";
import { useTheme } from "../../../hooks/useTheme";
import { THEME_PALETTES } from "../../../utils/themePreferences";
import TopicList from "./topicList";
import "./index.scss";

interface TabConfig {
  title: string;
  type: GetTopicsParam["type"];
  node?: string;
}

const defaultTabs: TabConfig[] = [
  { title: "最近更新", type: "default" },
  { title: "最近发布", type: "latest" },
  { title: "精华", type: "elite" },
  { title: "我的关注", type: "interest" },
];

export default function Topics({ initialTab, selectionRequest = 0, active = true }: { initialTab?: string; selectionRequest?: number; active?: boolean }) {
  const pageScope = usePageScope();
  const owner = pageScope.owner;
  const scrollViewType = usePageScrollViewType();
  const { width, height, isDesktop } = useViewport();
  const homeRailMode = getHomeRailMode(pageScope.viewport.isDesktopClient, width);
  const { theme } = useTheme();
  const palette = THEME_PALETTES[theme];
  const initialTabIndex = initialTab === "interest" ? 3 : 0;
  const [currentTabIndex, setCurrentTabIndex] = useState(initialTabIndex);
  const [tabPaneHeight, setTabPaneHeight] = useState(400);
  const [tabs, setTabs] = useState<TabConfig[] | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Record<number, boolean>>({ [initialTabIndex]: true });
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrollIntoView, setScrollIntoView] = useState(`tab_${initialTabIndex}`);
  const [publishGeneration, setPublishGeneration] = useState(0);
  const consumedPublications = useRef<Record<string, number>>({});
  const listRefs = useRef<Record<number, any>>({});
  const lastTapTime = useRef(0);
  const { data: hotNodesData, request: fetchHotNodes } = useDataWithCache(getHotNodes);

  const toTabs = (nodes) =>
    defaultTabs.concat(
      nodes.map((node) => {
        const nodeName = node.link?.replace("/node/", "") || "";
        return { title: node.title, type: "node" as const, node: nodeName };
      }),
    );

  useEffect(() => {
    fetchHotNodes();
    void fetchAndCacheNodeNavigation().catch(() => {});
  }, []);

  useEffect(() => {
    if (hotNodesData) setTabs(toTabs(hotNodesData));
  }, [hotNodesData]);

  // A lazy-mounted tab can miss page Ready. Rail density changes can resize/wrap
  // this container even when device identity changes without a new page width.
  useEffect(function measureTopicPane() {
    if (!active) return;
    let cancelled = false;
    nextTickForPage(owner, () => {
      if (cancelled) return;
      let containerHeight = 0;
      const query = createPageSelectorQuery(owner);
      query.select('#list_container').boundingClientRect((res) => { const rect = Array.isArray(res) ? res[0] : res; containerHeight = rect?.height || 0; });
      query.select('#topics_layout_header').boundingClientRect((res) => {
        if (!cancelled && containerHeight) {
          const rect = Array.isArray(res) ? res[0] : res;
          const headerHeight = rect?.height || (isDesktop ? 54 : 76 * width / 750);
          setTabPaneHeight(Math.max(0, containerHeight - headerHeight));
        }
      });
      query.exec();
    });
    return () => { cancelled = true; };
  }, [active, width, height, isDesktop, homeRailMode, owner]);

  useEffect(function subscribeToPublishedTopics() {
    const handler = () => {
      setPublishGeneration((generation) => generation + 1);
      setRefreshKey((k) => k + 1);
    };
    Taro.eventCenter.on("refreshTopics", handler);
    return () => { Taro.eventCenter.off("refreshTopics", handler); };
  }, []);

  const handleClick = (value: number) => {
    const now = Date.now();
    if (value === currentTabIndex && now - lastTapTime.current < 300) {
      listRefs.current[value]?.scrollToTop?.();
      lastTapTime.current = 0;
      return;
    }
    lastTapTime.current = now;

    nextTickForPage(owner, () => {
      createPageSelectorQuery(owner)
        .select(`#tab_${value}`)
        .boundingClientRect();
      createPageSelectorQuery(owner)
        .select(".tab-scroll")
        .boundingClientRect((scrollRect: any) => {
          createPageSelectorQuery(owner)
            .select(`#tab_${value}`)
            .boundingClientRect((tabRect: any) => {
              if (scrollRect && tabRect) {
                const visible = tabRect.left >= scrollRect.left - 4 && tabRect.right <= scrollRect.right + 4;
                if (!visible) {
                  setScrollIntoView(`tab_${value}`);
                }
              }
            })
            .exec();
        })
        .exec();
    });
    setCurrentTabIndex(value);
    if (!loadedTabs[value]) {
      setLoadedTabs({ ...loadedTabs, [value]: true });
    }
    if (value !== currentTabIndex) {
      setRefreshKey((k) => k + 1);
    }
  };

  useEffect(function syncTopicSelection() {
    if (initialTab !== "interest") return;
    handleClick(3);
  }, [initialTab, selectionRequest]);

  const activeTabs = tabs ?? defaultTabs;

  return (
    <View
      id='list_container'
      className='topicsContainer'
    >
      <View id='topics_layout_header' className='topicsLayoutHeader'>
        <View className='tab-header'>
          <ScrollView
            type={scrollViewType}
            scrollX
            enableFlex
            style={{ flexDirection: 'row' }}
            className='tab-scroll'
            scrollWithAnimation
            scrollIntoView={scrollIntoView}
          >
            {/* Keep pill colors together inside ScrollView instead of inheriting a mixed theme cascade. */}
            {activeTabs.map((tab, index) => {
              const selected = index === currentTabIndex;
              const color = selected ? "#fff" : palette["text-primary"];
              return (
                <View
                  id={`tab_${index}`}
                  key={`${tab.type}_${tab.node || ''}_${index}`}
                  className={`tab-item ${selected ? 'tab-item--active' : ''}`}
                  style={{
                    color,
                    background: selected
                      ? theme === "dark" ? palette["tab-active-background"] : "linear-gradient(150deg, #4b8cff, #0754ee)"
                      : theme === "dark" ? palette["tab-inactive-background"] : "rgba(255, 255, 255, 0.78)",
                    border: theme === "dark" ? `1rpx solid ${selected ? "transparent" : palette["border-subtle"]}` : "none",
                    lineHeight: isDesktop ? "34px" : theme === "dark" ? "52rpx" : "54rpx",
                    boxShadow: theme === "dark" ? "none" : selected ? "0 4rpx 12rpx rgba(31, 105, 255, 0.15)" : palette["shadow-sm"],
                  }}
                  onClick={() => handleClick(index)}
                >
                  <Text style={{ color }}>{tab.title}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
      {activeTabs.map((tab, index) => (
        <View
          key={`${tab.type}_${tab.node || ''}_${index}`}
          className='topicPane'
          style={{ display: index === currentTabIndex ? 'block' : 'none' }}
        >
          {loadedTabs[index] && (
            <TopicList
              pageScope={pageScope}
              key={`${tab.type}_${tab.node || ''}_${index}_${refreshKey}`}
              ref={(el) => { if (el) listRefs.current[index] = el; }}
              cacheKey={
                tab.node
                  ? `node_topics_${tab.node}`
                  : `recent_topics_${tab.type}`
              }
              style={{ height: tabPaneHeight }}
              freshOnMount={(consumedPublications.current[`${tab.type}_${tab.node || ''}`] ?? 0) < publishGeneration}
              onFreshLoad={() => {
                const key = `${tab.type}_${tab.node || ''}`;
                consumedPublications.current[key] = Math.max(consumedPublications.current[key] ?? 0, publishGeneration);
              }}
              getTopics={(page, options) => {
                if (tab.node) {
                  return getNodeTopics({ node: tab.node, page }, options);
                }
                return getRecentTopics({ type: tab.type, page }, options);
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}
