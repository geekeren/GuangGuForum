import { View, Text } from "@tarojs/components";
import { TopicDetail, URLS, urlPathVaiable } from "guanggu-forum-api";
import { usePageNavigation } from "../../../hooks/usePageScope";
import styles from "./index.module.scss";
import UserAvatar from '../../../components/UserAvatar';
import { usernameFromUserLink } from '../../../utils/aiUser';

interface Props {
  topicDetail: TopicDetail;
  desktop?: boolean;
}
const RelatingTopics = ({ topicDetail, desktop = false }: Props) => {
  const navigation = usePageNavigation();
  return (
    <View className={`${styles.content}${desktop ? ` ${styles.desktop}` : ""}`}>
      {topicDetail.relatingTopics.map((topic, index) => (
        <View
          key={index}
          className={styles.relatingTopicItem}
          onClick={async () => {
            await navigation.navigateTo({
              url: `/pages/topicDetail/index?tid=${urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid}`,
            });
          }}
        >
          <View className={styles.left}>
            <UserAvatar username={usernameFromUserLink(topic.authorLink)} src={topic.authorAvatarUrl} size={54} style={desktop ? { width: '28px', height: '28px' } : undefined} className={styles.avatar} />
          </View>
          <Text className={styles.right}>{topic.title}</Text>
        </View>
      ))}
    </View>
  );
};

export default RelatingTopics;
