import React, { Component } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import VirtualList from "@tarojs/components/virtual-list";
import { TopicSummary, URLS } from "guanggu-forum-api";
import Loading from "../../../../components/Loading";
import "./index.scss";
import { getFromLocalCache } from "../../../../utils/localAssets";
import Tag from "../../../../components/Tag";
import NodeIcon from "../../../../assets/topic_node.svg";
import CommentIcon from "../../../../assets/comment.svg";
import { urlPathVaiable } from "../../../../utils/urls";
import { withCache } from "../../../../utils/cacheRequest";
import { rpxToPx } from "../../../../utils/dimension";

interface ListRow {
  id: string;
  index: number;
  style: React.CSSProperties;
  data: TopicSummary[];
}

const TopicItem = React.memo(({ id, index, style, data }: ListRow) => {
  const topic = data[index];
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
      id={id}
      key={tid}
      className="topicItem"
      style={style}
      onClick={async () => {
        await Taro.navigateTo({
          url: `/pages/topicDetail/index?tid=${tid}`,
        });
      }}
    >
      <View className="line1">
        <View className="user">
          <View className="avatar">
            <Image src={getFromLocalCache(userAvatarUrl)} />
          </View>
          <View className="userName">{username}</View>
        </View>
        <View className="lastUpdateTime">
          {lastUpdated.replace(" ", "")}更新
        </View>
      </View>
      <Text className="title" userSelect selectable>
        {title}
      </Text>
      <View className="meta">
        <Tag>
          <Image src={NodeIcon} svg className="tagIcon" />
          <View style={{ display: "inline-block" }}>{category}</View>
        </Tag>
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
}

interface State {
  // loading: boolean;
  topics: TopicSummary[];
  loadingPage: number;
}

const topicListId = "topicList";

export default class TopicList extends Component<TopicListProps, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      topics: [],
      loadingPage: 1,
      // loading: true,
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
        // 先用缓存立即渲染
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
    console.log('[TopicList] componentDidMount, props:', this.props.cacheKey, 'height:', this.props.height);
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
      console.log('[TopicList] refreshTopics got topics:', topics?.length, topics?.[0]);
      this.setState({ topics, loadingPage: 1 }, () => {
        console.log('[TopicList] state after refresh:', this.state.topics.length, 'height:', this.props.height);
      });
    });
  }

  loading = false;
  // 卡片高度（rpx）:
  // 28(顶 padding) + 56(头像行) + 20 + 93(标题2行) + 20 + 50(meta) + 28(底 padding) = 295
  // + 16 卡片间距 ≈ 311rpx
  itemSize = rpxToPx(305);

  listReachBottom() {
    const page = this.state.loadingPage + 1;
    this.loading = true;
    this.getRecentTopics(page).then((newTopics) => {
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
      <View style={{ position: "relative", flex: 1, overflow: "hidden", ...this.props.style }} id={topicListId}>
        {topics.length > 0 ? (
          <VirtualList
            className="topicList"
            width="100%"
            height={this.props.height}
            itemData={topics}
            itemCount={topics.length}
            itemSize={this.itemSize}
            overscanCount={5}
            onScroll={({ scrollDirection, scrollOffset }) => {
              if (
                !this.loading &&
                scrollDirection === "forward" &&
                scrollOffset >
                  (topics.length - 5 - 3) * this.itemSize + 100
              ) {
                this.listReachBottom();
              }
            }}
          >
            {TopicItem}
          </VirtualList>
        ) : (
          <View style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300rpx", color: "#999", fontSize: "28rpx" }}>
            {this.loading ? "加载中..." : "暂无数据"}
          </View>
        )}
        {this.loading && topics.length > 0 && <Loading size={40} />}
      </View>
    );
  }
}
