import React, { Component } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from "@tarojs/taro";
import url from "url";
import VirtualList from '@tarojs/components/virtual-list'
import { getRecentTopics, GetTopicsParam, TopicSummary } from "guanggu-forum-api";
import Loading from '../../../../components/Loading'
import './index.scss'
import { getFromLocalCache } from "../../../../utils/localAssets";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from '../../../config';
import Tag from '../../../../components/Tag';
import NodeIcon from '../../../../assets/topic_node.svg';
import CommentIcon from '../../../../assets/comment.svg';
import { base64Encode } from '../../../../utils/routes';
import { urlPathVaiable } from '../../../../utils/urls';
import { URLS } from 'guanggu-forum-api';

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
      className='topicItem'
      style={style}
      onClick={async () => {
        await Taro.navigateTo({
          url: `/pages/topicDetail/index?id=${base64Encode(link)}&tid=${tid}`
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
  type: GetTopicsParam['type']
}

interface State {
  topics: TopicSummary[];
  loadingPage: number;
}

export default class TopicList extends Component<TopicListProps, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      topics: [],
      loadingPage: 1,
    }
  }

  componentWillMount() {
    const { type } = this.props;
    getRecentTopics({ type, page: 1 }).then((topics) => {
      this.setState({
        topics,
      })
    })
  }

  loading = false

  listReachBottom() {
    this.loading = true
    getRecentTopics({
      type: this.props.type, page: this.state.loadingPage + 1
    }).then(
      (newTopics) => {
        this.loading = false
        this.setState({
          topics: this.state.topics.concat(newTopics),
          loadingPage: this.state.loadingPage + 1
        })
      });
  }

  itemSize = rpxToPx(300);

  render() {
    if (!this.state?.topics) {
      return <Loading />;
    }
    return (
      <VirtualList
        className='.topicList'
        width='100%'
        height={Taro.getSystemInfoSync().windowHeight - (HIDE_TAB ? 52 : 150) - (ENABLE_CUSTOM_NAVBAR ? 70 : 0)}
        itemData={this.state.topics}
        itemCount={this.state?.topics.length}
        itemSize={this.itemSize}
        overscanCount={10}
        onScroll={({ scrollDirection, scrollOffset }) => {
          if (
            !this.loading &&
            scrollDirection === 'forward' &&
            scrollOffset > ((this.state.topics.length - 5) * this.itemSize)
          ) {
            this.listReachBottom()
          }
        }}
      >
        {TopicItem}
      </VirtualList>
    )
  }
}
