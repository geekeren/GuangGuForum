import { View } from "@tarojs/components";
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
    <View style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <View style={{ height: 40, padding: 5 }}>板块：{nodeName || ""}</View>
      <AutoHeight style={{ flex: 1 }}>
        {(height) => (
          <TopicList
            height={height}
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
