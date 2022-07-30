import { Image, RichText, ScrollView, View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { useEffect, useState } from "react";
import queryString from "query-string";
import { Buffer } from 'buffer';
import { getTopicDetail, TopicDetail } from "guanggu-forum-api";
import './index.scss';
import Loading from '../../components/Loading'

const Index = () => {
  const [topicDetail, setTopicDetail] = useState<TopicDetail>();
  const router = useRouter();

  useEffect(() => {
    const {id} = router.params;
    if (!id) {
       Taro.navigateBack().then();
       return;
    }
    getTopicDetail(Buffer.from(id, 'base64').toString('utf8') as string).then(setTopicDetail)
  }, [router.params]);

  const url = `${router.path}?${queryString.stringify(router.params)}`;

  console.log('url', url);
  useShareAppMessage(() => ({
    title: topicDetail?.title,
    path: url,
  }))

  if (!topicDetail) {
    return <Loading />
  }

  return <ScrollView
    className='topicDetail'
    scrollY
  >
    <View className='main'>
      <View className='title'>{topicDetail.title}</View>
      <RichText className='content' nodes={topicDetail.content} />
    </View>
    <View className='comments'>
      {
        topicDetail.comments.map((comment) => (
            <View className='comment-item'>
              <View className='comment-author-avatar'>
                <Image src={comment.authorAvatarUrl} />
              </View>
              <View className='comment-right'>
                <View className='comment-author'>
                  {comment.author}
                </View>
                <View className='comment-content'>
                  {comment.content}
                </View>
              </View>
            </View>
          )
        )
      }
    </View>
  </ScrollView>
};

export default Index;
