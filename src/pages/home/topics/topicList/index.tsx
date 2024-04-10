import React, { Component } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from "@tarojs/taro";
import VirtualList from '@tarojs/components/virtual-list'
import { TopicSummary, URLS } from "guanggu-forum-api";
import Loading from '../../../../components/Loading'
import './index.scss'
import { getFromLocalCache } from "../../../../utils/localAssets";
import Tag from '../../../../components/Tag';
import NodeIcon from '../../../../assets/topic_node.svg';
import CommentIcon from '../../../../assets/comment.svg';
import { urlPathVaiable } from '../../../../utils/urls';

interface ListRow {
  id: string;
  index: number;
  style: React.CSSProperties;
  data: TopicSummary[]
}

const TopicItem = React.memo(({ id, index, style, data }: ListRow) => {
  const topic = data[index];
  const { userAvatarUrl, username, title, category, link, lastUpdated, commentCount } = topic;
  const tid = urlPathVaiable(URLS.TOPIC_DETAIL)(link)?.params?.tid;

  return (
    <View
      id={id}
      key={tid}
      className='topicItem'
      style={style}
      onClick={async () => {
        await Taro.navigateTo({
          url: `/pages/topicDetail/index?tid=${tid}`
        })
      }}
    >
      <View className='line1'>
        <View className='user'>
          <View className='avatar'>
            <Image src={getFromLocalCache(userAvatarUrl)} />
          </View>
          <View className='userName'>
            {username}
          </View>
        </View>
        <View className='lastUpdateTime'>{lastUpdated.replace(' ', '')}更新</View>
      </View>
      <Text className='title' userSelect selectable>
        {title}
      </Text>
      <View className='meta'>
        <Tag>
          <Image src={NodeIcon} svg className='tagIcon' />
          <View style={{ display: 'inline-block' }}>{category}</View>
        </Tag>
        <View className='right'>
          <Image src={CommentIcon} svg className='commentIcon' />
          {commentCount === '' ? 0 : commentCount}
        </View>
      </View>
    </View>
  );
})
const rpxToPx = (rpx: number) => {
  const pixelRatio = 750 / Taro.getSystemInfoSync().windowWidth;
  return rpx / pixelRatio;
}

interface TopicListProps {
  height: number;
  version?: number; // 用于刷新数据
  getTopics: (page: number) => Promise<TopicSummary[]>
}

interface State {
  // loading: boolean;
  topics: TopicSummary[];
  loadingPage: number;
}

const topicListId = 'topicList';

export default class TopicList extends Component<TopicListProps, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      topics: [],
      loadingPage: 1,
      // loading: true,
    }
  }

  async getRecentTopics(page: number) {
   this.loading = true;
    Taro.showNavigationBarLoading();
    return await this.props.getTopics(page).finally(() => {
      this.loading = false;
      Taro.hideNavigationBarLoading();
    });
  }
  componentDidMount() {
    this.refreshTopics();
  }

  refreshTopics() {
    this.setState({
      // loading: true,
      loadingPage: 1,
    })
    this.getRecentTopics(1).then((topics) => {
      this.setState({
        topics,
      })
    });
  }

  componentWillReceiveProps(nextProps: TopicListProps) {
    if (nextProps.version !== this.props.version) {
      this.refreshTopics();
    }
  }

  loading = false
  itemSize = rpxToPx(274);

  listReachBottom() {
    this.getRecentTopics(this.state.loadingPage + 1).then(
      (newTopics) => {
        this.setState({
          topics: this.state.topics.concat(newTopics),
          loadingPage: this.state.loadingPage + 1
        })
      });
  }

  render() {
    return (
      <View style={{ position: 'relative', height: '100%'}} id={topicListId}>
        <VirtualList
          className='topicList'
          width='100%'
          height={this.props.height}
          itemData={this.state.topics}
          itemCount={this.state?.topics.length}
          itemSize={this.itemSize}
          overscanCount={5}
          onScroll={({ scrollDirection, scrollOffset }) => {
            if (
              !this.loading &&
              scrollDirection === 'forward' &&
              scrollOffset > ((this.state.topics.length - 5 - 3) * this.itemSize + 100)
            ) {
              this.listReachBottom()
            }
          }}
        >
          {TopicItem}
        </VirtualList>
        { this.loading && <Loading size={40} /> }
      </View>
    )
  }
}
