import { Image, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import React, { useEffect, useState } from "react";
import queryString from "query-string";
import { Buffer } from 'buffer';
import { getTopicDetail, TopicDetail } from "guanggu-forum-api";
import './index.scss';
import Loading from '../../components/Loading'
import { getFromLocalCache } from "../../utils/localAssets";
import HtmlRender from "../../components/HtmlRender";
import Tag from '../../components/Tag';
import NodeIcon from '../../assets/topic_node.svg';
import LinkIcon from '../../assets/link.svg';
import { base64Encode } from '../../utils/routes';

const Index = () => {
  const [topicDetail, setTopicDetail] = useState<TopicDetail>();
  const router = useRouter();

  useEffect(() => {
    const { id } = router.params;
    if (!id) {
      Taro.navigateBack().then();
      return;
    }
    getTopicDetail(Buffer.from(id, 'base64').toString('utf8') as string).then(setTopicDetail)
  }, [router.params]);

  const url = `${router.path}?${queryString.stringify(router.params)}`;

  useShareAppMessage(() => ({
    title: topicDetail?.title,
    path: url,
  }))

  if (!topicDetail) {
    return <Loading />
  }

  const hasComments = topicDetail.commentTotalCount.trim() !== '';

  return <ScrollView
    className='topicDetail'
    scrollY
  >
    <View className='main'>
      <View className='header'>
        <View className='title'>{topicDetail.title}</View>
        <View className='meta'>
          <View className='avatar'>
            <Image src={getFromLocalCache(topicDetail.authorAvatarUrl)} />
          </View>
          <View>
            <View className='author'>{topicDetail.author}</View>
            <View className='moreInfo'>
              <View className='createTime'>
                {topicDetail.createTime.replace(' ', '')}
              </View>
              <View>{topicDetail.viewCount.replace(' ', '')}</View>
            </View>
          </View>
        </View>
      </View>
      <View className='content'>
        <HtmlRender html={topicDetail.content} />
      </View>
      <View className='extra'>
        <View className='left'>
          <Tag>
            <Image src={NodeIcon} svg className='tagIcon' />
            <View style={{ display: 'inline-block' }}>{topicDetail.category}</View>
          </Tag>
        </View>
        <View className='right'>
          <View>{topicDetail.upVoteCount.replace(' ', '')}</View>
          <View>{topicDetail.favoriteCount.replace(' ', '')}</View>
        </View>
      </View>
    </View>
    <View className='comments section'>
      {
        hasComments ? <View className='header'>
          {topicDetail.commentTotalCount}
        </View> : '没有评论，这事儿你怎么看？'
      }
      {
        hasComments && topicDetail.comments.map((comment) => (
            <View className='comment-item'>
              <View className='comment-author-avatar'>
                <Image src={getFromLocalCache(comment.authorAvatarUrl)} />
              </View>
              <View className='comment-right'>
                <View className='comment-author'>
                  {comment.author}
                </View>
                <View className='comment-content'>
                  <Text selectable>
                    {comment.content.trim()}
                  </Text>
                </View>
                <View className='comment-meta'>
                  {comment.replyMetas.join('·').replace(/\\s/g, '')}
                </View>
              </View>
            </View>
          )
        )
      }
    </View>
    <View className='relatingTopics section'>
      <View className='header'>
        相关主题
      </View>
      <View className='content'>
        {topicDetail.relatingTopics.map((topic, index) => (
          <View
            key={index}
            className='relatingTopicItem'
            onClick={async () => {
              await Taro.navigateTo({
                url: `/pages/topicDetail/index?id=${base64Encode(topic.link)}`
              })
            }}
          >
            <Image src={LinkIcon} className='icon' />
            <View>
              {topic.title}
            </View>
          </View>
        ))}
      </View>
    </View>
  </ScrollView>
};

export default Index;
