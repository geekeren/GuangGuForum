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
  const scrollIntoViewId = useRef("tab_0");

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
    // 缓存节点导航
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
    if (currentTabIndex !== value) {
      scrollIntoViewId.current = `tab_${value}`;
      setCurrentTabIndex(value);
      if (!loadedTabs[value]) {
        setLoadedTabs({ ...loadedTabs, [value]: true });
      }
    }
  };

  const activeTabs = tabs ?? defaultTabs;

  return (
    <View id="list_container" style={{ height: "100%" }}>
      <View className="tab-header">
        <ScrollView
          scrollX
          className="tab-scroll"
          scrollWithAnimation
          scrollIntoView={scrollIntoViewId.current}
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
      {loadedTabs[currentTabIndex] && (
        <TopicList
          key={`${activeTabs[currentTabIndex]?.node || activeTabs[currentTabIndex]?.type}_${refreshKey}`}
          style={{ marginTop: '12px' }}
          height={tabPaneHeight}
          cacheKey={
            activeTabs[currentTabIndex].node
              ? `node_topics_${activeTabs[currentTabIndex].node}`
              : `recent_topics_${activeTabs[currentTabIndex].type}`
          }
          getTopics={(page: number) => {
            const tab = activeTabs[currentTabIndex];
            if (tab.node) {
              return getNodeTopics({ node: tab.node, page });
            }
            return getRecentTopics({ type: tab.type, page });
          }}
        />
      )}
    </View>
  );
}
