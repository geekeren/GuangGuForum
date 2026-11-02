import { getScrollViewType } from "../../../utils/renderer";
import { View, Image, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { parse, Node } from "node-html-parser";
import { getNotifications, resolveSearchResult } from "guanggu-forum-api";
import { useCurrentUsername } from "../../../hooks/useCurrentUsername";
import HtmlRender from "../../../components/HtmlRender";
import Loading from "../../../components/Loading";
import LoginPrompt from "../../../components/LoginPrompt";
import UserAvatar from '../../../components/UserAvatar';
import NotificationIcon from "../../../assets/notification-active.svg?raw";
import ThemedIcon from "../../../components/ThemedIcon";
import { useTheme } from "../../../hooks/useTheme";
import { THEME_PALETTES } from "../../../utils/themePreferences";
import { svgIconSource } from "../../../utils/svgIcon";
import ReplyIcon from "../../../assets/notification-replies.svg";
import AnnouncementIcon from "../../../assets/notification-announcements.svg";
import { useDataWithCache } from "../../../hooks/useDataWithCache";
import { buildTopicReplyRoute, parseTopicReplyLink, replyPlainText } from "../../../utils/topicReplyRoute";
import { getUnreadNotificationCount, subscribeUnreadNotifications } from "../../../utils/unreadNotifications";
import { fetchAndCacheNodeNavigation, getCachedNodeNavigation } from "../../../utils/nodeNavigation";
import "./index.scss";

const Notifications = ({ active }: { active?: boolean }) => {
  const { theme } = useTheme();
  const notificationSource = svgIconSource(NotificationIcon, THEME_PALETTES[theme]["accent-text"]);
  const { username, loading: checkingLogin, error: loginError, retry } = useCurrentUsername(active);
  const { data: notifications, loading, request: fetchNotifications } = useDataWithCache(getNotifications);
  const [requestError, setRequestError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [unread, setUnread] = useState(getUnreadNotificationCount);
  const [scrollTop, setScrollTop] = useState<number | undefined>(undefined);
  const openingAnnouncements = useRef(false);

  useEffect(() => subscribeUnreadNotifications(setUnread), [username]);

  useEffect(() => {
    if (!active || !username) return;
    let cancelled = false;
    setRequestError(false);
    fetchNotifications({ page: 1 }).catch(() => {
      if (!cancelled) setRequestError(true);
    });
    return () => { cancelled = true; };
  }, [active, username, fetchNotifications, attempt]);

  // 公告入口打开真实板块的新页面，不改变消息页当前选中项。
  const openAnnouncements = async () => {
    if (openingAnnouncements.current) return;
    openingAnnouncements.current = true;
    try {
      let node = getCachedNodeNavigation().flatMap(group => group.nodes)
        .find(item => item.name === "公告" || item.name === "社区公告");
      if (!node) {
        node = (await fetchAndCacheNodeNavigation()).flatMap(group => group.nodes)
          .find(item => item.name === "公告" || item.name === "社区公告");
      }
      if (!node) {
        Taro.showToast({ title: "暂未找到公告板块", icon: "none" });
        return;
      }
      await Taro.navigateTo({
        url: `/pages/node/topicList/index?node=${encodeURIComponent(node.slug)}&nodeName=${encodeURIComponent(node.name)}`,
      });
    } catch {
      Taro.showToast({ title: "公告加载失败，请重试", icon: "none" });
    } finally {
      openingAnnouncements.current = false;
    }
  };

  if (checkingLogin && !username) return <Loading />;

  // 未登录时和“我的”页保持一致：给出可直接登录的入口，而不是一个无法自愈的错误页。
  if (!username) {
    return (
      <View className='notificationsPage' style={{ height: "100%" }}>
        <View className='loginPromptWrap'>
          <LoginPrompt
            icon='消息'
            iconSrc={notificationSource}
            title='登录后查看消息'
            desc='接收回复和提及通知'
          />
          {loginError && (
            <Text className='loginRetryHint' onClick={retry}>账号信息加载失败，点击重试</Text>
          )}
        </View>
      </View>
    );
  }

  if (requestError) {
    return (
      <View className='notificationsPage notificationsPage--center'>
        <View className='emptyState' onClick={() => { retry(); setAttempt((value) => value + 1); }}>
          <Text className='emptyTitle'>消息加载失败，点击重试</Text>
          <Text className='emptyDesc'>保留登录状态，请检查网络后重试</Text>
        </View>
      </View>
    );
  }

  return (
    <View className='notificationsPage' style={{ height: "100%" }}>
      <View className='notificationTabs'>
        <View
          className='notificationTab notificationTab--active'
          onClick={() => setScrollTop(0)}
        >
          <Image src={ReplyIcon} svg className='notificationTabIcon' />
          <Text className='notificationTabLabel'>评论回复</Text>
          {unread > 0 && <View className='notificationTabDot' />}
        </View>
        <View
          className='notificationTab'
          onClick={openAnnouncements}
        >
          <Image src={AnnouncementIcon} svg className='notificationTabIcon' />
          <Text className='notificationTabLabel'>社区公告</Text>
        </View>
      </View>
      {loading && !notifications ? (
        <View className='notificationStatus'><Loading /></View>
      ) : !notifications || notifications.length === 0 ? (
        <View className='notificationStatus'>
          <View className='emptyState'>
            <View className='emptyIcon'><ThemedIcon src={NotificationIcon} tone='accent-text' /></View>
            <Text className='emptyTitle'>暂无消息</Text>
            <Text className='emptyDesc'>有人回复或提及时会在这里通知你</Text>
          </View>
        </View>
      ) : (
        <ScrollView type={getScrollViewType()} scrollY enhanced scrollTop={scrollTop} onScroll={() => setScrollTop(undefined)} className='notificationsList'>
          {notifications.map((item, index) => {
            const title = notificationTitle(item.titleHtml, item.topicTitle);
            return (
            <View
              key={index}
              className='notificationItem'
              onClick={() => {
                if (item.topicLink) {
                  navigateToTopic(item.topicLink, item.content);
                }
              }}
            >
              <View className='notificationAvatar' onClick={(e) => {
                e.stopPropagation();
                Taro.navigateTo({ url: `/pages/user/index?username=${encodeURIComponent(item.username)}` });
              }}>
                <UserAvatar username={item.username} src={item.userAvatarUrl} size={70} className='avatarImg' />
              </View>
              <View className='notificationBody'>
                <View className='notificationHeader'>
                  <Text
                    className='notificationUser'
                    overflow='ellipsis'
                    maxLines={1}
                    onClick={(e) => {
                      e.stopPropagation();
                      Taro.navigateTo({
                        url: `/pages/user/index?username=${encodeURIComponent(item.username)}`,
                      });
                    }}
                  >
                    {item.username}
                  </Text>
                  <Text className='notificationBadge'>{title.badge}</Text>
                </View>
                <Text className='notificationTitle'>
                  <Text className='notificationAction'>{title.before}</Text>
                  {title.hasTopic && (
                    <Text
                      className='notificationTopicLink'
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.topicLink) {
                          navigateToTopic(item.topicLink, item.content);
                        }
                      }}
                    >
                      {item.topicTitle}
                    </Text>
                  )}
                  <Text className='notificationAction'>{title.after}</Text>
                </Text>
                {item.content && (
                  <View className='notificationContent'>
                    <HtmlRender html={item.content} />
                  </View>
                )}
              </View>
            </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

async function navigateToTopic(topicLink: string, content?: string) {  const target = parseTopicReplyLink(topicLink);
  if (!target) {
    Taro.showToast({ title: "无法打开这条消息", icon: "none" });
    return;
  }
  try {
    const resolved = target.tid
      ? target
      : await resolveSearchResult({ link: `/search/reply/${target.replyId}` }, { notifyLoginRequired: false });
    Taro.navigateTo({
      url: buildTopicReplyRoute({
        ...resolved,
        // Text is a legacy fallback only; preserve the whole notification excerpt, not ten characters.
        ...(!resolved.replyId && content ? { commentMessage: replyPlainText(content) } : {}),
      }),
    });
  } catch {
    Taro.showToast({ title: "回复定位失败，请重试", icon: "none" });
  }
}

function notificationTitle(titleHtml: string, topicTitle: string) {
  const root = parse(titleHtml);
  const anchors = root.querySelectorAll("a");
  const topic = anchors.length > 1 && topicTitle ? anchors[anchors.length - 1] : undefined;
  anchors[0]?.remove();
  let before = "", after = "", passedTopic = false;
  const collect = (node: Node) => {
    if (node === topic) { passedTopic = true; return; }
    if (node.nodeType === 3) {
      if (passedTopic) after += node.textContent;
      else before += node.textContent;
    } else node.childNodes.forEach(collect);
  };
  collect(root);
  before = before.replace(/\s+/g, " ").trim();
  after = after.replace(/\s+/g, " ").trim();
  const action = `${before} ${after}`;
  const mention = /提到|提及|@/.test(action);
  const reply = /回复|评论/.test(action);
  const badge = mention ? "提到了你" : reply ? "回复了你" : "消息";
  if (topic && mention) return { before: "在《", after: "》中提到了你", hasTopic: true, badge };
  if (topic) return { before: `${before}《`, after: `》${after}`, hasTopic: true, badge };
  return { before, after, hasTopic: false, badge };
}

export default Notifications;
