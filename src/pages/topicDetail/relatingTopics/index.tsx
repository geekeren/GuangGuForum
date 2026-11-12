import { ScrollView, View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from 'react';
import { TopicDetail, URLS, urlPathVaiable } from "guanggu-forum-api";
import { usePageScrollViewType } from '../../../hooks/usePageRenderer';
import styles from "./index.module.scss";
import UserAvatar from '../../../components/UserAvatar';
import { usernameFromUserLink } from '../../../utils/aiUser';
import { isDesktopClient } from '../../../utils/desktopLayout';

interface Props {
  topicDetail: TopicDetail;
  floating?: boolean;
}
const RelatingTopics = ({ topicDetail, floating = false }: Props) => {
  const scrollViewType = usePageScrollViewType();
  // Client identity is fixed for this mounted list. Non-PC needs only the
  // outer page scroller; desktop keeps one native host across inline/rail changes.
  const [desktop] = useState(isDesktopClient);
  const rows = topicDetail.relatingTopics.map((topic, index) => (
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
            <UserAvatar username={usernameFromUserLink(topic.authorLink)} src={topic.authorAvatarUrl} size={54} className={styles.avatar} />
          </View>
          <Text className={styles.right}>{topic.title}</Text>
        </View>
      ));
  return desktop ? (
    <ScrollView className={`${styles.content}${floating ? ` ${styles.floating}` : ''}`} type={scrollViewType} scrollY={floating} enhanced showScrollbar={false}>
      {rows}
    </ScrollView>
  ) : <View className={styles.content}>{rows}</View>;
};

export default RelatingTopics;
