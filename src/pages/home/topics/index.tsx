import { Component, useEffect, useState } from "react";
import { AtTabs, AtTabsPane } from "taro-ui";
import {
  getHotNodes,
  getRecentTopics,
  GetTopicsParam,
} from "guanggu-forum-api";
import "./index.scss";

import TopicList from "./topicList";
import Taro, { useReady } from "@tarojs/taro";
import { View } from "@tarojs/components";
import { rpxToPx } from "../../../utils/dimension";

interface TopicsProps {}

interface State {
  current: number;
  tabPaneHeight: number;
  tabsConfig: {
    title: string;
    type: GetTopicsParam["type"];
    version: number;
  }[];
}

const getVersion = () => {
  return Math.floor(new Date().getTime() / 5000);
};
const defaultTabs: { title: string; type: GetTopicsParam["type"] }[] = [
  { title: "最近更新", type: "default" },
  { title: "最近发布", type: "latest" },
  { title: "精华", type: "elite" },
  { title: "我的关注", type: "follows" },
];

export default function Topics() {
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [tabPaneHeight, setTabPaneHeight] = useState(400);
  const [tabs, setTabs] = useState(defaultTabs);

  const tabsConfig = tabs.map((tab) => ({
    ...tab,
    version: getVersion(),
  }));

  const handleClick = (value: number) => {
    if (currentTabIndex !== value) {
      const tab = tabsConfig[value];
      tab.version = getVersion();
      setCurrentTabIndex(value);
    }
  };

  useEffect(() => {
    getHotNodes().then((nodes) => {
      setTabs(
        defaultTabs.concat(
          nodes.map((node) => ({
            title: node.title,
            type: "default",
          })),
        ),
      );
    });
  }, []);
  useReady(() => {
    Taro.nextTick(() => {
      const query = Taro.createSelectorQuery();
      query
        .select(`#list_container`)
        .boundingClientRect((res) => {
          console.log("list_container", res);
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
        tabList={tabs.map(({ title }) => ({
          title,
        }))}
        onClick={handleClick}
      >
        {tabsConfig.map((tab, index) => (
          <AtTabsPane key={tab.type} current={currentTabIndex} index={index}>
            <TopicList
              height={tabPaneHeight}
              type={tab.type}
              getTopics={(page: number) => {
                return getRecentTopics({
                  type: tab.type,
                  page,
                });
              }}
              version={tab.version}
            />
          </AtTabsPane>
        ))}
      </AtTabs>
    </View>
  );
}
