import React, { useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { UserProfile, URLS, urlPathVaiable } from "guanggu-forum-api";
import { getFromLocalCache } from "../../utils/localAssets";
import Tag from "../Tag";
import NodeIcon from "../../assets/topic_node.svg";
import CommentIcon from "../../assets/comment.svg";
import "./index.scss";

interface Props {
  profile: UserProfile;
  actions?: React.ReactNode;
  navPaddingTop?: number;
}

const TAB_LIST = [
  { key: "topics", label: "帖子" },
  { key: "replies", label: "回复" },
  { key: "favorites", label: "收藏" },
] as const;

type TabKey = (typeof TAB_LIST)[number]["key"];

export default function UserProfileDetail({ profile, actions, navPaddingTop }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("topics");

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

  return (
    <View className="userProfileDetail">
      {/* 头像 + 名 + ID + 操作 */}
      <View className="profileCard" style={{
        paddingTop: navPaddingTop,
      }}>
        <View className="topRow">
          <View className="avatar">
            <Image src={getFromLocalCache(profile.avatarUrl)} />
          </View>
          <View className="nameBlock">
            <View className="nameRow">
              <Text className="username">{profile.username}</Text>
              {profile.reputation != null && (
                <View className="levelBadge">
                  Lv.{Math.min(9, Math.floor((profile.reputation || 0) / 100) + 1)}
                </View>
              )}
            </View>
            {profile.nickname && profile.nickname !== profile.username && (
              <View className="nickname">{profile.nickname}</View>
            )}
            <View className="memberInfo">
              {profile.memberNumber}
              {profile.joinDate && ` · ${profile.joinDate.replace("入住于", "")}`}
            </View>
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
          <View className="cardTitle">个人简介</View>
          {profile.city && (
            <View className="detailRow">
              <View className="detailLabel">城市</View>
              <View className="detailValue">{profile.city}</View>
            </View>
          )}
          {profile.email && (
            <View className="detailRow">
              <View className="detailLabel">Email</View>
              <View className="detailValue">{profile.email}</View>
            </View>
          )}
          {profile.blog && (
            <View className="detailRow">
              <View className="detailLabel">Blog</View>
              <View className="detailValue">{profile.blog}</View>
            </View>
          )}
          {profile.website && profile.website !== profile.blog && (
            <View className="detailRow">
              <View className="detailLabel">网站</View>
              <View className="detailValue">{profile.website}</View>
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
                  <View className="topicTitle">{topic.title}</View>
                  <View className="topicMeta">
                    <Tag
                      onClick={(e) => {
                        e?.stopPropagation?.();
                        navigateToNode(`/node/${topic.category}`, topic.category);
                      }}
                    >
                      <Image src={NodeIcon} svg className="tagIcon" />
                      <View style={{ display: "inline-block" }}>{topic.category}</View>
                    </Tag>
                    <View className="topicTime">
                      {topic.lastUpdated.replace(" ", "")}
                    </View>
                    <View className="topicCommentCount">
                      <Image src={CommentIcon} svg />
                      {topic.commentCount || 0}
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View className="emptyTip">暂无帖子</View>
            ))}

          {activeTab === "replies" &&
            (profile.replies.length > 0 ? (
              profile.replies.map((reply, idx) => (
                <View
                  key={idx}
                  className="replyItem"
                  onClick={() => navigateToTopic(reply.topicLink)}
                >
                  <View className="replyTitle">
                    回复了{" "}
                    <Text>
                      {reply.replyTitle.replace(/^回复了\s+\S+\s+创建的主题\s*/, "")}
                    </Text>
                  </View>
                  <View className="replyContent">
                    {reply.content.replace(/<[^>]*>/g, "").trim()}
                  </View>
                </View>
              ))
            ) : (
              <View className="emptyTip">暂无回复</View>
            ))}

          {activeTab === "favorites" && (
            <View className="emptyTip">暂无收藏</View>
          )}
        </View>
      </View>
    </View>
  );
}
