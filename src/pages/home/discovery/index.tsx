import { getScrollViewType } from "../../../utils/renderer";
import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { getDiscoveryData, HotTopic } from "guanggu-forum-api";
import { getCachedUsername } from "../../../utils/currentUser";
import { getFromLocalCache } from "../../../utils/localAssets";
import { getHotTopicPage, loadDiscoveryTopicMetadata, startHotTopicRotation } from "../../../utils/discoveryTopics";
import { fetchAndCacheNodeNavigation, getCachedNodeNavigation } from "../../../utils/nodeNavigation";
import { useDataWithCache } from "../../../hooks/useDataWithCache";
import { isSkyline } from "../../../utils/renderer";
import LoginPrompt from "../../../components/LoginPrompt";
import NodePicker from "../../../components/NodePicker";
import Loading from "../../../components/Loading";
import TopicTag from "../../../components/TopicTag";
import Scene from "../../../assets/discovery-scene.svg?raw";
import { useTheme } from "../../../hooks/useTheme";
import { discoverySceneSource } from "../../../utils/discoveryScene";
import TrendIcon from "../../../assets/discovery-trend.svg";
import FlameIcon from "../../../assets/discovery-flame.svg";
import HeartIcon from "../../../assets/discovery-heart.svg";
import WaterIcon from "../../../assets/discovery-node-water.svg";
import WorkIcon from "../../../assets/discovery-node-work.svg";
import CodeIcon from "../../../assets/discovery-node-code.svg";
import HouseIcon from "../../../assets/discovery-node-house.svg";
import CarIcon from "../../../assets/discovery-node-car.svg";
import ChatIcon from "../../../assets/discovery-node-chat.svg";
import FoodIcon from "../../../assets/discovery-node-food.svg";
import CityIcon from "../../../assets/discovery-node-city.svg";
import "./index.scss";

interface DiscoveryProps {
  active?: boolean;
}

const nodeIcons: Record<string, string> = {
  "汤逊湖": WaterIcon, "找工作": WorkIcon, "IT技术": CodeIcon, "楼市房产": HouseIcon,
  "汽车": CarIcon, "生活杂谈": ChatIcon, "美食": FoodIcon, "城市建设": CityIcon,
};
const openTopic = (link: string) => {
  const tid = link.match(/^\/t\/(\d+)(?:[?#].*)?$/)?.[1];
  if (tid) Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
};
const openNode = (slug: string, name: string) => Taro.navigateTo({
  url: `/pages/node/topicList/index?node=${encodeURIComponent(slug)}&nodeName=${encodeURIComponent(name)}`,
});

const Discovery = ({ active = false }: DiscoveryProps) => {
  const { theme } = useTheme();
  const scene = useMemo(() => discoverySceneSource(Scene, theme), [theme]);
  const { data: discoveryData, loading, request: fetchDiscovery } = useDataWithCache(getDiscoveryData);
  const isLoggedIn = !!getCachedUsername() && !discoveryData?.interestLoginRequired;
  const hotTopics = discoveryData?.hotTopics;
  const hotNodes = discoveryData?.hotNodes || [];
  const interestTopics = discoveryData?.interestTopics || [];
  const [hotPage, setHotPage] = useState(0);
  const [hotFadingOut, setHotFadingOut] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, Pick<HotTopic, "category" | "commentCount">>>({});
  const [error, setError] = useState(false);
  const [showNodes, setShowNodes] = useState(false);
  const [groups, setGroups] = useState(getCachedNodeNavigation);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState("");

  const refresh = () => {
    setError(false);
    return fetchDiscovery().catch(() => setError(true));
  };
  useEffect(() => {
    if (!active) return;
    setError(false);
    fetchDiscovery().catch(() => setError(true));
  }, [active, fetchDiscovery]);

  useEffect(() => {
    setHotPage(0);
    setMetadata({});
  }, [hotTopics]);

  useEffect(() => {
    if (!active || !hotTopics?.length) return;
    return loadDiscoveryTopicMetadata(hotTopics, (link, details) => {
      setMetadata(previous => ({ ...previous, [link]: details }));
    });
  }, [active, hotTopics]);

  useEffect(() => {
    setHotFadingOut(false);
    return startHotTopicRotation(
      () => {
        setHotPage(page => (page + 1) % Math.ceil((hotTopics?.length || 0) / 5));
        setHotFadingOut(false);
      },
      hotTopics?.length || 0,
      active,
      () => setHotFadingOut(true),
    );
  }, [active, hotTopics]);

  const loadNodes = () => {
    setNodesLoading(true);
    setNodesError("");
    fetchAndCacheNodeNavigation().then(setGroups).catch(() => setNodesError("板块加载失败，请重试"))
      .finally(() => setNodesLoading(false));
  };

  const visibleTopics = getHotTopicPage(hotTopics || [], hotPage);

  return (
    <View className={isSkyline() ? "discoveryPage discoveryPage--skyline" : "discoveryPage"} style={{ height: "100%" }}>
      <ScrollView type={getScrollViewType()} scrollY enhanced className='discoveryScroll'>
        <View className='discoveryHero'>
          <Image src={scene} svg mode='aspectFit' className='discoveryHeroScene' />
          <View className='discoveryHeroBlend' />
          <View className='discoveryHeroCopy'>
            <Text className='discoveryHeroTitle'>来过早客，聊武汉</Text>
            <Text className='discoveryHeroSubtitle'>工作 · 生活 · 买房 · 出行 · 吃喝玩乐</Text>
          </View>
        </View>

        <View className='section section-hotTopics'>
          <View className='sectionHeader'>
            <Image src={TrendIcon} svg mode='aspectFit' className='sectionIcon' />
            <Text className='sectionTitle'>热门讨论</Text>
          </View>
          <View className='hotTopicsList'>
            {visibleTopics.map(({ topic, rank }, index) => {
              const details = { ...topic, ...metadata[topic.topicLink] };
              return (
                <View key={`${hotPage}_${topic.topicLink}`} className={`hotTopicItem hotTopicItem--${hotFadingOut ? "exit" : "enter"} hotTopicItem--delay-${index}`} onClick={() => { if (!hotFadingOut) openTopic(topic.topicLink); }}>
                  <View className={`discoveryRank${rank <= 3 ? ` discoveryRank--${rank}` : ""}`}>
                    <Text className='discoveryRankText'>{rank}</Text>
                  </View>
                  <View className='hotTopicMain'>
                    <Text className='hotTopicTitle' overflow='ellipsis' maxLines={1}>{topic.title}</Text>
                    <Text className='hotTopicMeta' overflow='ellipsis' maxLines={1}>
                      {details.category || "板块加载中"}{details.commentCount !== undefined ? ` · ${details.commentCount || "0"} 条评论` : ""}
                    </Text>
                  </View>
                </View>
              );
            })}
            {!hotTopics?.length && (loading ? <Loading size={32} /> : (
              <Text className='discoveryStatus' onClick={error ? refresh : undefined}>{error ? "加载失败，点击重试" : "暂无热门讨论"}</Text>
            ))}
          </View>
        </View>

        <View className='section section-hotNodes'>
          <View className='sectionHeader'>
            <Image src={FlameIcon} svg mode='aspectFit' className='sectionIcon' />
            <Text className='sectionTitle'>热门板块</Text>
            <View className='sectionMore' onClick={() => { setShowNodes(true); if (!groups.length) loadNodes(); }}>
              <Text>查看全部</Text><View className='sectionChevron sectionChevron--down' />
            </View>
          </View>
          <View className='hotNodesGrid'>
            {hotNodes.slice(0, 8).map(node => {
              const slug = node.link?.match(/^\/node\/([^?#/]+)/)?.[1];
              return (
                <View key={node.link} className='hotNodeTag' onClick={() => { if (slug) openNode(slug, node.title); }}>
                  <Image src={nodeIcons[node.title] || WaterIcon} svg mode='aspectFit' className='hotNodeIcon' />
                  <Text className='hotNodeText' overflow='ellipsis' maxLines={1}>{node.title}</Text>
                </View>
              );
            })}
          </View>
          {!hotNodes.length && <Text className='discoveryStatus'>{loading ? "正在加载板块…" : "暂无热门板块"}</Text>}
        </View>

        <View className='section section-interest'>
          <View className='sectionHeader'>
            <Image src={HeartIcon} svg mode='aspectFit' className='sectionIcon' />
            <Text className='sectionTitle'>我的关注</Text>
            {isLoggedIn && <View className='sectionMore' onClick={() => Taro.navigateTo({ url: "/pages/home/index?tab=0&topicTab=interest" })}>
              <Text>查看更多</Text><View className='sectionChevron sectionChevron--purple' />
            </View>}
          </View>
          {isLoggedIn ? (
            <View className='interestList'>
              {interestTopics.slice(0, 10).map(topic => (
                <View key={topic.topicLink} className='interestItem' onClick={() => openTopic(topic.topicLink)}>
                  <Image src={getFromLocalCache(topic.userAvatarUrl)} svg={topic.userAvatarUrl?.endsWith('/m_default.png')} className='interestAvatar' mode='aspectFill' />
                  <View className='interestMain'>
                    <Text className='interestTitle' overflow='ellipsis' maxLines={1}>{topic.title}</Text>
                    <View className='interestMeta'>
                      <TopicTag label={topic.category} onClick={event => {
                        event.stopPropagation();
                        const slug = topic.categoryLink?.match(/^\/node\/([^?#/]+)/)?.[1];
                        if (slug) openNode(slug, topic.category);
                      }} />
                      <Text className='interestTime' overflow='ellipsis' maxLines={1}>{topic.lastTouched} · {topic.commentCount || "0"} 评论</Text>
                    </View>
                  </View>
                </View>
              ))}
              {!interestTopics.length && <Text className='discoveryStatus' onClick={discoveryData?.interestError || error ? refresh : undefined}>{loading ? "正在加载关注…" : discoveryData?.interestError || error ? "关注加载失败，点击重试" : "暂无关注更新"}</Text>}
            </View>
          ) : <LoginPrompt icon='关注' title='登录查看我的关注' desc='关注感兴趣的板块，获取最新动态' />}
        </View>
        <View className='sectionBottomSpace' />
      </ScrollView>
      <NodePicker visible={showNodes} groups={groups} selectedSlug='' loading={nodesLoading} error={nodesError}
        onRetry={loadNodes} onClose={() => setShowNodes(false)} onSelect={slug => {
          setShowNodes(false);
          const node = groups.flatMap(group => group.nodes).find(item => item.slug === slug);
          if (node) openNode(slug, node.name);
        }} />
    </View>
  );
};

export default Discovery;
