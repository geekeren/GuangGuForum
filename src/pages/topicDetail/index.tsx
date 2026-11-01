import {
  Button,
  Image,
  ScrollView,
  ShareElement,
  Text,
  View,
} from "@tarojs/components";
import Taro, {
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
  urlPathVaiable,
  URLS,
} from "guanggu-forum-api";
import "./index.scss";
import Loading from "../../components/Loading";
import Navbar from "../../components/Navbar";
import ThemedIcon from "../../components/ThemedIcon";
import { getFromLocalCache } from "../../utils/localAssets";
import { cacheService, CacheCategory } from "../../utils/CacheService";
import { rpxToPx } from "../../utils/dimension";
import { useTheme } from "../../hooks/useTheme";
import { getThemeSnapshot, subscribeTheme } from "../../utils/themePreferences";
import { isSkyline } from "../../utils/renderer";
import { trimStrings } from "../../utils/trimStrings";
import { formatReplySummary } from "../../utils/replySummary";
import { findTargetComment, getCommentElementId } from "../../utils/topicReplyRoute";
import { startCommentScroll } from "../../utils/commentScroll";
import HtmlRender from "../../components/HtmlRender";
import CommentComposer from "./CommentComposer";
import TopicTag from "../../components/TopicTag";
import CommentIcon from "../../assets/comment.svg?raw";
import WechatIcon from "../../assets/wechat.svg";
import SortAscIcon from "../../assets/sort-asc.svg?raw";
import SortDescIcon from "../../assets/sort-desc.svg?raw";
import UpvoteIcon from "../../assets/upvote.svg?raw";
import RelatingTopics from "./relatingTopics";
import PullDownRefresh, { PullDownRefreshRef } from "../../components/PullDownRefresh";
import AddToDesktopGuide from "../../components/AddToDesktopGuide";
import AdBanner from "../../components/AdBanner";
import { useDataWithCache } from "../../hooks/useDataWithCache";
import { useCurrentUsername } from "../../hooks/useCurrentUsername";
import { openLoginModal } from "../../utils/auth";

const Index = () => {
  const [refreshTime, setRefreshTime] = useState<number>(() => Date.now());
  const [isCommenting, setIsCommenting] = useState(false);
  const [sending, setSending] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentAsc, setCommentAsc] = useState(() => cacheService.get<boolean>("commentSortAsc") || false);
  const [navScrollProgress, setNavScrollProgress] = useState(0);
  const [highlightFloor, setHighlightFloor] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState<number | undefined>(undefined);
  const [locatingComment, setLocatingComment] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<{ id: string } | null>(null);
  const [pageReady, setPageReady] = useState(false);
  const cancelScrollRef = useRef<(() => void) | undefined>(undefined);
  const locatedRouteRef = useRef("");
  const workletReady = useRef(false);
  const scrollProgressSV = useRef<any>(null);
  const navbarDarkSV = useRef<any>(null);
  const { theme } = useTheme();
  const pullDownRef = useRef<PullDownRefreshRef>(null);
  const router = useRouter();
  const skyline = isSkyline();

  const tid = router.params.tid;

  const { data: topicDetail, request: fetchTopicDetail, setData: setTopicDetail } = useDataWithCache(getTopicDetail);
  const { username, loading: checkingLogin, error: loginError, retry: retryLogin } = useCurrentUsername();

  useReady(() => {
    setPageReady(true);
    const { page } = Taro.getCurrentInstance();
    if (skyline && page && typeof page.applyAnimatedStyle === "function" && (Taro as any).worklet) {
      const sv = (Taro as any).worklet.shared(0);
      page._scrollProgress = sv;
      scrollProgressSV.current = sv;
      const dark = (Taro as any).worklet.shared(getThemeSnapshot().theme === "dark");
      navbarDarkSV.current = dark;

      Taro.nextTick(() => {
        page.applyAnimatedStyle(".customNavbar", () => {
          "worklet";
          const p = Math.min(Math.max(sv.value, 0), 1);
          return {
            backdropFilter: `blur(${p * 20}px)`,
            backgroundColor: `rgba(${dark.value ? "27, 34, 48" : "255, 255, 255"}, ${p * 0.85})`,
          };
        });

        workletReady.current = true;
      });
    }
  });
  useEffect(() => {
    const updateNavbarTheme = () => {
      if (navbarDarkSV.current) navbarDarkSV.current.value = getThemeSnapshot().theme === "dark";
    };
    updateNavbarTheme();
    return subscribeTheme(updateNavbarTheme);
  }, [theme]);
  const { p, replyId, floor, commentMessage } = router.params;
  const replyRouteKey = JSON.stringify([tid, p, replyId, floor, commentMessage, refreshTime]);

  useEffect(() => {
    if (!tid) {
      Taro.navigateBack().then();
      return;
    }
    fetchTopicDetail({ tid, page: p, replyId }).catch(() => {
      Taro.showToast({ title: "帖子加载失败，请重试", icon: "none" });
    });
  }, [tid, p, replyId, refreshTime, fetchTopicDetail]);

  useEffect(() => {
    if (!topicDetail || !pageReady || locatedRouteRef.current === replyRouteKey) return;
    const matched = findTargetComment(topicDetail.comments, { replyId, floor, commentMessage });
    if (!matched) return; // Fresh cache data can supply the reply missing from the initial render.
    locatedRouteRef.current = replyRouteKey;
    setHighlightFloor(matched.floor);
    setScrollRequest({ id: getCommentElementId(matched) });
  }, [topicDetail, pageReady, replyRouteKey, replyId, floor, commentMessage]);

  useEffect(() => {
    if (!scrollRequest || !pageReady) return;
    setLocatingComment(true);
    const cancel = startCommentScroll({
      nextTick: (callback) => Taro.nextTick(callback),
      measure: (callback) => {
        const query = Taro.createSelectorQuery();
        query.select(`#${scrollRequest.id}`).boundingClientRect();
        query.select(".scrollContent").boundingClientRect();
        query.select(".customNavbar").boundingClientRect();
        query.select(".scrollContent").scrollOffset();
        query.exec(([target, viewport, navbar, scroll]) => callback({ target, viewport, navbar, scroll }));
      },
      apply: setScrollTop,
      settled: () => setLocatingComment(false),
    });
    cancelScrollRef.current = cancel;
    return () => {
      cancel();
      if (cancelScrollRef.current === cancel) cancelScrollRef.current = undefined;
    };
  }, [scrollRequest, pageReady]);

  useEffect(() => {
    if (!highlightFloor) return;
    const timer = setTimeout(() => setHighlightFloor(null), 2800);
    return () => clearTimeout(timer);
  }, [highlightFloor]);

  useDidShow(() => {
    if (isSkyline() && tid) {
      fetchTopicDetail({ tid, page: router.params.p, replyId: router.params.replyId });
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
      <View className={skyline ? 'topicDetail topicDetail--skyline' : 'topicDetail'}>
        <Navbar back home title='帖子详情' />
        <View className='topicDetailLoading'>
          <Loading />
        </View>
      </View>
    );
  }

  const hasComments = topicDetail.commentTotalCount.trim() !== "";
  // The reply form token is a posting capability, not the restored account identity.
  const hasLogin = !!username || !!topicDetail.createCommentXSRF;
  const commentPlaceholder = hasLogin ? "说点什么..."
    : checkingLogin ? "正在确认登录状态..."
    : loginError ? "登录状态确认失败，点击重试" : "请登录后再评论";

  const showCommentDialog = (config?: { content: string }) => {
    if (!hasLogin) {
      if (checkingLogin) return;
      if (loginError) {
        retryLogin();
        return;
      }
      openLoginModal(pageUrl);
      return;
    }
    setIsCommenting(true);
    if (config?.content) {
      setCommentContent(config.content);
    }
  };

  return (
    <>
      <View className={skyline ? 'topicDetail topicDetail--skyline' : 'topicDetail'}>
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
            type='custom'
            scrollWithAnimation={!locatingComment}
            scrollY
            bounces
            enhanced
            scrollTop={scrollTop}
            className='scrollContent'
            onTouchStart={(e: any) => {
              cancelScrollRef.current?.();
              setLocatingComment(false);
              pullDownRef.current?.onTouchStart(e);
            }}
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
                  <ShareElement className='topicTitleShare' mapkey={`topic_title_${tid}`}>
                    <Text className='titleText' maxLines={skyline ? 3 : undefined} overflow={skyline ? 'ellipsis' : undefined}>{topicDetail.title}</Text>
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
                        svg={topicDetail.authorAvatarUrl?.endsWith('/m_default.png')}
                      />
                    </View>
                    <View className='authorDetails'>
                      <View className='authorNameRow'>
                        <Text className='author' maxLines={skyline ? 1 : undefined} overflow={skyline ? 'ellipsis' : undefined}>{topicDetail.author}</Text>
                        {topicDetail.authorLevel && <Text className='authorLevel'>{topicDetail.authorLevel}</Text>}
                      </View>
                      <View className='moreInfo'>
                        <Text className='createTime' maxLines={skyline ? 1 : undefined} overflow={skyline ? 'ellipsis' : undefined}>
                          {topicDetail.createTime}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TopicTag
                    label={topicDetail.category}
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
                  />
                </View>
              </View>
              <View className='content'>
                <HtmlRender html={topicDetail.content} />
              </View>
              <View className='extra'>
                <View className='right'>
                  <Text>{topicDetail.viewCount}</Text>
                  <Text>{topicDetail.upVoteCount}</Text>
                  <Text>{topicDetail.favoriteCount}</Text>
                </View>
              </View>
            </View>
            <View className='comments section' id='comments-section'>
              {hasComments ? (
                <View className='header'>
                  <Text>{formatReplySummary(topicDetail.commentTotalCount)}</Text>
                  <View
                    className={`sortBtn ${commentAsc ? "sortBtn--active" : ""}`}
                    onClick={() => {
                      const next = !commentAsc;
                      setCommentAsc(next);
                      cacheService.set("commentSortAsc", next, { category: CacheCategory.Other });
                    }}
                  >
                    <ThemedIcon src={commentAsc ? SortDescIcon : SortAscIcon} tone='secondary' lightColor='#000' className='sortIcon' />
                  </View>
                </View>
              ) : (
                <View className='emptyComments'>
                  <Text className='emptyIcon'>💬</Text>
                  <Text className='emptyTitle'>暂无评论</Text>
                  <Text className='emptyDesc'>快来发表第一条评论吧</Text>
                  <View className='emptyBtn' onClick={() => showCommentDialog()}>
                    <Text>说点什么</Text>
                  </View>
                </View>
              )}
              {hasComments &&
                (commentAsc
                  ? [...topicDetail.comments].reverse()
                  : topicDetail.comments
                ).map((comment, index) => {
                  const items: React.ReactNode[] = [
                    <View
                      id={getCommentElementId(comment)}
                      className={`comment-item${highlightFloor === comment.floor ? " comment-item--highlight" : ""}`}
                      key={comment.floor}
                    >
                      <View
                        className='comment-author-avatar'
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
                          svg={comment.authorAvatarUrl?.endsWith('/m_default.png')}
                        />
                      </View>
                      <View className='comment-right'>
                        <View className='line1'>
                          <View className='commentAuthorNameRow'>
                            <Text className='comment-author' maxLines={skyline ? 1 : undefined} overflow={skyline ? 'ellipsis' : undefined}>{comment.author}</Text>
                            {comment.authorLevel && <Text className='authorLevel'>{comment.authorLevel}</Text>}
                          </View>
                          <Text className='comment-floor'>{comment.floor}</Text>
                        </View>

                        <View
                          className='comment-content'
                          onClick={() => {
                            Taro.showActionSheet({
                              itemList: ["回复", "复制"],
                              success: (res) => {
                                if (res.tapIndex === 0) {
                                  showCommentDialog({ content: `@${comment.author} ` });
                                } else if (res.tapIndex === 1) {
                                  Taro.setClipboardData({
                                    data: comment.content.trim(),
                                    success: () => Taro.showToast({ title: "评论已复制", icon: "success", duration: 2000 }),
                                  });
                                }
                              },
                            });
                          }}
                        >
                          <HtmlRender html={comment.content} />
                        </View>
                        <View className='comment-line3'>
                          <Text className='comment-meta'>
                            {comment.replyMetas.join("·").replace(/\\s/g, "")}
                          </Text>
                          <View
                            className='commentUpvote'
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
                            <ThemedIcon src={UpvoteIcon} tone='muted' lightColor='#000' style={{ height: rpxToPx(28), width: rpxToPx(28) }} />
                            <Text>{parseInt(comment.upVoteCount.replace("赞", ""))}</Text>
                          </View>
                        </View>
                      </View>
                    </View>,
                  ];

                  if ((index + 1) % 10 === 4) {
                    items.push(
                      <AdBanner
                        key={`ad-${comment.floor}`}
                        unitId='adunit-528fc7c01c3edadb'
                      />,
                    );
                  }

                  return items;
                })}
            </View>
            <View className='relatingTopics section'>
              <View className='header'><Text>相关主题</Text></View>
              <RelatingTopics topicDetail={topicDetail} />
            </View>
          </ScrollView>
        </PullDownRefresh>
        <View className='actions'>
          <View className='left' onClick={() => showCommentDialog()}>
            <Text>{commentPlaceholder}</Text>
          </View>
          <View className='right'>
            <View className='badgeWrap' onClick={() => {
              setScrollRequest({ id: 'comments-section' });
            }}
            >
              {topicDetail?.comments.length > 0 && (
                <View className='badgeValue'>
                  <Text>{Math.min(topicDetail.comments.length, 99)}</Text>
                </View>
              )}
              <ThemedIcon src={CommentIcon} tone='secondary' lightColor='#000' className='commentIcon' />
            </View>
            <Button openType='share' className='share'>
              <Image src={WechatIcon} svg className='icon' />
              <Text>分享</Text>
            </Button>
          </View>
        </View>
      </View>
      {isCommenting && <CommentComposer
        value={commentContent}
        sending={sending}
        onChange={setCommentContent}
        onClose={() => setIsCommenting(false)}
        onSend={async () => {
          if (sending || !tid) return;
          if (commentContent.trim().length < 3) {
            Taro.showToast({ title: '评论内容至少3个字', icon: 'none' });
            return;
          }
          setSending(true);
          Taro.showLoading({ title: "发送中...", mask: true });
          try {
            let xsrf = topicDetail.createCommentXSRF;
            if (!xsrf) {
              // A restored session or cached topic can lack the current reply form.
              const freshDetail = await getTopicDetail({ tid, page: p, replyId }, { cache: false });
              setTopicDetail(freshDetail);
              xsrf = freshDetail.createCommentXSRF;
            }
            if (!xsrf) {
              Taro.showToast({ title: "暂时无法评论，请刷新后重试", icon: "none" });
              return;
            }
            await createNewComment({ tid, _xsrf: xsrf, content: commentContent });
            setIsCommenting(false);
            setCommentContent("");
            setRefreshTime(Date.now());
          } catch {
            Taro.showToast({ title: "评论发送失败，请重试", icon: "none" });
          } finally {
            setSending(false);
            Taro.hideLoading();
          }
        }}
      />}
      <AddToDesktopGuide />
    </>
  );
};

export default Index;
