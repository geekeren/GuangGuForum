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
import { ScrollView, View } from "@tarojs/components";
import { rpxToPx } from "../../../utils/dimension";
import { withCache } from "../../../utils/cacheRequest";
import { fetchAndCacheNodeNavigation, getCachedNodeNavigation } from "../../../utils/nodeNavigation";

interface TabConfig {
  title: string;
  type: GetTopicsParam["type"];
  node?: string;
}

const defaultTabs: TabConfig[] = [
  { title: "最近更新", type: "default" },
  { title: "最近发布", type: "latest" },
  { title: "精华", type: "elite" },
  { title: "我的关注", type: "follows" },
];

export default function Topics() {
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [tabPaneHeight, setTabPaneHeight] = useState(400);
  const [tabs, setTabs] = useState<TabConfig[] | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Record<number, boolean>>({ 0: true });
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrollIntoView, setScrollIntoView] = useState("tab_0");
  const listRefs = useRef<Record<number, any>>({});
  const lastTapTime = useRef(0);

  useEffect(() => {
    const { cached, refresh } = withCache("hot_nodes", getHotNodes);
    const toTabs = (nodes) =>
      defaultTabs.concat(
        nodes.map((node) => {
          const nodeName = node.link?.replace("/node/", "") || "";
          return { title: node.title, type: "node" as const, node: nodeName };
        }),
      );
    if (cached) {
      setTabs(toTabs(cached));
    } else {
      refresh.then((nodes) => setTabs(toTabs(nodes)));
    }
    if (!getCachedNodeNavigation().length) {
      fetchAndCacheNodeNavigation();
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setLoadedTabs({ 0: true });
      setRefreshKey((k) => k + 1);
    };
    Taro.eventCenter.on("refreshTopics", handler);
    return () => Taro.eventCenter.off("refreshTopics", handler);
  }, []);

  useReady(() => {
    Taro.nextTick(() => {
      const query = Taro.createSelectorQuery();
      query
        .select(`#list_container`)
        .boundingClientRect((res) => {
          res?.height && setTabPaneHeight(res.height - rpxToPx(90));
        })
        .exec();
    });
  });

  const handleClick = (value: number) => {
    const now = Date.now();
    if (value === currentTabIndex && now - lastTapTime.current < 300) {
      listRefs.current[value]?.scrollToTop?.();
      setRefreshKey((k) => k + 1);
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

  const activeTabs = tabs ?? defaultTabs;

  return (
    <View
      id="list_container"
      style={{ height: "100%" }}
    >
      <View className="tab-header">
        <ScrollView
          scrollX
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
              {tab.title}
            </View>
          ))}
        </ScrollView>
      </View>
      {activeTabs.map((tab, index) => (
        <View
          key={`${tab.type}_${tab.node || ''}_${index}`}
          style={{ display: index === currentTabIndex ? 'block' : 'none', height: '100%' }}
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
              height={tabPaneHeight}
              getTopics={(page: number) => {
                if (tab.node) {
                  return getNodeTopics({ node: tab.node, page });
                }
                return getRecentTopics({ type: tab.type, page });
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}
