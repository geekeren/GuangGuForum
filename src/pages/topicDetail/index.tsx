import { AdCustom, Button, Image, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { useEffect, useState } from "react";
import queryString from "query-string";
import { AtActionSheet, AtActionSheetItem, AtBadge } from "taro-ui"
import { createNewComment, getTopicDetail, TopicDetail } from "guanggu-forum-api";
import './index.scss';
import Loading from '../../components/Loading'
import { getFromLocalCache } from "../../utils/localAssets";
import { rpxToPx } from "../../utils/dimension";
import HtmlRender from "../../components/HtmlRender";
import Tag from '../../components/Tag';
import NodeIcon from '../../assets/topic_node.svg';
import CommentIcon from '../../assets/comment.svg';
import WechatIcon from '../../assets/wechat.svg';
import RelatingTopics from "./relatingTopics";

const Index = () => {
  const [id, setId] = useState<string>();
  const [topicDetail, setTopicDetail] = useState<TopicDetail>();
  const [isCommenting, setIsCommenting] = useState(false);
  const [isActionSheetShown, showActionSheet] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [selectedComment, setSelectedComment] = useState<TopicDetail['comments'][0]>();
  const router = useRouter();

  useEffect(() => {
    const { tid } = router.params;
    if (!tid) {
      Taro.navigateBack().then();
      return;
    }
    setId(tid);
    getTopicDetail(tid).then(setTopicDetail)
  }, [router.params]);

  const url = `${router.path}?${queryString.stringify(router.params)}`;

  useShareAppMessage(() => ({
    title: topicDetail?.title,
    path: url,
    imageUrl: topicDetail?.authorAvatarUrl
  }))

  useShareTimeline(() => ({
    title: topicDetail?.title,
    path: url,
    imageUrl: topicDetail?.authorAvatarUrl
  }))

  if (!topicDetail) {
    return <Loading />
  }

  const hasComments = topicDetail.commentTotalCount.trim() !== '';
  const hasLogin = !!topicDetail?.createCommentXSRF;

  const showCommentDialog = (config?: {
    content: string;
  }) => {
    if (!hasLogin) {
      Taro.reLaunch({
        url: `/pages/login/index?redirect=${encodeURIComponent(url)}`
      })
    } else {
      setIsCommenting(true);
      if (config?.content) {
        setCommentContent(config?.content || '')
      }
    }
  };
  return <>
    <View
      className='topicDetail'
    >
      <View className={'scrollViewContainer'}>
        <ScrollView
          scrollWithAnimation
          scrollY
          bounces
          enhanced
          bindscrolltoupper='upper'
          bindscrolltolower='lower'
          bindscroll='scroll'
          className='scrollContent'
        >
          <View className='main'>
            <View className='header'>
              <View className='title'>{topicDetail.title}</View>
              <View className='meta'>
                <View className='avatar'>
                  <Image lazyLoad src={getFromLocalCache(topicDetail.authorAvatarUrl)} />
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
                  <View className='comment-item' onClick={() => {
                    showActionSheet(true);
                    setSelectedComment(comment);
                  }}
                  >
                    <View className='comment-author-avatar'>
                      <Image lazyLoad src={getFromLocalCache(comment.authorAvatarUrl)} />
                    </View>
                    <View className='comment-right'>
                      <View className='line1'>
                        <View className='comment-author'>
                          {comment.author}
                        </View>
                        <View>
                          {
                            comment.floor
                          }
                        </View>
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
            <AdCustom
              unitId='adunit-98a34ea29ac31826'
              adIntervals={60}
              onLoad={() => console.log('ad onLoad')}
              onError={() => console.log('ad onError')}
            />
          </View>
          <View className='relatingTopics section'>
            <View className='header'>
              相关主题
            </View>
            <RelatingTopics topicDetail={topicDetail} />
          </View>
        </ScrollView>
      </View>
      <View className='actions' style={{ height: isCommenting ? rpxToPx(400) : rpxToPx(120) }}>
        {isCommenting ?
          <View style={{ display: 'block', width: '100%', height: '100%' }}>
            <View className='commentActions'>
              <View>取消</View>
              <View onClick={() => {
                id && createNewComment({
                  tid: id,
                  _xsrf: topicDetail?.createCommentXSRF,
                  content: commentContent,
                }).then()
              }}
              >发送</View>
            </View>
            <Textarea
              className='commentTextArea'
              cursorSpacing={100}
              adjustPosition
              autoFocus
              onInput={(event) => {
                setCommentContent(event.detail.value)
              }}
              value={commentContent}
              showConfirmBar={false}
              style={{ height: 100 }}
              placeholder='说点什么'
              onBlur={() => setIsCommenting(false)}
              onClick={() => {
                setIsCommenting(true)
              }}
            />
          </View> :
          <>
            <View className='left' onClick={showCommentDialog}>
              {
                hasLogin ? '说点什么' : '请登录后评论'
              }
            </View>
            <View className='right'>
              <AtBadge value={topicDetail?.comments.length} maxValue={99} className='comment'>
                <Image src={CommentIcon} svg className='commentIcon' />
              </AtBadge>
              <Button openType='share' className='share'>
                <Image src={WechatIcon} svg className='icon' />分享
              </Button>
            </View>
          </>
        }

      </View>
      <AtActionSheet
        isOpened={isActionSheetShown}
        cancelText='取消'
        onClose={() => showActionSheet(false)}
        title=''
      >
        <AtActionSheetItem onClick={() => {
          showActionSheet(false);
          showCommentDialog({
            content: `@${selectedComment?.author} `
          })
        }}
        >
          回复
        </AtActionSheetItem>
        <AtActionSheetItem onClick={() => {
          showActionSheet(false);
          Taro.setClipboardData({
            data: selectedComment?.content.trim() || '',
            success: function () {
              Taro.showToast({
                title: '评论已复制',
                icon: 'success',
                duration: 2000
              }).then()
            },
            fail: console.error
          }).catch(console.error).then();
        }}
        >
          复制
        </AtActionSheetItem>
      </AtActionSheet>
    </View>
  </>
};

export default Index;
