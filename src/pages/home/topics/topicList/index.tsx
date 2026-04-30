import React, { Component, createRef } from "react";
import { Image, ScrollView, ShareElement, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TopicSummary, URLS } from "guanggu-forum-api";
import Loading from "../../../../components/Loading";
import "./index.scss";
import { getFromLocalCache } from "../../../../utils/localAssets";
import NodeIcon from "../../../../assets/topic_node.svg";
import CommentIcon from "../../../../assets/comment.svg";
import { urlPathVaiable } from "../../../../utils/urls";
import { withCache } from "../../../../utils/cacheRequest";
import PullDownRefresh, { PullDownRefreshRef } from "../../../../components/PullDownRefresh";

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
    <View
      key={tid}
      className="topicItem"
      onClick={async () => {
        await Taro.navigateTo({
          url: `/pages/topicDetail/index?tid=${tid}`,
        });
      }}
    >
      <View className="titleRow">
        <View className="title" userSelect selectable>
          <View className="categoryTag"><Image src={NodeIcon} svg className="categoryIcon" /><Text>{category}</Text></View>
          <Text>{title}</Text>
        </View>
      </View>
      <View className="meta">
        <View className="left">
          <View className="user">
            <ShareElement mapkey={`topic_avatar_${tid}`} transitionOnGesture>
              <View className="avatar">
                <Image src={getFromLocalCache(userAvatarUrl)} />
              </View>
            </ShareElement>
            <View className="userName">{username}</View>
          </View>
          <View className="lastUpdateTime">
            {lastUpdated.replace(" ", "")}更新
          </View>
        </View>
        <View className="right">
          <Image src={CommentIcon} svg className="commentIcon" />
          {commentCount === "" ? 0 : commentCount}
        </View>
      </View>
    </View>
  );
});

interface TopicListProps {
  height: number;
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
    const cacheKey = this.props.cacheKey
      ? `${this.props.cacheKey}_${page}`
      : null;
    const fetcher = () => this.props.getTopics(page);
    if (cacheKey) {
      const { cached, refresh } = withCache<TopicSummary[]>(cacheKey, fetcher);
      if (cached) {
        this.setState((prev) => ({
          topics: page === 1 ? cached : prev.topics.concat(cached),
          loadingPage: page === 1 ? 1 : page,
        }));
      }
      return refresh;
    }
    return fetcher();
  }

  componentDidMount() {
    this.refreshTopics();
  }

  componentDidUpdate(prevProps: TopicListProps) {
    if (prevProps.cacheKey !== this.props.cacheKey) {
      this.refreshTopics();
    }
  }

  refreshTopics() {
    this.loading = true;
    Taro.showNavigationBarLoading();
    this.getRecentTopics(1).then((topics) => {
      this.loading = false;
      Taro.hideNavigationBarLoading();
      this.setState({ topics, loadingPage: 1 });
    });
  }

  scrollToTop() {
    this.refreshTopics();
  }

  loading = false;

  listReachBottom() {
    if (this.state.topics.length >= 200) return;
    const page = this.state.loadingPage + 1;
    this.loading = true;
    const fetcher = () => this.props.getTopics(page);
    const cacheKey = this.props.cacheKey
      ? `${this.props.cacheKey}_${page}`
      : null;
    const doFetch = cacheKey
      ? withCache<TopicSummary[]>(cacheKey, fetcher).refresh
      : fetcher();
    doFetch.then((newTopics) => {
      this.loading = false;
      this.setState((prev) => ({
        topics: prev.topics.concat(newTopics),
        loadingPage: page,
      }));
    });
  }

  render() {
    const { topics } = this.state;
    return (
      <PullDownRefresh
        ref={this.pullDownRef}
        onRefresh={() => this.refreshTopics()}
        style={this.props.style}
      >
        {topics.length > 0 ? (
          <ScrollView
            className="topicList"
            scrollY
            enhanced
            showScrollbar
            scrollbarFadingEnabled={false}
            bounces
            style={{ height: this.props.height + "px" }}
            onScrollToLower={() => this.listReachBottom()}
            lowerThreshold={300}
            onScroll={(e: any) => {
              this.pullDownRef.current?.onScroll(e.detail.scrollTop);
            }}
            onTouchStart={(e: any) => this.pullDownRef.current?.onTouchStart(e)}
            onTouchMove={(e: any) => this.pullDownRef.current?.onTouchMove(e)}
            onTouchEnd={() => this.pullDownRef.current?.onTouchEnd()}
          >
            {topics.map((topic) => (
              <TopicItem key={urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid} topic={topic} />
            ))}
            {topics.length >= 200 && (
              <View className="listFooter">— 我是有底线的 —</View>
            )}
          </ScrollView>
        ) : (
          <View style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300rpx", color: "#999", fontSize: "28rpx" }}>
            {this.loading ? "加载中..." : "暂无数据"}
          </View>
        )}
        {this.loading && topics.length > 0 && <Loading size={40} />}
      </PullDownRefresh>
    );
  }
}
