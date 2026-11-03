import React, { Component } from "react";
import { View, Text, Image, ShareElement } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./index.scss";
import Topics from "./topics";
import Discovery from "./discovery";
import Me from "../me/index";
import Notifications from "./notifications";
import Navbar from "../../components/Navbar/index";
import AddToDesktopGuide from "../../components/AddToDesktopGuide";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from "../config";
import { getBottomSafeAreaInset, getNavInfo, rpxToPx } from "../../utils/dimension";
import { isSkyline } from "../../utils/renderer";
import HomeIcon from "../../assets/home.svg?raw";
import HomeActiveIcon from "../../assets/home-active.svg?raw";
import DiscoverIcon from "../../assets/discover.svg?raw";
import DiscoverActiveIcon from "../../assets/discover-active.svg?raw";
import UserIcon from "../../assets/user.svg?raw";
import UserActiveIcon from "../../assets/user-active.svg?raw";
import NotificationIcon from "../../assets/notification.svg?raw";
import NotificationActiveIcon from "../../assets/notification-active.svg?raw";
import ComposePlusIcon from "../../assets/home-compose-plus.svg";
import SearchEntry from "../../components/SearchEntry";
import ThemedIcon from "../../components/ThemedIcon";
import { getUnreadNotificationCount, subscribeUnreadNotifications } from "../../utils/unreadNotifications";

interface State {
  selectedTabIndex: number;
  unreadNotifications: number;
  pageVisible: boolean;
  initialTopicTab?: string;
}

const TAB_CONFIG = [
  { title: "首页", icon: HomeIcon, activeIcon: HomeActiveIcon },
  { title: "发现", icon: DiscoverIcon, activeIcon: DiscoverActiveIcon },
  { title: "", icon: null, activeIcon: null },
  { title: "消息", icon: NotificationIcon, activeIcon: NotificationActiveIcon },
  { title: "我的", icon: UserIcon, activeIcon: UserActiveIcon },
];

function TabIcon({ tab, active }: { tab: typeof TAB_CONFIG[number]; active: boolean }) {
  return <ThemedIcon src={(active ? tab.activeIcon : tab.icon)!} tone={active ? 'accent' : 'secondary'} lightColor={active ? '#1f69ff' : '#6b7488'} className='tabIcon' />;
}

export default class Index extends Component<{}, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      selectedTabIndex: 0,
      unreadNotifications: getUnreadNotificationCount(),
      pageVisible: true,
    };
  }

  componentDidMount() {
    this.stopUnreadSubscription = subscribeUnreadNotifications((count) => {
      this.setState({ unreadNotifications: count });
    });
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.tab) {
      const tab = parseInt(params.tab);
      if ([0, 1, 3, 4].includes(tab)) {
        this.setState({ selectedTabIndex: tab, initialTopicTab: params.topicTab });
      }
    }
  }

  componentDidShow() {
    this.setState({ unreadNotifications: getUnreadNotificationCount(), pageVisible: true });
  }

  componentDidHide() {
    this.setState({ pageVisible: false });
  }

  componentWillUnmount() {
    this.stopUnreadSubscription?.();
  }

  onShareAppMessage() {
    return { title: "过早客 - 武汉本地生活社区", path: "/pages/home/index" };
  }

  onShareTimeline() {
    return { title: "过早客 - 武汉本地生活社区", query: "" };
  }

  private stopUnreadSubscription?: () => void;

  private handleClick(value: number): void {
    if (value === 2) {
      void Taro.navigateTo({ url: "/pages/createTopic/index" });
    } else {
      this.setState({ selectedTabIndex: value });
    }
  }

  render() {
    const skyline = isSkyline();
    const bottomTabStyle = skyline ? {
      paddingBottom: Math.max(rpxToPx(16), getBottomSafeAreaInset()) + "px",
    } : undefined;

    return (
      <>
        <View className={this.state.selectedTabIndex === 0 ? "root root--topics" : this.state.selectedTabIndex === 1 ? "root root--discovery" : this.state.selectedTabIndex === 4 ? "root root--me" : "root"}>
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 0 && (
            <Navbar>
              <Text className="navTitle">过早客</Text>
              <SearchEntry style={{ height: getNavInfo().capsuleHeight + "px" }} />
            </Navbar>
          )}
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 1 && (
            <Navbar left>
              <Text className="navTitle">过早客</Text>
            </Navbar>
          )}
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 3 && (
            <Navbar left>
              <Text className="navTitle">消息</Text>
            </Navbar>
          )}
          <View className="tabContent">
            <View style={{ display: this.state.selectedTabIndex === 0 ? 'block' : 'none', height: '100%' }}>
              <Topics initialTab={this.state.initialTopicTab} />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 1 ? 'block' : 'none', height: '100%' }}>
              <Discovery active={this.state.selectedTabIndex === 1 && this.state.pageVisible} />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 3 ? 'block' : 'none', height: '100%' }}>
              <Notifications active={this.state.selectedTabIndex === 3} />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 4 ? 'block' : 'none', height: '100%' }}>
              <Me active={this.state.selectedTabIndex === 4} />
            </View>
          </View>
          {!HIDE_TAB && (
            <View className={skyline ? "bottomTab bottomTab--skyline" : "bottomTab"} style={bottomTabStyle}>
              {TAB_CONFIG.map((tab, index) => {
                const active = this.state.selectedTabIndex === index;
                if (index === 2) {
                  return (
                    <View key={index} className="tabItem tabItem--add" onClick={() => this.handleClick(index)}>
                      <ShareElement mapkey="create_topic_btn" className="composeShareElement">
                        <View className="addIcon">
                          <Image src={ComposePlusIcon} svg mode="aspectFit" className="composePlusIcon" />
                        </View>
                      </ShareElement>
                    </View>
                  );
                }
                return (
                  <View key={index} className={`tabItem ${active ? "tabItem--active" : ""}`} onClick={() => this.handleClick(index)}>
                    <View className="tabIconWrap">
                      <TabIcon tab={tab} active={active} />
                      {index === 3 && this.state.unreadNotifications > 0 && <View className='tabUnreadDot' />}
                    </View>
                    <Text className="tabTitle">{tab.title}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        <AddToDesktopGuide />
      </>
    );
  }
}
