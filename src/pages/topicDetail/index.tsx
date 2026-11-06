import { getScrollViewType } from "../../utils/renderer";
import { Image, ScrollView, ShareElement, Text, View } from "@tarojs/components";
import { GzkButton as Button } from "gzk-ui/native-form";
import Taro, {
  useRouter,
  useShareAppMessage,
  useShareTimeline,
  useReady,
  useDidShow,
  useDidHide,
} from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import queryString from "query-string";
import {
  commentUpvote,
  CommentSubmissionError,
  LoginRequiredError,
  createNewComment,
  getTopicDetail,
  urlPathVaiable,
  URLS,
} from "guanggu-forum-api";
import "./index.scss";
import Loading from "../../components/Loading";
import Navbar from "../../components/Navbar";
import ThemedIcon from "../../components/ThemedIcon";
import UserAvatar from '../../components/UserAvatar';
import { readCommentSortAscending, subscribeCommentSort, writeCommentSortAscending } from "../../utils/commentSortPreferences";
import { rpxToPx } from "../../utils/dimension";
import { useTheme } from "../../hooks/useTheme";
import { getThemeSnapshot, subscribeTheme, THEME_PALETTES } from "../../utils/themePreferences";
import { isSkyline } from "../../utils/renderer";
import { trimStrings } from "../../utils/trimStrings";
import { formatReplySummary } from "../../utils/replySummary";
import { findLatestComment, findTargetComment, getCommentElementId, getCommentReplyId } from "../../utils/topicReplyRoute";
import { startCommentScroll } from "../../utils/commentScroll";
import HtmlRender from "../../components/HtmlRender";
import CommentComposer from "./CommentComposer";
import TopicTag from "../../components/TopicTag";
import { Comment as CommentIcon } from "gzk-ui/icons";
import WechatIcon from "../../assets/wechat.svg";
import { SortAsc as SortAscIcon } from "gzk-ui/icons";
import { SortDesc as SortDescIcon } from "gzk-ui/icons";
import { Upvote as UpvoteIcon } from "gzk-ui/icons";
import RelatingTopics from "./relatingTopics";
import PullDownRefresh, { PullDownRefreshRef } from "../../components/PullDownRefresh";
import AddToDesktopGuide from "../../components/AddToDesktopGuide";
import AdBanner from "../../components/AdBanner";
import { useDataWithCache } from "../../hooks/useDataWithCache";
import { useCurrentUsername } from "../../hooks/useCurrentUsername";
import { recordRecentlyViewedTopic } from '../../utils/recentlyViewedTopics';
import { getCachedUsername, subscribeCurrentAccount } from '../../utils/currentUser';
import { getCommentBody } from "../../utils/mentions";
import { editCommentMentionBindings, validCommentMentionBindings, verifiedMentionId, verifiedMentionTargets, type CommentMentionBinding } from '../../utils/commentMentionBindings';
import { MAX_COMMENT_ATTACHMENTS } from "../../utils/stickers";
import { buildAttachmentComment, photoAttachment, stickerAttachment, type CommentAttachment } from "../../utils/commentAttachments";
import { useCommentPhotoUploads } from '../../hooks/useCommentPhotoUploads';
import { openLoginModal } from "../../utils/auth";

function topicCanvasRGB(theme: 'light' | 'dark') {
  const hex = THEME_PALETTES[theme].bg.slice(1);
  return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(', ');
}

const Index = () => {
  const [refreshTime, setRefreshTime] = useState<number>(() => Date.now());
  const [isCommenting, setIsCommenting] = useState(false);
  const [sending, setSending] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentAttachments, setCommentAttachments] = useState<CommentAttachment[]>([]);
  const commentStickers = commentAttachments.flatMap(item => item.kind === 'sticker' ? [item.sticker] : []);
  const commentPhotos = commentAttachments.flatMap(item => item.kind === 'photo' ? [item.path] : []);
  const [commentAsc, setCommentAsc] = useState(readCommentSortAscending);
  useEffect(() => {
    const unsubscribe = subscribeCommentSort(setCommentAsc);
    setCommentAsc(readCommentSortAscending());
    return unsubscribe;
  }, []);
  useDidShow(() => {
    setCommentAsc(readCommentSortAscending());
  });
  const [navScrollProgress, setNavScrollProgress] = useState(0);
  const [highlightFloor, setHighlightFloor] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState<number | undefined>(undefined);
  const [locatingComment, setLocatingComment] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<{ id: string } | null>(null);
  const [pageReady, setPageReady] = useState(false);
  const showLatestComments = useRef(false);
  const cancelScrollRef = useRef<(() => void) | undefined>(undefined);
  const locatedRouteRef = useRef("");
  const workletReady = useRef(false);
  const scrollProgressSV = useRef<any>(null);
  const navbarCanvasSV = useRef<any>(null);
  const { theme } = useTheme();
  const pullDownRef = useRef<PullDownRefreshRef>(null);
  const router = useRouter();
  const skyline = isSkyline();

  const tid = router.params.tid;
  const submissionScope = JSON.stringify([tid, router.params.p, router.params.replyId]);
  const mentionDraft = useRef({ text: commentContent, bindings: [] as CommentMentionBinding[], account: getCachedUsername(), scope: submissionScope, metadataCurrent: false });
  if (mentionDraft.current.account !== getCachedUsername() || mentionDraft.current.scope !== submissionScope) {
    mentionDraft.current = { text: commentContent, bindings: [], account: getCachedUsername(), scope: submissionScope, metadataCurrent: false };
  }
  const submissionPage = useRef({ visible: true, mounted: true, generation: 0, lifecycle: 0, changedAccount: 0, scope: submissionScope });
  if (submissionPage.current.scope !== submissionScope) {
    submissionPage.current.scope = submissionScope;
    submissionPage.current.generation += 1;
  }
  const loadedForm = useRef<{ account: string; scope: string }>();
  if (loadedForm.current && (loadedForm.current.account !== getCachedUsername() || loadedForm.current.scope !== submissionScope)) loadedForm.current = undefined;
  const submissionLock = useRef(false);
  const composerAccount = useRef<{ account: string; scope: string; confirmed: boolean }>();
  const invalidateSubmission = () => { submissionPage.current.generation += 1; };
  useDidShow(() => { submissionPage.current.visible = true; });
  useDidHide(() => { submissionPage.current.visible = false; submissionPage.current.lifecycle += 1; invalidateSubmission(); mentionDraft.current.metadataCurrent = false; });
  useEffect(() => {
    submissionPage.current.mounted = true;
    const unsubscribe = subscribeCurrentAccount(reason => {
      if (reason === 'changed') submissionPage.current.changedAccount += 1;
      invalidateSubmission();
      loadedForm.current = undefined;
      mentionDraft.current.bindings = [];
      mentionDraft.current.metadataCurrent = false;
      if (composerAccount.current) composerAccount.current.confirmed = false;
    });
    return () => { unsubscribe(); loadedForm.current = undefined; mentionDraft.current.bindings = []; mentionDraft.current.metadataCurrent = false; submissionPage.current.mounted = false; invalidateSubmission(); };
  }, []);

  const { data: topicDetail, request: fetchTopicDetail, setData: setTopicDetail } = useDataWithCache(getTopicDetail);
  const { username, loading: checkingLogin, error: loginError, retry: retryLogin } = useCurrentUsername();
  useCommentPhotoUploads(commentAttachments, setCommentAttachments, username);
  const recordedVisit = useRef('');
  const [visitRevision, setVisitRevision] = useState(0);
  useDidShow(() => {
    recordedVisit.current = '';
    setVisitRevision(value => value + 1);
  });
  useEffect(() => {
    if (!tid || !topicDetail?.title || topicDetail.tid !== tid) return;
    const account = getCachedUsername();
    const visit = JSON.stringify([account, tid]);
    if (recordedVisit.current === visit) return;
    if (recordRecentlyViewedTopic({ tid, title: topicDetail.title, link: `/t/${tid}`,
      avatarUrl: topicDetail.authorAvatarUrl, author: topicDetail.authorUsername || topicDetail.author,
      displayName: topicDetail.author }, account)) recordedVisit.current = visit;
  }, [tid, topicDetail, username, visitRevision]);

  useReady(() => {
    setPageReady(true);
    const { page } = Taro.getCurrentInstance();
    if (skyline && page && typeof page.applyAnimatedStyle === "function" && (Taro as any).worklet) {
      const sv = (Taro as any).worklet.shared(0);
      page._scrollProgress = sv;
      scrollProgressSV.current = sv;
      const canvas = (Taro as any).worklet.shared(topicCanvasRGB(getThemeSnapshot().theme));
      navbarCanvasSV.current = canvas;

      Taro.nextTick(() => {
        page.applyAnimatedStyle(".customNavbar", () => {
          "worklet";
          const p = Math.min(Math.max(sv.value, 0), 1);
          return {
            backdropFilter: `blur(${p * 20}px)`,
            backgroundColor: `rgba(${canvas.value}, ${p * 0.85})`,
          };
        });

        workletReady.current = true;
      });
    }
  });
  useEffect(() => {
    const updateNavbarTheme = () => {
      if (navbarCanvasSV.current) navbarCanvasSV.current.value = topicCanvasRGB(getThemeSnapshot().theme);
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
    const params = showLatestComments.current ? { tid, latest: true } : { tid, page: p, replyId };
    const account = getCachedUsername();
    const generation = submissionPage.current.generation;
    let active = true;
    loadedForm.current = undefined;
    const current = () => active && submissionPage.current.mounted && submissionPage.current.visible
      && submissionPage.current.generation === generation && submissionPage.current.scope === submissionScope
      && getCachedUsername() === account;
    fetchTopicDetail(params).then(detail => {
      if (!current() || detail.tid !== tid) return;
      loadedForm.current = { account, scope: submissionScope };
      mentionDraft.current.metadataCurrent = true;
    }).catch(() => {
      if (current()) Taro.showToast({ title: "帖子加载失败，请重试", icon: "none" });
    });
    return () => { active = false; };
  }, [tid, p, replyId, refreshTime, fetchTopicDetail]);

  useEffect(() => {
    if (showLatestComments.current || !topicDetail || !pageReady || locatedRouteRef.current === replyRouteKey) return;
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
    // The entry effect already loads once; keep Skyline's existing return-to-page refresh.
    if (isSkyline() && tid && submissionPage.current.lifecycle > 0) setRefreshTime(Date.now());
  });

  const pageQuery = queryString.stringify(router.params);
  const pageUrl = `${router.path}?${pageQuery}`;

  const shareImageUrl = topicDetail?.content?.match(/<img[^>]+src=["']([^"']+)["']/)?.[1];

  useShareAppMessage(() => ({
    title: topicDetail?.title,
    path: pageUrl,
    ...(shareImageUrl ? { imageUrl: shareImageUrl } : {}),
  }));

  useShareTimeline(() => ({
    title: topicDetail?.title,
    query: pageQuery,
    ...(shareImageUrl ? { imageUrl: shareImageUrl } : {}),
  }));

  if (!topicDetail) {
    return (
      <View className={skyline ? 'topicDetail topicDetail--skyline' : 'topicDetail'}>
        <Navbar back home title='帖子详情' backgroundRGB={topicCanvasRGB(theme)} />
        <View className='topicDetailLoading'>
          <Loading />
        </View>
      </View>
    );
  }

  const hasComments = topicDetail.commentTotalCount.trim() !== "";
  // Cached reply capabilities must never stand in for the current account identity.
  const hasLogin = !!username && username === getCachedUsername();
  const commentPlaceholder = hasLogin ? "说点什么..."
    : checkingLogin ? "正在确认登录状态..."
    : loginError ? "登录状态确认失败，点击重试" : "请登录后再评论";

  const mentionMetadata = mentionDraft.current.metadataCurrent && loadedForm.current?.account === getCachedUsername()
    && loadedForm.current.scope === submissionScope && topicDetail.tid === tid ? topicDetail : undefined;
  const mentionTargets = mentionMetadata ? verifiedMentionTargets([mentionMetadata, ...(mentionMetadata.comments ?? [])]) : [];
  const mentionGeneration = submissionPage.current.generation;
  const changeCommentContent = (next: string) => {
    if (submissionLock.current || !submissionPage.current.visible || !submissionPage.current.mounted
      || submissionPage.current.generation !== mentionGeneration) return;
    mentionDraft.current.bindings = editCommentMentionBindings(mentionDraft.current.text, next, mentionDraft.current.bindings);
    mentionDraft.current.text = next;
    setCommentContent(next);
  };
  const insertCommentMention = (binding: CommentMentionBinding) => {
    const owner = composerAccount.current;
    if (submissionLock.current || !submissionPage.current.visible || !submissionPage.current.mounted
      || submissionPage.current.generation !== mentionGeneration || !mentionDraft.current.metadataCurrent
      || !owner?.confirmed || owner.account !== getCachedUsername() || owner.scope !== submissionScope
      || mentionDraft.current.account !== getCachedUsername() || mentionDraft.current.scope !== submissionScope
      || !mentionTargets.some(target => target.uid === binding.uid && `@${target.label}` === binding.label)) return;
    mentionDraft.current.bindings = validCommentMentionBindings(mentionDraft.current.text, [...mentionDraft.current.bindings, binding]);
  };
  const showCommentDialog = (config?: { content: string; mention?: CommentMentionBinding }) => {
    if (submissionLock.current || !submissionPage.current.visible || !submissionPage.current.mounted
      || submissionPage.current.generation !== mentionGeneration) return;
    if (!hasLogin) {
      if (checkingLogin) return;
      if (loginError) {
        retryLogin();
        return;
      }
      openLoginModal(pageUrl);
      return;
    }
    composerAccount.current = { account: getCachedUsername(), scope: submissionScope, confirmed: true };
    setIsCommenting(true);
    if (config?.content) {
      changeCommentContent(config.content);
      // The reply action carries its exact server identity, even for duplicate display names.
      mentionDraft.current.bindings = config.mention ? validCommentMentionBindings(config.content, [config.mention]) : [];
    }
  };

  return (
    <>
      <View className={skyline ? 'topicDetail topicDetail--skyline' : 'topicDetail'}>
        <Navbar
          back
          home
          backgroundRGB={topicCanvasRGB(theme)}
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
            type={getScrollViewType()}
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
            <View className='topicDetailFlow'>
            <View className='main topicBodyImageViewport'>
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
                        // Display-name authors are not URL slugs; the display anchor
                        // links by account id, with the legacy username as fallback.
                        url: `/pages/user/index?username=${encodeURIComponent(topicDetail.authorUserId ?? topicDetail.authorUsername ?? topicDetail.author)}`,
                      });
                    }}
                  >
                    <View className='avatar'>
                      <UserAvatar lazyLoad username={topicDetail.author} src={topicDetail.authorAvatarUrl} size={56} />
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
                <HtmlRender html={topicDetail.content} variant='body' fullBleedImages />
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
                      if (!writeCommentSortAscending(next)) {
                        Taro.showToast({ title: "排序偏好保存失败，请重试", icon: "none" });
                      }
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
                            url: `/pages/user/index?username=${encodeURIComponent(comment.authorUserId ?? comment.authorUsername ?? comment.author)}`,
                          });
                        }}
                      >
                        <UserAvatar lazyLoad username={comment.author} src={comment.authorAvatarUrl} size={54} />
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
                                  const label = `@${comment.author}`;
                                  const verifiedAuthor = mentionDraft.current.metadataCurrent && submissionPage.current.generation === mentionGeneration
                                    && mentionMetadata?.comments?.some(item => item.id === comment.id && item.author === comment.author && item.authorUserId === comment.authorUserId);
                                  const uid = verifiedAuthor ? verifiedMentionId(comment.authorUserId) : undefined;
                                  const replyId = verifiedMentionId(getCommentReplyId(comment)) ?? 0;
                                  showCommentDialog({ content: `${label} `, mention: uid === undefined ? undefined : { uid, reply_id: replyId, start: 0, end: label.length, label } });
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
        stickers={commentStickers}
        onStickersChange={(stickers) => setCommentAttachments([
          ...stickers.slice(0, Math.max(0, MAX_COMMENT_ATTACHMENTS - commentPhotos.length)).map(stickerAttachment),
          ...commentAttachments.filter(item => item.kind === 'photo'),
        ])}
        photos={commentPhotos}
        onPhotosChange={(photos) => setCommentAttachments([
          ...photos.slice(0, Math.max(0, MAX_COMMENT_ATTACHMENTS - commentStickers.length)).map(path => photoAttachment(path)),
          ...commentAttachments.filter(item => item.kind === 'sticker'),
        ])}
        previewAttachments={commentAttachments}
        onAttachmentsChange={(next) => setCommentAttachments(next.slice(0, MAX_COMMENT_ATTACHMENTS))}
        topicAuthor={topicDetail.author}
        mentionUsers={[topicDetail.author, ...topicDetail.comments.map((comment) => comment.author)]}
        mentionTargets={mentionTargets}
        onMentionInsert={insertCommentMention}
        mentionAvatars={Object.fromEntries([
          [topicDetail.author, topicDetail.authorAvatarUrl],
          ...topicDetail.comments.map((comment) => [comment.author, comment.authorAvatarUrl]),
        ])}
        sending={sending}
        onChange={changeCommentContent}
        onClose={() => setIsCommenting(false)}
        onSend={async () => {
          if (commentAttachments.some(item => item.kind === 'photo' && item.status !== 'complete')) {
            Taro.showToast({ title: '请等待图片上传完成，失败图片可点击重试', icon: 'none' });
            return;
          }
          if (submissionLock.current || sending || !tid || !submissionPage.current.visible || !submissionPage.current.mounted) return;
          const account = getCachedUsername();
          const owner = composerAccount.current;
          if (!owner?.confirmed || owner.account !== account || owner.scope !== submissionScope || username !== account) {
            Taro.showToast({ title: '账号已切换，请重新打开评论框确认', icon: 'none' });
            return;
          }
          if (!account) {
            Taro.showToast({ title: '请登录后再评论', icon: 'none' });
            return;
          }
          if (getCommentBody(commentContent).trim().length < 3 && commentAttachments.length === 0) {
            Taro.showToast({ title: '评论内容至少3个字', icon: 'none' });
            return;
          }
          submissionLock.current = true;
          const generation = submissionPage.current.generation;
          const lifecycle = submissionPage.current.lifecycle;
          const changedAccount = submissionPage.current.changedAccount;
          const current = () => submissionPage.current.mounted && submissionPage.current.visible &&
            submissionPage.current.generation === generation && submissionPage.current.scope === submissionScope &&
            getCachedUsername() === account && composerAccount.current === owner && owner.confirmed;
          const content = buildAttachmentComment(commentContent, commentAttachments);
          const mentions = mentionDraft.current.text === commentContent
            ? validCommentMentionBindings(content, mentionDraft.current.bindings) : [];
          setSending(true);
          Taro.showLoading({ title: "发送中...", mask: true });
          try {
            // Reuse this account's completed page load, never cached or previous-account capability.
            const formOwner = loadedForm.current;
            const formDetail = formOwner?.account === account && formOwner.scope === submissionScope ? topicDetail : undefined;
            const xsrf = formDetail?.createCommentXSRF;
            const status = formDetail?.createCommentStatus;
            if (!formDetail || formDetail.tid !== tid || !xsrf || (status !== undefined && status !== 'ready')) {
              const title = status === 'login-required' ? '登录状态已失效，请重新登录后重试'
                : status === 'invalid-form' ? '评论表单校验失败，请刷新后重试'
                : status === 'form-unavailable' ? '未读取到评论表单，请刷新帖子后重试' : '暂时无法评论，请刷新后重试';
              Taro.showToast({ title, icon: 'none' });
              return;
            }
            const result = await createNewComment({ tid, _xsrf: xsrf, content, ...(mentions.length ? { mentions } : {}) });
            if (!current()) return;
            setIsCommenting(false);
            setCommentContent("");
            mentionDraft.current.text = '';
            mentionDraft.current.bindings = [];
            setCommentAttachments([]);
            showLatestComments.current = true;
            cancelScrollRef.current?.();
            setHighlightFloor(null);
            setScrollRequest(null);
            setLocatingComment(false);
            try {
              const freshDetail = await getTopicDetail({ tid, latest: true }, { cache: false });
              if (!current()) return;
              if (freshDetail.tid === tid) {
                loadedForm.current = { account, scope: submissionScope };
                mentionDraft.current.metadataCurrent = true;
              }
              setTopicDetail(freshDetail);
              const latestComment = findLatestComment(freshDetail.comments);
              if (freshDetail.commentTotalCount.trim() && !result?.moderated && latestComment) {
                setHighlightFloor(latestComment.floor);
                setScrollRequest({ id: getCommentElementId(latestComment) });
              }
            } catch {
              if (current()) Taro.showToast({ title: '回复已发送，最新回复加载失败，请下拉刷新', icon: 'none' });
            }
          } catch (error) {
            // LoginRequiredError may synchronously sign the account out; still explain that failure on this visible page.
            const loginExpired = error instanceof LoginRequiredError && submissionPage.current.mounted && submissionPage.current.visible &&
              submissionPage.current.lifecycle === lifecycle && submissionPage.current.changedAccount === changedAccount &&
              submissionPage.current.scope === submissionScope && (getCachedUsername() === account || !getCachedUsername());
            if (current() || loginExpired) Taro.showToast({ title: error instanceof LoginRequiredError ? '登录状态已失效，请重新登录后重试'
              : error instanceof CommentSubmissionError ? error.message : "评论发送失败，请重试", icon: "none" });
          } finally {
            submissionLock.current = false;
            if (submissionPage.current.mounted) setSending(false);
            if (submissionPage.current.visible && submissionPage.current.mounted) Taro.hideLoading();
          }
        }}
      />}
      <AddToDesktopGuide />
    </>
  );
};

// Native share lifecycles are registered before rendering; page config flags may be stripped.
Index.enableShareAppMessage = true;
Index.enableShareTimeline = true;

export default Index;
