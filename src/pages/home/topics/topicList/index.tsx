import { getScrollViewType } from "../../../../utils/renderer";
import React, { Component, createRef } from "react";
import { Image, OpenContainer, ScrollView, ShareElement, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TopicSummary, URLS } from "guanggu-forum-api";
import Loading from "../../../../components/Loading";
import { cacheService, CacheCategory } from "../../../../utils/CacheService";
import "./index.scss";
import { getFromLocalCache } from "../../../../utils/localAssets";
import TopicTag from "../../../../components/TopicTag";
import CommentIcon from "../../../../assets/comment.svg?raw";
import ThemedIcon from "../../../../components/ThemedIcon";
import PinnedTopicCard from "../../../../components/PinnedTopicCard";
import { splitTopicAnnouncement } from "../../../../utils/topicAnnouncement";
import { urlPathVaiable } from "../../../../utils/urls";
import PullDownRefresh, { PullDownRefreshRef } from "../../../../components/PullDownRefresh";
import { isSkyline } from "../../../../utils/renderer";

const TopicItem = React.memo(({ topic }: { topic: TopicSummary }) => {
  const {
    userAvatarUrl,
    username,
    title,
    category,
    link,
    lastUpdated,
    commentCount,
  } = topic;
  const tid = urlPathVaiable(URLS.TOPIC_DETAIL)(link)?.params?.tid;

  return (
    <OpenContainer
      key={tid}
      className='topicContainer'
      closeBorderRadius={12}
      openBorderRadius={0}
      transitionDuration={350}
      openColor='transparent'
      onClick={async () => {
        await Taro.navigateTo({
          url: `/pages/topicDetail/index?tid=${tid}`,
        });
      }}
      transitionType='fade'
      closedColor='transparent'
      closedElevation={0}
      middleColor='transparent'
      openElevation={0}
    >
      <View className='topicItem'>
        <View className='titleRow'>
          <View className='titleContent'>
            <ShareElement className='titleShare' mapkey={`topic_title_${tid}`}>
              <Text className='title' overflow='ellipsis' maxLines={2}>{title}</Text>
            </ShareElement>
          </View>
        </View>
        <View className='meta'>
          <View className='left'>
            <TopicTag label={category} announcement={category === "公告"} />
            <View className='user'>
              <View className='avatar'>
                <Image src={getFromLocalCache(userAvatarUrl)} svg={userAvatarUrl?.endsWith('/m_default.png')} />
              </View>
              <Text className='userName' overflow='ellipsis' maxLines={1}>{username}</Text>
            </View>
            <Text className='lastUpdateTime' overflow='ellipsis' maxLines={1}>{lastUpdated}更新</Text>
          </View>
          <View className='right'>
            <ThemedIcon src={CommentIcon} tone='muted' lightColor='#000000' className='commentIcon' />
            <Text className='commentCount'>
              {commentCount === "" ? 0 : commentCount}
            </Text>
          </View>
        </View>
      </View>
    </OpenContainer>
  );
});

interface TopicListProps {
  cacheKey?: string;
  style?: React.CSSProperties;
  getTopics: (page: number) => Promise<TopicSummary[]>;
  onPullDownRefresh?: () => void;
}

interface State {
  topics: TopicSummary[];
  loadingPage: number;
}

export default class TopicList extends Component<TopicListProps, State> {
  pullDownRef = createRef<PullDownRefreshRef>();

  constructor(props, state) {
    super(props, state);
    this.state = {
      topics: [],
      loadingPage: 1,
    };
  }

  getRecentTopics(page: number): Promise<TopicSummary[]> {
    return this.props.getTopics(page);
  }

  componentDidMount() {
    console.time("[TopicList] request -> render");
    this.refreshTopics();
  }

  componentDidUpdate(prevProps: TopicListProps) {
    if (prevProps.cacheKey !== this.props.cacheKey) {
      this.refreshTopics();
    }
  }

  updateTopicIndex(topics: TopicSummary[]) {
    try {
      const existing = cacheService.get<TopicSummary[]>("topic_index") || [];
      const map = new Map(existing.map((t) => [t.link, t]));
      for (const t of topics) map.set(t.link, t);
      const all = Array.from(map.values());
      cacheService.set("topic_index", all, { category: CacheCategory.Topic, priority: "low" });
    } catch {}
  }

  refreshTopics() {
    this.loading = true;
    Taro.showNavigationBarLoading();
    console.time("[TopicList] request only");
    this.getRecentTopics(1).then((topics) => {
      console.timeEnd("[TopicList] request only");
      this.loading = false;
      this.updateTopicIndex(topics);
      this.setState({ topics, loadingPage: 1 }, () => {
        console.timeEnd("[TopicList] request -> render");
      });
    });
  }

  scrollToTop() {
    this.refreshTopics();
  }

  loading = true;

  listReachBottom() {
    if (this.state.topics.length >= 200) return;
    const page = this.state.loadingPage + 1;
    this.loading = true;
    this.props.getTopics(page).then((newTopics) => {
      this.loading = false;
      this.updateTopicIndex(newTopics);
      this.setState((prev) => ({
        topics: prev.topics.concat(newTopics),
        loadingPage: page,
      }));
    });
  }

  render() {
    const { topics } = this.state;
    const { announcement, topics: regularTopics } = splitTopicAnnouncement(topics);
    const scrollViewHeight = this.props.style?.height;
    return (
      <PullDownRefresh
        ref={this.pullDownRef}
        onRefresh={() => this.refreshTopics()}
        style={this.props.style}
      >
        {topics.length > 0 ? (
          <ScrollView
            type={getScrollViewType()}
            className={isSkyline() ? 'topicList topicList--skyline' : 'topicList'}
            scrollY
            enhanced
            showScrollbar
            scrollbarFadingEnabled={false}
            bounces
            style={scrollViewHeight ? { height: scrollViewHeight + "px" } : undefined}
            onScrollToLower={() => this.listReachBottom()}
            lowerThreshold={300}
            onScroll={(e: any) => {
              this.pullDownRef.current?.onScroll(e.detail.scrollTop);
            }}
            onTouchStart={(e: any) => this.pullDownRef.current?.onTouchStart(e)}
            onTouchMove={(e: any) => this.pullDownRef.current?.onTouchMove(e)}
            onTouchEnd={() => this.pullDownRef.current?.onTouchEnd()}
          >
            <View className='topicListTopSpacer' />
            {announcement && <PinnedTopicCard topic={announcement} />}
            {regularTopics.map((topic) => (
              <TopicItem key={urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid} topic={topic} />
            ))}
            {topics.length >= 200 && (
              <View className='listFooter'><Text>— 我是有底线的 —</Text></View>
            )}
          </ScrollView>
        ) : (
          <View className='topicListEmpty'>
            {this.loading ? (
              <Loading size={32} />
            ) : (
              <>
                <Text className='emptyTitle'>暂无话题</Text>
                <Text className='emptyDesc'>下拉刷新，看看社区的新动态</Text>
              </>
            )}
          </View>
        )}
        {this.loading && topics.length > 0 && <Loading size={40} />}
      </PullDownRefresh>
    );
  }
}
