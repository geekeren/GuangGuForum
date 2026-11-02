import { getScrollViewType } from "../../../utils/renderer";
import { useEffect, useRef, useState } from "react";
import {
  getHotNodes,
  getNodeTopics,
  getRecentTopics,
  GetTopicsParam,
} from "guanggu-forum-api";
import "./index.scss";

import TopicList from "./topicList";
import Taro, { useReady } from "@tarojs/taro";
import { ScrollView, Text, View } from "@tarojs/components";
import { rpxToPx } from "../../../utils/dimension";
import { fetchAndCacheNodeNavigation } from "../../../utils/nodeNavigation";
import { useDataWithCache } from "../../../hooks/useDataWithCache";

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

export default function Topics({ initialTab }: { initialTab?: string }) {
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [tabPaneHeight, setTabPaneHeight] = useState(400);
  const [tabs, setTabs] = useState<TabConfig[] | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Record<number, boolean>>({ 0: true });
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrollIntoView, setScrollIntoView] = useState("tab_0");
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

  useReady(() => {
    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select(`#list_container`)
        .boundingClientRect((res) => {
          res?.height && setTabPaneHeight(Math.max(0, res.height - rpxToPx(76)));
        })
        .exec();
    });
  });

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
          type={getScrollViewType()}
          scrollX
          enableFlex
          style={{ flexDirection: 'row' }}
          className="tab-scroll"
          scrollWithAnimation
          scrollIntoView={scrollIntoView}
        >
          {activeTabs.map((tab, index) => (
            <View
              id={`tab_${index}`}
              key={`${tab.type}_${tab.node || ''}_${index}`}
              className={`tab-item ${index === currentTabIndex ? 'tab-item--active' : ''}`}
              onClick={() => handleClick(index)}
            >
              <Text>{tab.title}</Text>
            </View>
          ))}
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
