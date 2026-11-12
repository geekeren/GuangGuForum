import { ScrollView, View, Text } from "@tarojs/components";
import { HotFlame, ChevronRight } from "gzk-ui/icons";
import { usePageNavigation } from "../../hooks/usePageScope";
import { usePageScrollViewType } from "../../hooks/usePageRenderer";
import ThemedIcon from "../../components/ThemedIcon";
import { useDesktopCommunity } from "./useDesktopCommunity";
import "./desktop.scss";

export default function DesktopSidebar({ active, onDiscovery }: { active: boolean; onDiscovery: () => void }) {
  const navigation = usePageNavigation();
  const type = usePageScrollViewType();
  const { topics, loading, topicsError, retry } = useDesktopCommunity(active);
  return <ScrollView type={type} scrollY enhanced showScrollbar={false} className='homeDesktopSidebarScroll'>
    <View className='homeDesktopSidebarCard'>
      <View className='homeDesktopSidebarHeader'>
        <ThemedIcon src={HotFlame} tone='accent' className='homeDesktopSidebarIcon' /><Text>热门讨论</Text>
        <View className='homeDesktopSidebarMore' ariaRole='button' ariaLabel='查看更多热门讨论' onClick={onDiscovery}><Text>更多</Text><ThemedIcon src={ChevronRight} tone='muted' className='homeDesktopChevron' /></View>
      </View>
      {topics.slice(0, 8).map((topic, index) => <View key={topic.topicLink} className='homeDesktopHotTopic' ariaRole='button' ariaLabel={topic.title} onClick={() => {
        const tid = topic.topicLink.match(/^\/t\/(\d+)(?:[?#].*)?$/)?.[1];
        if (tid) void navigation.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
      }}
      >
        <Text className={`homeDesktopRank${index < 3 ? " homeDesktopRank--top" : ""}`}>{index + 1}</Text>
        <View className='homeDesktopHotTopicCopy'>
          <Text className='homeDesktopHotTopicTitle' overflow='ellipsis' maxLines={2}>{topic.title}</Text>
          {(topic.category || topic.commentCount) && <Text className='homeDesktopHotTopicMeta'>{[topic.category, topic.commentCount !== undefined && topic.commentCount !== "" ? `${topic.commentCount} 条评论` : ""].filter(Boolean).join(" · ")}</Text>}
        </View>
      </View>)}
      {topicsError ? <Text className='homeDesktopSidebarStatus' onClick={retry}>讨论加载失败，点击重试</Text> : !topics.length && <Text className='homeDesktopSidebarStatus'>{loading ? "正在加载热门讨论…" : "暂无热门讨论"}</Text>}
    </View>
    <Text className='homeDesktopCommunityNote'>武汉本地生活社区 · 过早客</Text>
  </ScrollView>;
}
