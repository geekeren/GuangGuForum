import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getNodeTopics } from "guanggu-forum-api";
import { useEffect, useRef } from "react";
import { usePageScope, usePageRouter, usePageNavigation } from "../../../hooks/usePageScope";
import TopicList from "../../home/topics/topicList";
import Navbar from "../../../components/Navbar";
import "./index.scss";
import { AutoHeight } from "../../../components/AutoHeight";
import SearchEntry from "../../../components/SearchEntry";
import { decodeSearchRouteValue } from "../../../utils/searchRoute";

interface NodeTopicsProps {
  node: string;
}
const NodeTopics = (_props: NodeTopicsProps) => {
  const pageScope = usePageScope();
  const navigation = usePageNavigation();
  const router = usePageRouter();
  const node = decodeSearchRouteValue(router.params.node);
  const nodeName = decodeSearchRouteValue(router.params.nodeName);
  const listRef = useRef<TopicList>(null);

  useEffect(() => {
    const handler = () => listRef.current?.scrollToTop();
    Taro.eventCenter.on('refreshTopics', handler);
    return () => { Taro.eventCenter.off('refreshTopics', handler); };
  }, []);

  useEffect(() => {
    if (!node) {
      navigation.navigateBack().then();
      return;
    }
  }, [node]);

  if (!node) {
    return;
  }
  return (
    <View className='nodePage'>
      <Navbar title={`板块 · #${nodeName || node}`} titleStyle={{ opacity: 1 }} back home />
      <View className='nodeSearchRow'>
        <SearchEntry className='nodeSearchEntry' node={node} nodeName={nodeName} />
        <View
          className='createTopicBtn'
          onClick={() => navigation.navigateTo({ url: `/pages/createTopic/index?node=${node}` })}
        >
          <Text>发帖</Text>
        </View>
      </View>
      <AutoHeight style={{ flex: 1 }}>
        {(height) => (
          <TopicList
            pageScope={pageScope}
            ref={listRef}
            style={{ height }}
            cacheKey={`node_topics_${node}`}
            getTopics={(page, options) => {
              return getNodeTopics({
                node,
                page,
              }, options);
            }}
          />
        )}
      </AutoHeight>
    </View>
  );
};

export default NodeTopics;
