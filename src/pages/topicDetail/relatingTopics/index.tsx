import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TopicDetail, URLS, urlPathVaiable } from "guanggu-forum-api";
import styles from "./index.module.scss";
import UserAvatar from '../../../components/UserAvatar';
import { usernameFromUserLink } from '../../../utils/aiUser';

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
            <UserAvatar username={usernameFromUserLink(topic.authorLink)} src={topic.authorAvatarUrl} size={44} className={styles.avatar} />
          </View>
          <Text className={styles.right}>{topic.title}</Text>
        </View>
      ))}
    </View>
  );
};

export default RelatingTopics;
