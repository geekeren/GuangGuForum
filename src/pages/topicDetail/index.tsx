import {
  AdCustom,
  Button,
  Image,
  ScrollView,
  ShareElement,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, {
  getStorageSync,
  setStorageSync,
  useRouter,
  useShareAppMessage,
  useShareTimeline,
  useReady,
  useDidShow,
} from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import queryString from "query-string";
import {
  commentUpvote,
  createNewComment,
  getTopicDetail,
  TopicDetail,
  urlPathVaiable,
  URLS,
} from "guanggu-forum-api";
import "./index.scss";
import Loading from "../../components/Loading";
import Navbar from "../../components/Navbar";
import { getFromLocalCache } from "../../utils/localAssets";
import { rpxToPx } from "../../utils/dimension";
import { withCache } from "../../utils/cacheRequest";
import { isSkyline } from "../../utils/renderer";
import { trimStrings } from "../../utils/trimStrings";
import HtmlRender from "../../components/HtmlRender";
import Tag from "../../components/Tag";
import Icon from "../../components/Icon";
import NodeIcon from "../../assets/topic_node.svg";
import CommentIcon from "../../assets/comment.svg";
import WechatIcon from "../../assets/wechat.svg";
import SortAscIcon from "../../assets/sort-asc.svg";
import SortDescIcon from "../../assets/sort-desc.svg";
import RelatingTopics from "./relatingTopics";
import PullDownRefresh, { PullDownRefreshRef } from "../../components/PullDownRefresh";

const Index = () => {
  const [id, setId] = useState<string>();
  const [refreshTime, setRefreshTime] = useState<number>(() => Date.now());
  const [topicDetail, setTopicDetail] = useState<TopicDetail>();
  const [isActionSheetShown, showActionSheet] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [sending, setSending] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [selectedComment, setSelectedComment] =
    useState<TopicDetail["comments"][0]>();
  const [commentAsc, setCommentAsc] = useState(() => getStorageSync("commentSortAsc") || false);
  const [navScrollProgress, setNavScrollProgress] = useState(0);
  const workletReady = useRef(false);
  const scrollProgressSV = useRef<any>(null);
  const pullDownRef = useRef<PullDownRefreshRef>(null);
  const router = useRouter();

  useReady(() => {
    const { page } = Taro.getCurrentInstance();
    if (page && (Taro as any).worklet) {
      const sv = (Taro as any).worklet.shared(0);
      page._scrollProgress = sv;
      scrollProgressSV.current = sv;

      Taro.nextTick(() => {
        page.applyAnimatedStyle(".customNavbar", () => {
          "worklet";
          const p = Math.min(Math.max(sv.value, 0), 1);
          return {
            backdropFilter: `blur(${p * 20}px)`,
            backgroundColor: `rgba(255, 255, 255, ${p * 0.85})`,
          };
        });

        workletReady.current = true;
      });
    }
  });
  useEffect(() => {
    const { tid } = router.params;
    if (!tid) {
      Taro.navigateBack().then();
      return;
    }
    setId(tid);
    console.log("refreshTime", refreshTime);
    const { cached, refresh } = withCache<TopicDetail>(
      `topic_detail_${tid}`,
      () => getTopicDetail(tid),
    );
    if (cached) setTopicDetail(cached);
    refresh.then(setTopicDetail);
  }, [router.params, refreshTime]);

  useDidShow(() => {
    if (isSkyline() && id) {
      getTopicDetail(id).then((data) => {
        if (data) setTopicDetail(trimStrings(data));
      });
    }
  });

  const pageUrl = `${router.path}?${queryString.stringify(router.params)}`;

  const shareImageUrl = topicDetail?.content?.match(/<img[^>]+src=["']([^"']+)["']/)?.[1];

  useShareAppMessage(() => ({
    title: topicDetail?.title,
    path: pageUrl,
    ...(shareImageUrl ? { imageUrl: shareImageUrl } : {}),
  }));

  useShareTimeline(() => ({
    title: topicDetail?.title,
    path: pageUrl,
    ...(shareImageUrl ? { imageUrl: shareImageUrl } : {}),
  }));

  if (!topicDetail) {
    return (
      <View className='topicDetail'>
        <Navbar back home title='帖子详情' />
        <Loading fullscreen />
      </View>
    );
  }

  const hasComments = topicDetail.commentTotalCount.trim() !== "";
  const hasLogin = !!topicDetail?.createCommentXSRF;

  const showCommentDialog = (config?: { content: string }) => {
    if (!hasLogin) {
      wx.navigateTo({
        url: `/pages/login/index?redirect=${encodeURIComponent(pageUrl)}${isSkyline() ? '&modal=true' : ''}`,
        routeType: "wx://cupertino-modal",
        routeOptions: {
          backgroundColor: "#00000066",
        },
      });
      return;
    }
    setIsCommenting(true);
    if (config?.content) {
      setCommentContent(config.content);
    }
  };

  return (
    <>
      <View className='topicDetail'>
        <Navbar
          back
          home
          scrollProgress={navScrollProgress}
          title={navScrollProgress <= 0.3 ? '帖子详情' : topicDetail?.title}
          titleStyle={navScrollProgress <= 0.3 ? { opacity: 1 } : {
            opacity: Math.min(1, (navScrollProgress - 0.3) / 0.7),
            transform: `translateY(${(1 - Math.min(navScrollProgress, 1)) * 8}px)`,
          }}
        />
        <PullDownRefresh
          ref={pullDownRef}
          className='scrollViewContainer'
          onRefresh={() => setRefreshTime(Date.now())}
        >
          <ScrollView
            scrollWithAnimation
            scrollY
            bounces
            enhanced
            className='scrollContent'
            onTouchStart={(e: any) => pullDownRef.current?.onTouchStart(e)}
            onTouchMove={(e: any) => pullDownRef.current?.onTouchMove(e)}
            onTouchEnd={(e: any) => pullDownRef.current?.onTouchEnd(e)}
            onScroll={(e: any) => {
              pullDownRef.current?.onScroll(e.detail.scrollTop);
              const progress = Math.min(e.detail.scrollTop / 100, 1);
              if (workletReady.current && scrollProgressSV.current) {
                scrollProgressSV.current.value = progress;
              }
              setNavScrollProgress(progress);
            }}
          >
            <View className='main'>
              <View className='header'>
                <View className='title'>
                  <ShareElement mapkey={`topic_title_${id}`}>
                    <Text className='titleText'>{topicDetail.title}</Text>
                  </ShareElement>
                </View>
                <View className='metaRow'>
                  <View
                    className='authorInfo'
                    onClick={() => {
                      Taro.navigateTo({
                        url: `/pages/user/index?username=${topicDetail.author}`,
                      });
                    }}
                  >
                    <View className='avatar'>
                      <Image
                        lazyLoad
                        src={getFromLocalCache(topicDetail.authorAvatarUrl)}
                      />
                    </View>
                    <View>
                      <View className='author'>{topicDetail.author}</View>
                      <View className='moreInfo'>
                        <View className='createTime'>
                          {topicDetail.createTime}
                        </View>
                        <View>{topicDetail.viewCount}</View>
                      </View>
                    </View>
                  </View>
                  <Tag
                    onClick={() => {
                      const link = topicDetail?.categoryLink;
                      if (link) {
                        const node = urlPathVaiable(URLS.NODE_HOME_PAGE)(link)
                          ?.params?.node;
                        Taro.navigateTo({
                          url: `/pages/node/topicList/index?node=${node}&nodeName=${topicDetail.category}`,
                        });
                      }
                    }}
                  >
                    <Image src={NodeIcon} svg className='tagIcon' />
                    <View style={{ display: "inline-block" }}>
                      {topicDetail.category}
                    </View>
                  </Tag>
                </View>
              </View>
              <View className='content'>
                <HtmlRender html={topicDetail.content} />
              </View>
              <View className='extra'>
                <View className='right'>
                  <View>{topicDetail.upVoteCount}</View>
                  <View>{topicDetail.favoriteCount}</View>
                </View>
              </View>
            </View>
            <View className='comments section'>
              {hasComments ? (
                <View className='header'>
                  {topicDetail.commentTotalCount}
                  <View
                    className={`sortBtn ${commentAsc ? "sortBtn--active" : ""}`}
                    onClick={() => {
                      const next = !commentAsc;
                      setCommentAsc(next);
                      setStorageSync("commentSortAsc", next);
                    }}
                  >
                    <Image src={commentAsc ? SortDescIcon : SortAscIcon} svg className='sortIcon' />
                  </View>
                </View>
              ) : (
                <View className='emptyComments'>
                  <View className='emptyIcon'>💬</View>
                  <View className='emptyTitle'>暂无评论</View>
                  <View className='emptyDesc'>快来发表第一条评论吧</View>
                  <View className='emptyBtn' onClick={() => showCommentDialog()}>
                    说点什么
                  </View>
                </View>
              )}
              {hasComments &&
                (commentAsc
                  ? [...topicDetail.comments].reverse()
                  : topicDetail.comments
                ).map((comment, index) => {
                  const items: React.ReactNode[] = [
                    <View className="comment-item" key={comment.floor}>
                      <View
                        className="comment-author-avatar"
                        onClick={(e) => {
                          e.stopPropagation();
                          Taro.navigateTo({
                            url: `/pages/user/index?username=${comment.author}`,
                          });
                        }}
                      >
                        <Image
                          lazyLoad
                          src={getFromLocalCache(comment.authorAvatarUrl)}
                        />
                      </View>
                      <View className="comment-right">
                        <View className="line1">
                          <View className="comment-author">{comment.author}</View>
                          <View>{comment.floor}</View>
                        </View>

                        <View
                          className="comment-content"
                          onClick={() => {
                            showActionSheet(true);
                            setSelectedComment(comment);
                          }}
                        >
                          <HtmlRender html={comment.content} />
                        </View>
                        <View className="comment-line3">
                          <View className="comment-meta">
                            {comment.replyMetas.join("·").replace(/\\s/g, "")}
                          </View>
                          <View
                            className="commentUpvote"
                            onClick={() => {
                              const current_reply_id: string =
                                queryString.parseUrl(comment.upVoteUrl).query
                                  .reply_id || "";
                              commentUpvote({
                                reply_id: current_reply_id,
                              }).then((res) => {
                                if (res.data.message === "already_voted") {
                                  Taro.showToast({
                                    title: "你已赞过",
                                  });
                                } else {
                                  comment.upVoteCount = String(
                                    parseInt(
                                      comment.upVoteCount.replace("赞", ""),
                                    ) + 1,
                                  );
                                  setTopicDetail({
                                    ...topicDetail,
                                  });
                                }
                              });
                            }}
                          >
                            <Icon name="upvote.svg" size={rpxToPx(34)} />
                            {parseInt(comment.upVoteCount.replace("赞", ""))}
                          </View>
                        </View>
                      </View>
                    </View>,
                  ];

                  if ((index + 1) % 10 === 4) {
                    items.push(
                      <AdCustom
                        key={`ad-${comment.floor}`}
                        unitId="adunit-528fc7c01c3edadb"
                        onLoad={() => console.log("ad onLoad")}
                        onError={(e) => console.log("ad onError", e)}
                      />,
                    );
                  }

                  return items;
                })}
            </View>
            <View className='relatingTopics section'>
              <View className='header'>相关主题</View>
              <RelatingTopics topicDetail={topicDetail} />
            </View>
          </ScrollView>
        </PullDownRefresh>
        <View className='actions'>
          <View className='left' onClick={showCommentDialog}>
            {hasLogin ? "说点什么..." : "请登录后再评论"}
          </View>
          <View className='right'>
            <View className='badgeWrap'>
              {topicDetail?.comments.length > 0 && (
                <View className='badgeValue'>
                  {Math.min(topicDetail.comments.length, 99)}
                </View>
              )}
              <Image src={CommentIcon} svg className='commentIcon' />
            </View>
            <Button openType='share' className='share'>
              <Image src={WechatIcon} svg className='icon' />
              分享
            </Button>
          </View>
        </View>
        {isCommenting && (
          <View className='commentPopup'>
            <View className='commentPopupMask' onClick={() => setIsCommenting(false)} />
            <View className='commentPopupBody'>
              <View className='commentPopupHeader'>
                <View className='commentPopupCancel' onClick={() => setIsCommenting(false)}>取消</View>
                <View className='commentPopupTitle'>评论</View>
                <View
                  className={`commentPopupSend ${sending ? 'commentPopupSend--disabled' : ''}`}
                  onClick={() => {
                    if (sending) return;
                    if (commentContent.trim().length < 3) {
                      Taro.showToast({ title: '评论内容至少3个字', icon: 'none' });
                      return;
                    }
                    setSending(true);
                    Taro.showLoading({ title: "发送中...", mask: true });
                    id &&
                      createNewComment({
                        tid: id,
                        _xsrf: topicDetail?.createCommentXSRF,
                        content: commentContent,
                      }).then(() => {
                        setIsCommenting(false);
                        setCommentContent("");
                        setRefreshTime(Date.now());
                      }).finally(() => {
                        setSending(false);
                        Taro.hideLoading();
                      });
                  }}
                >
                  {sending ? "发送中..." : "发送"}
                </View>
              </View>
              <Textarea
                className='commentPopupTextarea'
                cursorSpacing={100}
                adjustPosition
                focus={isCommenting}
                autoHeight
                onInput={(event) => {
                  setCommentContent(event.detail.value);
                }}
                value={commentContent}
                showConfirmBar={false}
                placeholder='说点什么'
              />
            </View>
          </View>
        )}
        {isActionSheetShown && (
          <View className='actionSheet'>
            <View className='actionSheetMask' onClick={() => showActionSheet(false)} />
            <View className='actionSheetBody'>
              <View className='actionSheetItem' onClick={() => {
                showActionSheet(false);
                showCommentDialog({ content: `@${selectedComment?.author} ` });
              }}
              >
                <Text>回复</Text>
              </View>
              <View className='actionSheetItem' onClick={() => {
                showActionSheet(false);
                Taro.setClipboardData({
                  data: selectedComment?.content.trim() || "",
                  success: function () {
                    Taro.showToast({ title: "评论已复制", icon: "success", duration: 2000 }).then();
                  },
                  fail: console.error,
                }).catch(console.error).then();
              }}
              >
                <Text>复制</Text>
              </View>
              <View className='actionSheetItem actionSheetItem--cancel' onClick={() => showActionSheet(false)}>
                <Text>取消</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </>
  );
};

export default Index;
