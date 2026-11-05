import React, { Component, createRef } from "react";
import { OpenContainer, ScrollView, ShareElement, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TopicSummary, URLS, type ApiOptions } from "guanggu-forum-api";
import { mergeTopicIndex } from "../../../../utils/topicIndex";
import Loading from "../../../../components/Loading";
import { cacheService, CacheCategory } from "../../../../utils/CacheService";
import "./index.scss";
import UserAvatar from '../../../../components/UserAvatar';
import TopicTag from "../../../../components/TopicTag";
import CommentIcon from "../../../../assets/comment.svg?raw";
import ThemedIcon from "../../../../components/ThemedIcon";
import PinnedTopicCard from "../../../../components/PinnedTopicCard";
import { splitTopicAnnouncement } from "../../../../utils/topicAnnouncement";
import { urlPathVaiable } from "../../../../utils/urls";
import PullDownRefresh, { PullDownRefreshRef } from "../../../../components/PullDownRefresh";
import { isSkyline } from "../../../../utils/renderer";
import { PageRendererContext, type PageRenderer } from "../../../../hooks/usePageRenderer";

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
                <UserAvatar username={username} src={userAvatarUrl} size={32} />
              </View>
              <Text className='userName' overflow='ellipsis' maxLines={1}>{topic.displayName?.trim() || username}</Text>
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
  getTopics: (page: number, options?: ApiOptions<TopicSummary[]>) => Promise<TopicSummary[]>;
  freshOnMount?: boolean;
  onFreshLoad?: () => void;
  onPullDownRefresh?: () => void;
}

interface State {
  topics: TopicSummary[];
  loadingPage: number;
  loading: boolean;
  scrollTop?: number;
}

export default class TopicList extends Component<TopicListProps, State> {
  static contextType = PageRendererContext;
  private readonly fallbackRenderer: PageRenderer;
  pullDownRef = createRef<PullDownRefreshRef>();
  requestRevision = 0;
  loading = true;

  constructor(props, state) {
    super(props, state);
    this.fallbackRenderer = (this.context as PageRenderer | undefined) ?? (isSkyline() ? "skyline" : "webview");
    this.state = {
      topics: [],
      loadingPage: 1,
      loading: true,
    };
  }

  componentDidMount() {
    void this.refreshTopics(this.props.freshOnMount ?? false);
  }

  componentWillUnmount() {
    this.requestRevision += 1;
  }

  componentDidUpdate(prevProps: TopicListProps) {
    if (prevProps.cacheKey !== this.props.cacheKey) {
      void this.refreshTopics(false);
    }
  }

  updateTopicIndex(topics: TopicSummary[]) {
    try {
      const entry = mergeTopicIndex(cacheService.get("topic_index"), topics);
      if (entry) cacheService.set("topic_index", entry, { category: CacheCategory.Topic, priority: "low" });
    } catch {}
  }

  async refreshTopics(fresh = true) {
    const revision = ++this.requestRevision;
    this.loading = true;
    this.setState({ loading: true });
    Taro.showNavigationBarLoading();
    let refreshed = false;
    const apply = (topics: TopicSummary[], resetScroll: boolean) => {
      if (revision !== this.requestRevision) return;
      this.updateTopicIndex(topics);
      this.setState({ topics, loadingPage: 1, ...(resetScroll ? { scrollTop: 0 } : {}) });
    };
    try {
      const topics = await this.props.getTopics(1, {
        ...(fresh ? { cache: false } : {}),
        onRefresh: (next) => { refreshed = true; apply(next, false); },
      });
      if (!refreshed) apply(topics, true);
      if (fresh && revision === this.requestRevision) this.props.onFreshLoad?.();
    } catch {
      if (revision === this.requestRevision) {
        Taro.showToast({ title: '帖子列表加载失败，请重试', icon: 'none' });
      }
    } finally {
      if (revision === this.requestRevision) {
        this.loading = false;
        this.setState({ loading: false });
        Taro.hideNavigationBarLoading();
      }
    }
  }

  scrollToTop() {
    return this.refreshTopics();
  }

  async listReachBottom() {
    if (this.loading || this.state.topics.length >= 200) return;
    const revision = ++this.requestRevision;
    const page = this.state.loadingPage + 1;
    this.loading = true;
    this.setState({ loading: true });
    try {
      const newTopics = await this.props.getTopics(page, { cache: false });
      if (revision !== this.requestRevision) return;
      this.updateTopicIndex(newTopics);
      this.setState((prev) => ({
        topics: prev.topics.concat(newTopics),
        loadingPage: page,
      }));
    } catch {
      if (revision === this.requestRevision) {
        Taro.showToast({ title: '更多帖子加载失败，请重试', icon: 'none' });
      }
    } finally {
      if (revision === this.requestRevision) {
        this.loading = false;
        this.setState({ loading: false });
      }
    }
  }

  render() {
    const skyline = ((this.context as PageRenderer | undefined) ?? this.fallbackRenderer) === "skyline";
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
            type={skyline ? 'custom' : undefined}
            className={skyline ? 'topicList topicList--skyline' : 'topicList'}
            scrollY
            scrollTop={this.state.scrollTop}
            enhanced
            showScrollbar
            scrollbarFadingEnabled={false}
            bounces
            style={scrollViewHeight ? { height: scrollViewHeight + "px" } : undefined}
            onScrollToLower={() => this.listReachBottom()}
            lowerThreshold={300}
            onScroll={(e: any) => {
              if (this.state.scrollTop !== undefined) this.setState({ scrollTop: undefined });
              this.pullDownRef.current?.onScroll(e.detail.scrollTop);
            }}
            onTouchStart={(e: any) => this.pullDownRef.current?.onTouchStart(e)}
            onTouchMove={(e: any) => this.pullDownRef.current?.onTouchMove(e)}
            onTouchEnd={(e) => this.pullDownRef.current?.onTouchEnd(e)}
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
            {this.state.loading ? (
              <Loading size={32} />
            ) : (
              <>
                <Text className='emptyTitle'>暂无话题</Text>
                <Text className='emptyDesc'>下拉刷新，看看社区的新动态</Text>
              </>
            )}
          </View>
        )}
        {this.state.loading && topics.length > 0 && <Loading size={40} />}
      </PullDownRefresh>
    );
  }
}
