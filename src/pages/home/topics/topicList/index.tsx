import React, { Component } from 'react'
import { Image, View } from '@tarojs/components'
import Taro from "@tarojs/taro";
import { AtTag } from 'taro-ui'
import { Buffer } from 'buffer';
import VirtualList from '@tarojs/components/virtual-list'
import { getRecentTopics, GetTopicsParam, TopicSummary } from "guanggu-forum-api";
import Loading from '../../../../components/Loading'
import './index.scss'

interface State {
  topics: TopicSummary[];
}

interface ListRow {
  id: string;
  index: number;
  style: React.CSSProperties;
  data: TopicSummary[]
}

const ItemWrapper = ({children, ...rest}: any) => {
  return <View {...rest} className='itemWrapper'>
    {
      children
    }
  </View>
}

const TopicItem = React.memo(({id, index, style, data}: ListRow) => {
  const topic = data[index];
  const {userAvatarUrl, username, title, category, link, lastUpdated} = topic;
  return (
    <View
      id={id}
      className='topicItem'
      style={style}
      onClick={async () => {
        await Taro.navigateTo({
          url: `/pages/topicDetail/index?id=${Buffer.from(link, 'utf-8').toString('base64')}`
        })
      }}
    >
      <View className='line1'>
        <View className='user'>
          <View className='avatar'>
            <Image src={userAvatarUrl}/>
          </View>
          <View className='userName'>
            {username}
          </View>
        </View>
        <View className='lastUpdateTime'>最后更新：{lastUpdated}</View>
      </View>
      <View className='title'>
        {title}
      </View>
      <View className='meta'>
        <AtTag size='small' name={category}>
          #{category}
        </AtTag>
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

export default class TopicList extends Component<TopicListProps, State> {

  componentWillMount() {
    const { type } = this.props;
    getRecentTopics({ type }).then((topics) => {
      this.setState({
        topics,
      })
    })
  }

  render() {
    if (!this.state?.topics) {
      return <Loading />;
    }
    return (
      <VirtualList
        className='.topicList'
        width='100%'
        height={Taro.getSystemInfoSync().windowHeight - 180}
        itemData={this.state.topics}
        itemCount={this.state?.topics.length}
        itemSize={rpxToPx(250)}
        innerElementType={ItemWrapper}
      >
        {TopicItem}
      </VirtualList>
    )
  }
}
