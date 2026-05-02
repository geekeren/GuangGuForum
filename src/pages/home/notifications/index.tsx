import { View, Image, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getNotifications, Notification } from "guanggu-forum-api";
import { getCachedUsername } from "../../../utils/currentUser";
import { withCache } from "../../../utils/cacheRequest";
import HtmlRender from "../../../components/HtmlRender";
import Loading from "../../../components/Loading";
import LoginPrompt from "../../../components/LoginPrompt";
import "./index.scss";

const Notifications = ({ active }: { active?: boolean }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchNotifications = () => {
    if (!getCachedUsername()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { cached, refresh } = withCache<Notification[]>(
      "notifications",
      () => getNotifications({ page: 1 }),
    );
    if (cached) {
      setNotifications(cached);
      setLoading(false);
    }
    refresh.then((data) => {
      setNotifications(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (active) fetchNotifications();
  }, [active, refreshKey]);

  if (!getCachedUsername()) {
    return (
      <View className="notificationsPage" style={{ height: "100%" }}>
        <LoginPrompt
          icon="🔔"
          title="登录后查看消息"
          desc="接收回复和提及通知"
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View className="notificationsPage" style={{ height: "100%" }}>
        <Loading />
      </View>
    );
  }

  if (notifications.length === 0) {
    return (
      <View className="notificationsPage" style={{ height: "100%" }}>
        <View className="emptyState">
          <View className="emptyIcon">🔔</View>
          <View className="emptyTitle">暂无消息</View>
          <View className="emptyDesc">有人回复或提及时会在这里通知你</View>
        </View>
      </View>
    );
  }

  return (
    <View className="notificationsPage" style={{ height: "100%" }}>
      <ScrollView scrollY className="notificationsList">
        {notifications.map((item, index) => (
          <View
            key={index}
            className="notificationItem"
            onClick={() => {
              if (item.topicLink) {
                const tid = item.topicLink.replace("/t/", "");
                Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
              }
            }}
          >
            <View className="notificationAvatar">
              <Image src={item.userAvatarUrl} className="avatarImg" />
            </View>
            <View className="notificationBody">
              <View className="notificationTitle">
                <Text
                  className="notificationUser"
                  onClick={(e) => {
                    e.stopPropagation();
                    Taro.navigateTo({
                      url: `/pages/user/index?username=${item.username}`,
                    });
                  }}
                >
                  {item.username}
                </Text>
                <Text className="notificationAction">
                  {" "}
                  {parseActionPrefix(item.titleHtml)}{" "}
                </Text>
                {item.topicTitle && (
                  <Text
                    className="notificationTopicLink"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.topicLink) {
                        const tid = item.topicLink.replace("/t/", "");
                        Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
                      }
                    }}
                  >
                    {item.topicTitle}
                  </Text>
                )}
              </View>
              {item.content && (
                <View className="notificationContent">
                  <HtmlRender html={item.content} />
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

function parseActionPrefix(titleHtml: string): string {
  // titleHtml format: <a>username</a> action text <a>topicTitle</a>
  // Remove first and last <a>...</a> tags, keep only the action text between them
  let text = titleHtml;
  // Remove first <a>...</a>
  text = text.replace(/<a[^>]*>[\s\S]*?<\/a>/, "");
  // Remove last <a>...</a>
  text = text.replace(/<a[^>]*>[\s\S]*?<\/a>\s*$/, "");
  // Strip any remaining HTML tags and trim
  return text.replace(/<[^>]+>/g, "").trim();
}

export default Notifications;
