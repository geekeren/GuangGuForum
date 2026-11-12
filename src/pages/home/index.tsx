import React, { Component } from "react";
import { View, Text, ShareElement } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  Home as HomeIcon, HomeActive as HomeActiveIcon, Discover as DiscoverIcon,
  DiscoverActive as DiscoverActiveIcon, User as UserIcon, UserActive as UserActiveIcon,
  Bell as NotificationIcon, BellActive as NotificationActiveIcon, Plus as ComposePlusIcon,
} from "gzk-ui/icons";
import "./index.scss";
import DesktopLayout from "../../components/DesktopLayout";
import DesktopSidebar from "./DesktopSidebar";
import HomeHotNodes from "./HomeHotNodes";
import Topics from "./topics";
import Discovery from "./discovery";
import Me from "../me/index";
import Notifications from "./notifications";
import Navbar from "../../components/Navbar/index";
import AddToDesktopGuide from "../../components/AddToDesktopGuide";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from "../config";
import { getNavInfo } from "../../utils/dimension";
import { isSkyline } from "../../utils/renderer";
import SearchEntry from "../../components/SearchEntry";
import ThemedIcon from "../../components/ThemedIcon";
import { getUnreadNotificationCount, subscribeUnreadNotifications } from "../../utils/unreadNotifications";
import { capturePageOwner, createPageNavigation } from "../../utils/pageScope";
import { getPageViewportStore } from "../../utils/pageViewport";
import { PageScopeContext, type PageScopeValue } from "../../hooks/usePageScope";
import type { PageRenderer } from "../../hooks/usePageRenderer";

interface State {
  selectedTabIndex: number;
  unreadNotifications: number;
  pageVisible: boolean;
  initialTopicTab?: string;
  topicSelectionRequest: number;
  visitedTabs: Record<number, boolean>;
}

const CONTENT_TABS = [0, 1, 3, 4];

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
  static contextType = PageScopeContext;
  private readonly pageOwner = (this.context as PageScopeValue | undefined)?.owner ?? capturePageOwner();
  private readonly navigation = createPageNavigation(this.pageOwner);
  private readonly viewport = (this.context as PageScopeValue | undefined)?.viewport ?? getPageViewportStore(this.pageOwner);
  private stopViewport?: () => void;
  private readonly fallbackRenderer: PageRenderer;
  private bottomTabStyle?: React.CSSProperties;

  constructor(props, state) {
    super(props, state);
    this.fallbackRenderer = this.pageOwner?.renderer === "skyline" || (!this.pageOwner?.renderer && isSkyline()) ? "skyline" : "webview";
    this.refreshBottomTabStyle();
    const params = (this.context as PageScopeValue | undefined)?.router?.params ?? (this.pageOwner?.options as Record<string, string> | undefined) ?? Taro.getCurrentInstance?.().router?.params;
    const requestedTab = params?.tab ? Number(params.tab) : NaN;
    const hasRequestedTab = CONTENT_TABS.includes(requestedTab);
    const selectedTabIndex = hasRequestedTab ? requestedTab : 0;
    this.state = {
      selectedTabIndex,
      unreadNotifications: getUnreadNotificationCount(),
      pageVisible: true,
      initialTopicTab: hasRequestedTab ? params?.topicTab : undefined,
      topicSelectionRequest: 0,
      visitedTabs: { [selectedTabIndex]: true },
    };
  }

  componentDidMount() {
    this.stopViewport = this.viewport.subscribe(() => {
      this.refreshBottomTabStyle(); this.forceUpdate();
    });
    this.viewport.measure();
    this.stopUnreadSubscription = subscribeUnreadNotifications((count) => {
      this.setState({ unreadNotifications: count });
    });
  }

  componentDidShow() {
    this.viewport.measure();
    this.refreshBottomTabStyle();
    this.setState({ unreadNotifications: getUnreadNotificationCount(), pageVisible: true });
  }

  componentDidHide() {
    this.setState({ pageVisible: false });
  }

  componentWillUnmount() {
    this.stopUnreadSubscription?.();
    this.stopViewport?.();
  }

  onShareAppMessage() {
    return { title: "过早客 - 武汉本地生活社区", path: "/pages/home/index" };
  }

  onShareTimeline() {
    return { title: "过早客 - 武汉本地生活社区", query: "" };
  }

  private stopUnreadSubscription?: () => void;

  private refreshBottomTabStyle() {
    if (this.fallbackRenderer !== "skyline") return;
    this.bottomTabStyle = {
      paddingBottom: Math.max(16 * this.viewport.getSnapshot().width / 750, (() => { const info = this.viewport.getWindowInfo(); return info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0; })()) + "px",
    };
  }

  private handleClick(value: number): void {
    if (value === 2) {
      void this.navigation.navigateTo({ url: "/pages/createTopic/index" });
      return;
    }
    if (!CONTENT_TABS.includes(value)) return;
    this.setState(previous => ({
      selectedTabIndex: value,
      visitedTabs: previous.visitedTabs[value] ? previous.visitedTabs : { ...previous.visitedTabs, [value]: true },
    }));
  }

  render() {
    const skyline = this.fallbackRenderer === "skyline";
    const bottomTabStyle = skyline ? this.bottomTabStyle : undefined;

    return (
      <>
        <DesktopLayout selectedTab={this.state.selectedTabIndex} unreadNotifications={this.state.unreadNotifications}
          onSelectTab={tab => this.handleClick(tab)}
          onInterest={() => this.setState(previous => ({ selectedTabIndex: 0, initialTopicTab: "interest", topicSelectionRequest: previous.topicSelectionRequest + 1, visitedTabs: { ...previous.visitedTabs, 0: true } }))}
          railContent={<HomeHotNodes active={this.state.pageVisible} />}
          sidebar={<DesktopSidebar active={this.state.pageVisible} onDiscovery={() => this.handleClick(1)} />}
        >
        <View className={this.state.selectedTabIndex === 0 ? "root root--topics" : this.state.selectedTabIndex === 1 ? "root root--discovery" : this.state.selectedTabIndex === 4 ? "root root--me" : "root"}>
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 0 && (
            <Navbar>
              <Text className='navTitle'>过早客</Text>
              <SearchEntry style={{ height: getNavInfo(this.viewport.getWindowInfo()).capsuleHeight + "px" }} />
            </Navbar>
          )}
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 1 && (
            <Navbar left>
              <Text className='navTitle'>过早客</Text>
            </Navbar>
          )}
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 3 && (
            <Navbar left>
              <Text className='navTitle'>消息</Text>
            </Navbar>
          )}
          <View className='tabContent'>
            <View style={{ display: this.state.selectedTabIndex === 0 ? 'block' : 'none', height: '100%' }}>
              {this.state.visitedTabs[0] && <Topics initialTab={this.state.initialTopicTab} selectionRequest={this.state.topicSelectionRequest} active={this.state.selectedTabIndex === 0 && this.state.pageVisible} />}
            </View>
            <View style={{ display: this.state.selectedTabIndex === 1 ? 'block' : 'none', height: '100%' }}>
              {this.state.visitedTabs[1] && <Discovery active={this.state.selectedTabIndex === 1 && this.state.pageVisible} />}
            </View>
            <View style={{ display: this.state.selectedTabIndex === 3 ? 'block' : 'none', height: '100%' }}>
              {this.state.visitedTabs[3] && <Notifications active={this.state.selectedTabIndex === 3 && this.state.pageVisible} />}
            </View>
            <View style={{ display: this.state.selectedTabIndex === 4 ? 'block' : 'none', height: '100%' }}>
              {this.state.visitedTabs[4] && <Me active={this.state.selectedTabIndex === 4 && this.state.pageVisible} />}
            </View>
          </View>
          {!HIDE_TAB && (
            <View className={skyline ? "bottomTab bottomTab--skyline" : "bottomTab"} style={bottomTabStyle}>
              {TAB_CONFIG.map((tab, index) => {
                const active = this.state.selectedTabIndex === index;
                if (index === 2) {
                  return (
                    <View key={index} className='tabItem tabItem--add' onClick={() => this.handleClick(index)}>
                      <ShareElement mapkey='create_topic_btn' className='composeShareElement'>
                        <View className='addIcon'>
                          <ThemedIcon src={ComposePlusIcon} color='#fff' mode='aspectFit' className='composePlusIcon' />
                        </View>
                      </ShareElement>
                    </View>
                  );
                }
                return (
                  <View key={index} className={`tabItem ${active ? "tabItem--active" : ""}`} onClick={() => this.handleClick(index)}>
                    <View className='tabIconWrap'>
                      <TabIcon tab={tab} active={active} />
                      {index === 3 && this.state.unreadNotifications > 0 && <View className='tabUnreadDot' />}
                    </View>
                    <Text className='tabTitle'>{tab.title}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        </DesktopLayout>
        <AddToDesktopGuide />
      </>
    );
  }
}
