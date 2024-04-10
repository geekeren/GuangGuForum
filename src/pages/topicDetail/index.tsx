import { AdCustom, Button, Image, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { useEffect, useState } from "react";
import queryString from "query-string";
import { AtActionSheet, AtActionSheetItem, AtBadge } from "taro-ui"
import { commentUpvote, createNewComment, getTopicDetail, TopicDetail, urlPathVaiable, URLS } from "guanggu-forum-api";
import './index.scss';
import Loading from '../../components/Loading'
import { getFromLocalCache } from "../../utils/localAssets";
import { rpxToPx } from "../../utils/dimension";
import HtmlRender from "../../components/HtmlRender";
import Tag from '../../components/Tag';
import Icon from '../../components/Icon';
import NodeIcon from '../../assets/topic_node.svg';
import CommentIcon from '../../assets/comment.svg';
import WechatIcon from '../../assets/wechat.svg';
import RelatingTopics from "./relatingTopics";

const Index = () => {
  const [id, setId] = useState<string>();
  const [refreshTime, setRefreshTime] = useState<number>(() => Date.now());
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
    console.log('refreshTime', refreshTime);
    getTopicDetail(tid).then(setTopicDetail)
  }, [router.params, refreshTime]);

  const pageUrl = `${router.path}?${queryString.stringify(router.params)}`;

  useShareAppMessage(() => ({
    title: topicDetail?.title,
    path: pageUrl,
    imageUrl: topicDetail?.authorAvatarUrl
  }))

  useShareTimeline(() => ({
    title: topicDetail?.title,
    path: pageUrl,
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
        url: `/pages/login/index?redirect=${encodeURIComponent(pageUrl)}`
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
      <View className='scrollViewContainer'>
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
              <View className='title'>
                <Text onClick={() => {
                  Taro.reLaunch({
                    url: '/pages/home/index'
                  })
                }}
                >首页</Text>
                <Icon size={20} name='arrow-right.svg'></Icon>
                {topicDetail.title}
              </View>
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
                <Tag onClick={() => {
                  const link = topicDetail?.categoryLink;
                  console.log(link);
                  if(link) {
                    const node = urlPathVaiable(URLS.NODE_HOME_PAGE)(link)?.params?.node;
                    Taro.navigateTo({
                      url: `/pages/node/topicList/index?node=${node}&nodeName=${topicDetail.category}`
                    })
                  }
                }}
                >
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
                <View className='comment-item' key={comment.floor}>
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

                    <View className='comment-content' onClick={() => {
                      showActionSheet(true);
                      setSelectedComment(comment);
                    }}
                    >
                      <HtmlRender html={comment.content} />
                    </View>
                    <View className='comment-line3'>
                      <View className='comment-meta'>
                        {comment.replyMetas.join('·').replace(/\\s/g, '')}
                      </View>
                      <View className='commentUpvote' onClick={() => {
                        const current_reply_id: string = queryString.parseUrl(comment.upVoteUrl).query.reply_id || '';
                        commentUpvote({
                          reply_id: current_reply_id,
                        }).then((res) => {
                          if (res.data.message === "already_voted") {
                            Taro.showToast({
                              title: '你已赞过',
                            })
                          } else {
                            comment.upVoteCount = String(parseInt(comment.upVoteCount.replace('赞', '')) + 1);
                            setTopicDetail({
                              ...topicDetail
                            })
                          }
                        });
                      }}
                      >
                        <Icon name='upvote.svg' size={rpxToPx(34)} />
                        {parseInt(comment.upVoteCount.replace('赞', ''))}
                      </View>
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
         { isCommenting && <View onClick={() => setIsCommenting(false)} style={{ background: '#00000044', position: 'absolute', top: 0, bottom: 0, width: '100%'}}  /> }
      </View>
      <View className='actions' style={{ height: isCommenting ? rpxToPx(400) : rpxToPx(120) }}>
        {isCommenting ?
          <View style={{ display: 'block', width: '100%', height: '100%' }}>
            <View className='commentActions'>
              <View onClick={() => {
                setIsCommenting(false);
              }}
              >取消</View>
              <View onClick={() => {
                id && createNewComment({
                  tid: id,
                  _xsrf: topicDetail?.createCommentXSRF,
                  content: commentContent,
                }).then(() => {
                  setIsCommenting(false);
                  setCommentContent('');
                  setRefreshTime(Date.now());
                })
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
              onClick={() => {
                setIsCommenting(true)
              }}
            />
          </View> :
          <>
            <View className='left' onClick={showCommentDialog}>
              {
                hasLogin ? '说点什么...' : '请登录后再评论'
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
