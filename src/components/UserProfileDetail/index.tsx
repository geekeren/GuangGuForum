import React, { useState, useEffect } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { UserProfile, URLS, urlPathVaiable, getUserFavorites, FavoriteTopic } from "guanggu-forum-api";
import UserAvatar from '../UserAvatar';
import TopicTag from "../TopicTag";
import CommentIcon from "../../assets/comment.svg?raw";
import ThemedIcon from "../ThemedIcon";
import Loading from "../Loading";
import RecentlyViewedTopics from '../RecentlyViewedTopics';
import { usePageRenderer } from "../../hooks/usePageRenderer";
import "./index.scss";

interface Props {
  profile: UserProfile;
  className?: string;
  actions?: React.ReactNode;
  navPaddingTop?: number;
  /** Opt in when the containing page owns the hero background. */
  backgroundOwner?: 'page';
  showRecentlyViewed?: boolean;
  active?: boolean;
}

const TAB_LIST = [
  { key: "topics", label: "帖子" },
  { key: "replies", label: "回复" },
  { key: "favorites", label: "收藏" },
] as const;

type TabKey = (typeof TAB_LIST)[number]["key"] | 'recent';

export default function UserProfileDetail({ profile, className = "", actions, navPaddingTop, backgroundOwner, showRecentlyViewed = false, active = true }: Props) {
  const skyline = usePageRenderer() === "skyline";
  const singleLine = skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {};
  const twoLines = skyline ? { overflow: "ellipsis", maxLines: 2 } as const : {};
  const [activeTab, setActiveTab] = useState<TabKey>("topics");
  const [favorites, setFavorites] = useState<FavoriteTopic[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const tabs = showRecentlyViewed ? [...TAB_LIST, { key: 'recent' as const, label: '最近浏览' }] : TAB_LIST;
  const displayName = profile.nickname?.trim() || profile.displayName?.trim() || profile.username;

  useEffect(() => {
    if (activeTab === "favorites" && favorites.length === 0) {
      setFavoritesLoading(true);
      getUserFavorites({ username: profile.username })
        .then(setFavorites)
        .finally(() => setFavoritesLoading(false));
    }
  }, [activeTab, profile.username]);

  const navigateToTopic = (link: string) => {
    const tid = urlPathVaiable(URLS.TOPIC_DETAIL)(link)?.params?.tid;
    if (tid) {
      Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
    }
  };

  const navigateToNode = (link: string, nodeName: string) => {
    const node = urlPathVaiable(URLS.NODE_HOME_PAGE)(link)?.params?.node;
    if (node) {
      Taro.navigateTo({
        url: `/pages/node/topicList/index?node=${node}&nodeName=${nodeName}`,
      });
    }
  };

  const renderTopicTag = (category: string) => {
    const onClick = (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      navigateToNode(`/node/${category}`, category);
    };
    return <TopicTag label={category} onClick={onClick} />;
  };

  const profileCard = (
      <View className="profileCard" style={{
        paddingTop: navPaddingTop,
      }}>
        <View className="topRow">
          <View className="avatar">
            <UserAvatar username={profile.username} src={profile.avatarUrl} size={140} />
          </View>
          <View className="nameBlock">
            <View className="nameRow">
              <Text className="username" {...singleLine}>{displayName}</Text>
              {profile.level && (
                <Text className="levelBadge">{profile.level}</Text>
              )}
            </View>
            {displayName !== profile.username && (
              <Text className="nickname" {...singleLine}>{profile.username}</Text>
            )}
            <Text className="memberInfo">
              {profile.memberNumber}
              {profile.joinDate && ` · ${profile.joinDate.replace("入住于", "")}`}
            </Text>
          </View>
          {actions}
        </View>
        <View className="stats">
          <View className="stat-item">
            <Text className="stat-value">{profile.topicCount || 0}</Text>
            <Text className="stat-label">主题</Text>
          </View>
          <View className="stat-item">
            <Text className="stat-value">{profile.replyCount || 0}</Text>
            <Text className="stat-label">回复</Text>
          </View>
          <View className="stat-item">
            <Text className="stat-value">{profile.favoriteCount || 0}</Text>
            <Text className="stat-label">收藏</Text>
          </View>
          <View className="stat-item">
            <Text className="stat-value">{profile.reputation || 0}</Text>
            <Text className="stat-label">信用</Text>
          </View>
        </View>
      </View>
  );
  const profileBody = (
    <>
      {/* 个人简介 */}
      {(profile.city || profile.email || profile.blog || profile.website) && (
        <View className="detailCard">
          <Text className="cardTitle">个人简介</Text>
          {profile.city && (
            <View className="detailRow">
              <Text className="detailLabel">城市</Text>
              <Text className="detailValue">{profile.city}</Text>
            </View>
          )}
          {profile.email && (
            <View className="detailRow">
              <Text className="detailLabel">Email</Text>
              <Text className="detailValue">{profile.email}</Text>
            </View>
          )}
          {profile.blog && (
            <View className="detailRow">
              <Text className="detailLabel">Blog</Text>
              <Text className="detailValue">{profile.blog}</Text>
            </View>
          )}
          {profile.website && profile.website !== profile.blog && (
            <View className="detailRow">
              <Text className="detailLabel">网站</Text>
              <Text className="detailValue">{profile.website}</Text>
            </View>
          )}
        </View>
      )}

      {/* Tab 卡片 */}
      <View className="tabCard">
        <View className="tabBar">
          {tabs.map((tab) => (
            <View
              key={tab.key}
              className={`tabItem ${activeTab === tab.key ? "tabItem--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Text className="tabLabel">{tab.label}</Text>
              {activeTab === tab.key && <View className="tabUnderline" />}
            </View>
          ))}
        </View>

        <View className="tabBody">
          {activeTab === 'recent' && showRecentlyViewed && <RecentlyViewedTopics key={profile.username} username={profile.username} active={active} />}
          {activeTab === "topics" &&
            (profile.topics.length > 0 ? (
              profile.topics.map((topic, idx) => (
                <View
                  key={idx}
                  className="topicItem"
                  onClick={() => navigateToTopic(topic.link)}
                >
                  <Text className="topicTitle" {...twoLines}>{topic.title}</Text>
                  <View className="topicMeta">
                    {renderTopicTag(topic.category)}
                    <Text className="topicTime" {...singleLine}>
                      {topic.lastUpdated}
                    </Text>
                    <View className="topicCommentCount">
                      <ThemedIcon src={CommentIcon} tone='muted' lightColor='#000000' />
                      <Text>{topic.commentCount || 0}</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text className="emptyTip">暂无帖子</Text>
            ))}

          {activeTab === "replies" &&
            (profile.replies.length > 0 ? (
              profile.replies.map((reply, idx) => (
                <View
                  key={idx}
                  className="replyItem"
                  onClick={() => navigateToTopic(reply.topicLink)}
                >
                  <Text className="replyTitle" {...singleLine}>
                    <Text>
                      {reply.replyTitle.replace(/^回复了\s+\S+\s+创建的主题\s*/, "")}
                    </Text>
                  </Text>
                  <Text className="replyContent" {...twoLines}>
                    {reply.content.replace(/<[^>]*>/g, "").trim()}
                  </Text>
                </View>
              ))
            ) : (
              <Text className="emptyTip">暂无回复</Text>
            ))}

          {activeTab === "favorites" &&
            (favoritesLoading ? (
              <Loading />
            ) : favorites.length > 0 ? (
              favorites.map((topic, idx) => (
                <View
                  key={idx}
                  className="topicItem"
                  onClick={() => navigateToTopic(topic.link)}
                >
                  <Text className="topicTitle" {...twoLines}>{topic.title}</Text>
                  <View className="topicMeta">
                    {renderTopicTag(topic.category)}
                    <Text className="topicTime" {...singleLine}>
                      {topic.lastUpdated}
                    </Text>
                    <View className="topicCommentCount">
                      <ThemedIcon src={CommentIcon} tone='muted' lightColor='#000000' />
                      <Text>{topic.commentCount || 0}</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text className="emptyTip">暂无收藏</Text>
            ))}
        </View>
      </View>
    </>
  );

  return (
    <View className={`userProfileDetail${skyline ? " userProfileDetail--skyline" : ""}${className ? ` ${className}` : ""}${backgroundOwner === 'page' ? ' userProfileDetail--pageBackground' : ''}`}>
      {profileCard}
      {backgroundOwner === 'page' ? <View className='profileBody'>{profileBody}</View> : profileBody}
    </View>
  );
}
