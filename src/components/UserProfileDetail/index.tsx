import React, { useState, useEffect } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { UserProfile, URLS, urlPathVaiable, getUserFavorites, FavoriteTopic } from "guanggu-forum-api";
import { getFromLocalCache } from "../../utils/localAssets";
import TopicTag from "../TopicTag";
import CommentIcon from "../../assets/comment.svg?raw";
import ThemedIcon from "../ThemedIcon";
import Loading from "../Loading";
import { isSkyline } from "../../utils/renderer";
import "./index.scss";

interface Props {
  profile: UserProfile;
  className?: string;
  actions?: React.ReactNode;
  navPaddingTop?: number;
}

const TAB_LIST = [
  { key: "topics", label: "帖子" },
  { key: "replies", label: "回复" },
  { key: "favorites", label: "收藏" },
] as const;

type TabKey = (typeof TAB_LIST)[number]["key"];

export default function UserProfileDetail({ profile, className = "", actions, navPaddingTop }: Props) {
  const skyline = isSkyline();
  const singleLine = skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {};
  const twoLines = skyline ? { overflow: "ellipsis", maxLines: 2 } as const : {};
  const [activeTab, setActiveTab] = useState<TabKey>("topics");
  const [favorites, setFavorites] = useState<FavoriteTopic[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

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

  return (
    <View className={`userProfileDetail${skyline ? " userProfileDetail--skyline" : ""}${className ? ` ${className}` : ""}`}>
      {/* 头像 + 名 + ID + 操作 */}
      <View className="profileCard" style={{
        paddingTop: navPaddingTop,
      }}>
        <View className="topRow">
          <View className="avatar">
            <Image src={getFromLocalCache(profile.avatarUrl)} svg={profile.avatarUrl?.endsWith('/m_default.png')} />
          </View>
          <View className="nameBlock">
            <View className="nameRow">
              <Text className="username" {...singleLine}>{profile.username}</Text>
              {profile.level && (
                <Text className="levelBadge">{profile.level}</Text>
              )}
            </View>
            {profile.nickname && profile.nickname !== profile.username && (
              <Text className="nickname" {...singleLine}>{profile.nickname}</Text>
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
          {TAB_LIST.map((tab) => (
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
    </View>
  );
}
