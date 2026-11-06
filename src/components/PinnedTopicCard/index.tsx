import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { type TopicSummary, URLS } from "guanggu-forum-api";
import { urlPathVaiable } from "../../utils/urls";
import { AnnouncementArtworkUrl as AnnouncementArtworkIcon } from "gzk-ui/icon-urls";
import AnnouncementScene from "../../assets/home-announcement-scene.svg";
import "./index.scss";

export default function PinnedTopicCard({ topic }: { topic: TopicSummary }) {
  const tid = urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid;
  return (
    <View className='homeAnnouncement' onClick={() => {
      if (tid) Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
    }}>
      <Image src={AnnouncementScene} svg mode='aspectFit' className='homeAnnouncementIllustration' />
      <View className='homeAnnouncementBlend' />
      <View className='homeAnnouncementIconWrap'>
        <Image src={AnnouncementArtworkIcon} svg mode='aspectFit' className='homeAnnouncementIcon' />
      </View>
      <View className='homeAnnouncementCopy'>
        <Text className='homeAnnouncementTitle'>{topic.title}</Text>
        <Text className='homeAnnouncementSubtitle' overflow='ellipsis' maxLines={1}>
          {topic.category} · {topic.lastUpdated}更新 · {topic.commentCount === "" ? 0 : topic.commentCount} 评论
        </Text>
      </View>
    </View>
  );
}
