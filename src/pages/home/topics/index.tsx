import { Component, useEffect, useState } from "react";
import { AtTabs, AtTabsPane } from "taro-ui";
import {
  getHotNodes,
  getNodeTopics,
  getRecentTopics,
  GetTopicsParam,
} from "guanggu-forum-api";
import "./index.scss";

import TopicList from "./topicList";
import Taro, { useReady } from "@tarojs/taro";
import { View } from "@tarojs/components";
import { rpxToPx } from "../../../utils/dimension";
import { withCache } from "../../../utils/cacheRequest";

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
  const [tabs, setTabs] = useState<TabConfig[]>(defaultTabs);
  const [loadedTabs, setLoadedTabs] = useState<Set<number>>(new Set([0]));

  const handleClick = (value: number) => {
    if (currentTabIndex !== value) {
      setCurrentTabIndex(value);
      setLoadedTabs((prev) => new Set(prev).add(value));
    }
  };

  useEffect(() => {
    const { cached, refresh } = withCache("hot_nodes", getHotNodes);
    const toTabs = (nodes) =>
      defaultTabs.concat(
        nodes.map((node) => {
          const nodeName = node.link?.replace("/node/", "") || "";
          return { title: node.title, type: "node" as const, node: nodeName };
        }),
      );
    if (cached) setTabs(toTabs(cached));
    refresh.then((nodes) => setTabs(toTabs(nodes)));
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

  return (
    <View id="list_container" style={{ height: "100%" }}>
      <AtTabs
        scroll={true}
        current={currentTabIndex}
        tabList={tabs.map(({ title }) => ({ title }))}
        onClick={handleClick}
      >
        {tabs.map((tab, index) => (
          <AtTabsPane key={`${tab.type}_${tab.node || ''}_${index}`} current={currentTabIndex} index={index}>
            {loadedTabs.has(index) && (
              <TopicList
                height={tabPaneHeight}
                cacheKey={
                  tab.node
                    ? `node_topics_${tab.node}`
                    : `recent_topics_${tab.type}`
                }
                getTopics={(page: number) => {
                  if (tab.node) {
                    return getNodeTopics({ node: tab.node, page });
                  }
                  return getRecentTopics({ type: tab.type, page });
                }}
              />
            )}
          </AtTabsPane>
        ))}
      </AtTabs>
    </View>
  );
}
