import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { getNodeTopics } from "guanggu-forum-api";
import { useEffect, useRef } from "react";
import TopicList from "../../home/topics/topicList";
import Navbar from "../../../components/Navbar";
import "./index.scss";
import { AutoHeight } from "../../../components/AutoHeight";
import SearchEntry from "../../../components/SearchEntry";
import { decodeSearchRouteValue } from "../../../utils/searchRoute";

interface NodeTopicsProps {
  node: string;
}
const NodeTopics = (props: NodeTopicsProps) => {
  const router = useRouter();
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
      Taro.navigateBack().then();
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
          onClick={() => Taro.navigateTo({ url: `/pages/createTopic/index?node=${node}` })}
        >
          <Text>发帖</Text>
        </View>
      </View>
      <AutoHeight style={{ flex: 1 }}>
        {(height) => (
          <TopicList
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
