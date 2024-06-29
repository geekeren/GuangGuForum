import { Image, View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TopicDetail, URLS } from "guanggu-forum-api";
import styles from "./index.module.scss";
import { urlPathVaiable } from "guanggu-forum-api";

interface Props {
  topicDetail: TopicDetail;
}
const RelatingTopics = ({ topicDetail }: Props) => {
  return (
    <View className={styles.content}>
      {topicDetail.relatingTopics.map((topic, index) => (
        <View
          key={index}
          className={styles.relatingTopicItem}
          onClick={async () => {
            await Taro.navigateTo({
              url: `/pages/topicDetail/index?tid=${urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid}`,
            });
          }}
        >
          <View className={styles.left}>
            <Image src={topic.authorAvatarUrl} className={styles.avatar} />
          </View>
          <View className={styles.right}>{topic.title}</View>
        </View>
      ))}
    </View>
  );
};

export default RelatingTopics;
