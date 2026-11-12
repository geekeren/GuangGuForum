import { usePageScrollViewType } from "../../../hooks/usePageRenderer";
import { useEffect, useRef, useState } from "react";
import {
  getHotNodes,
  getNodeTopics,
  getRecentTopics,
  GetTopicsParam,
} from "guanggu-forum-api";
import "./index.scss";

import TopicList from "./topicList";
import Taro from "@tarojs/taro";
import { ScrollView, Text, View } from "@tarojs/components";
import { rpxToPx } from "../../../utils/dimension";
import { fetchAndCacheNodeNavigation } from "../../../utils/nodeNavigation";
import { useDataWithCache } from "../../../hooks/useDataWithCache";
import { useTheme } from "../../../hooks/useTheme";
import { THEME_PALETTES } from "../../../utils/themePreferences";

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

export default function Topics({ initialTab, active = true }: { initialTab?: string; active?: boolean }) {
  const scrollViewType = usePageScrollViewType();
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

  // A lazy-mounted tab can miss page Ready; measure only after it becomes visible.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Taro.nextTick(() => {
      if (cancelled) return;
      Taro.createSelectorQuery()
        .select(`#list_container`)
        .boundingClientRect((res) => {
          if (!cancelled && res?.height) setTabPaneHeight(Math.max(0, res.height - rpxToPx(76)));
        })
        .exec();
    });
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
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

    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select(`#tab_${value}`)
        .boundingClientRect();
      Taro.createSelectorQuery()
        .select(".tab-scroll")
        .boundingClientRect((scrollRect: any) => {
          Taro.createSelectorQuery()
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

  useEffect(() => {
    if (initialTab !== "interest") return;
    handleClick(3);
  }, [initialTab]);

  const activeTabs = tabs ?? defaultTabs;

  return (
    <View
      id="list_container"
      className="topicsContainer"
    >
      <View className="tab-header">
        <ScrollView
          type={scrollViewType}
          scrollX
          enableFlex
          style={{ flexDirection: 'row' }}
          className="tab-scroll"
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
                  lineHeight: theme === "dark" ? "52rpx" : "54rpx",
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
      {activeTabs.map((tab, index) => (
        <View
          key={`${tab.type}_${tab.node || ''}_${index}`}
          className='topicPane'
          style={{ display: index === currentTabIndex ? 'block' : 'none' }}
        >
          {loadedTabs[index] && (
            <TopicList
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
