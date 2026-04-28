import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useRouter } from "@tarojs/taro";
import { getNodeTopics } from "guanggu-forum-api";
import { useEffect } from "react";
import TopicList from "../../home/topics/topicList";
import "./index.scss";
import { AutoHeight } from "../../../components/AutoHeight";

interface NodeTopicsProps {
  node: string;
}
const NodeTopics = (props: NodeTopicsProps) => {
  const router = useRouter();
  const { node, nodeName } = router.params;

  useEffect(() => {
    if (!node) {
      Taro.navigateBack().then();
      return;
    }
  }, [router.params]);

  if (!node) {
    return;
  }
  return (
    <View className="nodePage">
      <View className="nodeHeader">
        <View className="iconBlock"># </View>
        <View className="nodeMeta">
          <Text className="nodeName">{nodeName || node}</Text>
          <View className="nodeSub">板块 · 来自过早客</View>
        </View>
        <View
          className="createTopicBtn"
          onClick={() => Taro.navigateTo({ url: `/pages/createTopic/index?node=${node}` })}
        >
          发帖
        </View>
      </View>
      <AutoHeight style={{ flex: 1 }}>
        {(height) => (
          <TopicList
            height={height}
            cacheKey={`node_topics_${node}`}
            getTopics={(page: number) => {
              return getNodeTopics({
                node,
                page,
              });
            }}
            version={0}
          />
        )}
      </AutoHeight>
    </View>
  );
};

export default NodeTopics;
