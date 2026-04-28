import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getUserProfile, UserProfile, URLS, urlPathVaiable } from "guanggu-forum-api";
import "./index.scss";
import Loading from "../../components/Loading";
import { getFromLocalCache } from "../../utils/localAssets";
import { getCachedUsername } from "../../utils/currentUser";
import Tag from "../../components/Tag";
import NodeIcon from "../../assets/topic_node.svg";
import CommentIcon from "../../assets/comment.svg";
import { withCache } from "../../utils/cacheRequest";

const Me = () => {
  const [profile, setProfile] = useState<UserProfile>();

  useEffect(() => {
    const username = getCachedUsername();
    if (!username) return;
    const { cached, refresh } = withCache<UserProfile>(
      `user_profile_${username}`,
      () => getUserProfile(username),
    );
    if (cached) setProfile(cached);
    refresh.then(setProfile);
  }, []);

  if (!getCachedUsername()) {
    return (
      <View className="meProfile">
        <View className="notLoggedIn">
          <View className="loginTip">登录后查看个人信息</View>
          <View
            className="loginBtn"
            onClick={() => Taro.reLaunch({ url: "/pages/login/index" })}
          >
            去登录
          </View>
        </View>
      </View>
    );
  }

  if (!profile) {
    return <Loading />;
  }

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
    <View className="meProfile">
      <View className="profileCard">
        <View className="avatar">
          <Image src={getFromLocalCache(profile.avatarUrl)} />
        </View>
        <View className="username">{profile.username}</View>
        {profile.nickname && profile.nickname !== profile.username && (
          <View className="memberInfo">{profile.nickname}</View>
        )}
        <View className="memberInfo">
          {profile.memberNumber}
          {profile.joinDate && ` · ${profile.joinDate.replace("入住于", "")}`}
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

      {(profile.city || profile.email || profile.blog) && (
        <View className="detailCard">
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

      {profile.topics.length > 0 && (
        <View className="section">
          <View className="sectionHeader">
            <View className="sectionTitle">最近主题</View>
          </View>
          {profile.topics.map((topic, idx) => (
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
                    navigateToNode(
                      `/node/${topic.category}`,
                      topic.category,
                    );
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
          ))}
        </View>
      )}

      {profile.replies.length > 0 && (
        <View className="section">
          <View className="sectionHeader">
            <View className="sectionTitle">最近回复</View>
          </View>
          {profile.replies.map((reply, idx) => (
            <View
              key={idx}
              className="replyItem"
              onClick={() => navigateToTopic(reply.topicLink)}
            >
              <View className="replyTitle">
                回复了 <Text>{reply.replyTitle.replace(/^回复了\s+\S+\s+创建的主题\s*/, "")}</Text>
              </View>
              <View className="replyContent">
                {reply.content.replace(/<[^>]*>/g, "").trim()}
              </View>
            </View>
          ))}
        </View>
      )}

      {profile.topics.length === 0 && profile.replies.length === 0 && (
        <View className="emptyTip">暂无动态</View>
      )}
    </View>
  );
};

export default Me;
