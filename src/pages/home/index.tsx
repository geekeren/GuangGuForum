import React, { Component } from "react";
import { View, Text, ShareElement } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { document as runtimeDocument } from '@tarojs/runtime';
import "./index.scss";
import Topics from "./topics";
import Discovery from "./discovery";
import Me from "../me/index";
import Notifications from "./notifications";
import Navbar from "../../components/Navbar/index";
import AddToDesktopGuide from "../../components/AddToDesktopGuide";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from "../config";
import { getBottomSafeAreaInset, getNavInfo } from "../../utils/dimension";
import { isSkyline } from "../../utils/renderer";
import { isDesktopClient, uiRpxToPx } from '../../utils/desktopLayout';
import { Home as HomeIcon } from "gzk-ui/icons";
import { HomeActive as HomeActiveIcon } from "gzk-ui/icons";
import { Discover as DiscoverIcon } from "gzk-ui/icons";
import { DiscoverActive as DiscoverActiveIcon } from "gzk-ui/icons";
import { User as UserIcon } from "gzk-ui/icons";
import { UserActive as UserActiveIcon } from "gzk-ui/icons";
import { Bell as NotificationIcon } from "gzk-ui/icons";
import { BellActive as NotificationActiveIcon } from "gzk-ui/icons";
import { Plus as ComposePlusIcon, Settings as SettingsIcon, Envelope as PrivateMessageIcon } from "gzk-ui/icons";
import SearchEntry from "../../components/SearchEntry";
import ThemedIcon from "../../components/ThemedIcon";
import { getUnreadNotificationCount, subscribeUnreadNotifications } from "../../utils/unreadNotifications";
import { PageRendererContext, type PageRenderer } from "../../hooks/usePageRenderer";
import UserAvatar from '../../components/UserAvatar';
import { getCachedUsername, subscribeCurrentAccount } from '../../utils/currentUser';
import { MessageConversationList } from '../messages';
import { SettingsContent } from '../settings';
import { CreateTopicContent } from '../createTopic';

interface State {
  selectedTabIndex: number;
  unreadNotifications: number;
  pageVisible: boolean;
  initialTopicTab?: string;
  visitedTabs: Record<number, boolean>;
  wideTabs: boolean;
  currentUsername: string;
  currentAvatarUrl?: string;
}

const CONTENT_TABS = [0, 1, 3, 4, 5, 6, 2];
const WIDE_TABS_THRESHOLD = 960;
let nextHomeId = 0;

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

function DesktopSideNav({ selectedTabIndex, unreadNotifications, username, avatarUrl, onSelect, onCompose }: {
  selectedTabIndex: number;
  unreadNotifications: number;
  username: string;
  avatarUrl?: string;
  onSelect: (index: number) => void;
  onCompose: () => void;
}) {
  return (
    <View className='desktopSideNav'>
      <View className='desktopSideNavTop'>
        {[0, 1, 3].map(index => (
          <View key={index} className={`desktopNavItem${selectedTabIndex === index ? ' desktopNavItem--active' : ''}`} ariaRole='button' ariaLabel={TAB_CONFIG[index].title} onClick={() => onSelect(index)}>
            <View className='tabIconWrap'>
              <TabIcon tab={TAB_CONFIG[index]} active={selectedTabIndex === index} />
              {index === 3 && unreadNotifications > 0 && <View className='tabUnreadDot' />}
            </View>
            <Text className='tabTitle'>{TAB_CONFIG[index].title}</Text>
          </View>
        ))}
        <View className={`desktopNavItem${selectedTabIndex === 5 ? ' desktopNavItem--active' : ''}`} ariaRole='button' ariaLabel='私信' onClick={() => onSelect(5)}>
          <View className='tabIconWrap'>
            <ThemedIcon src={PrivateMessageIcon} tone={selectedTabIndex === 5 ? 'accent' : 'secondary'} lightColor={selectedTabIndex === 5 ? '#1f69ff' : '#6b7488'} className='tabIcon' />
          </View>
          <Text className='tabTitle'>私信</Text>
        </View>
      </View>
      <View className='desktopSideNavFooter'>
        <View className={`desktopComposeButton${selectedTabIndex === 2 ? ' desktopComposeButton--active' : ''}`} ariaRole='button' ariaLabel='发帖' onClick={onCompose}><Text>发帖</Text></View>
        <View className={`desktopSettingsButton${selectedTabIndex === 6 ? ' desktopSettingsButton--active' : ''}`} ariaRole='button' ariaLabel='设置' onClick={() => onSelect(6)}>
          <ThemedIcon src={SettingsIcon} tone={selectedTabIndex === 6 ? 'accent' : 'secondary'} lightColor={selectedTabIndex === 6 ? '#1f69ff' : '#000000'} className='desktopSettingsIcon' />
        </View>
        <View className={`desktopAccountButton${selectedTabIndex === 4 ? ' desktopAccountButton--active' : ''}`} ariaRole='button' ariaLabel={username ? '我的个人信息' : '我的（未登录）'} onClick={() => onSelect(4)}>
          <UserAvatar username={username} src={avatarUrl || ''} size={64} style={{ width: '32px', height: '32px' }} />
        </View>
      </View>
    </View>
  );
}

export default class Index extends Component<{}, State> {
  static contextType = PageRendererContext;
  private readonly fallbackRenderer: PageRenderer;
  private bottomTabStyle?: React.CSSProperties;
  private readonly rootId = `home-tabs-root-${++nextHomeId}`;
  private readonly desktopTabs = isDesktopClient();
  private readonly ownerPath?: string;
  private readonly capturedOwner: ReturnType<typeof Taro.getCurrentInstance>['page'];
  private get ownerPage(): ReturnType<typeof Taro.getCurrentInstance>['page'] {
    // tid is injected by connectReactPage before asynchronous React rendering.
    // Current.page may already belong to another frame when our constructor runs.
    if (!this.ownerPath) return this.capturedOwner;
    return runtimeDocument.getElementById(this.ownerPath)?.ctx ?? undefined;
  }
  private tabGeometry = { mounted: false, visible: true, generation: 0 };

  constructor(props, state) {
    super(props, state);
    this.fallbackRenderer = (this.context as PageRenderer | undefined) ?? (isSkyline() ? "skyline" : "webview");
    this.refreshBottomTabStyle();
    const instance = Taro.getCurrentInstance();
    this.ownerPath = typeof props.tid === 'string' && props.tid ? props.tid : undefined;
    this.capturedOwner = this.ownerPath ? null : instance.page;
    const params = instance.router?.params;
    const requestedTab = params?.tab ? Number(params.tab) : NaN;
    const hasRequestedTab = CONTENT_TABS.includes(requestedTab) && (requestedTab !== 2 || this.canEmbedCompose());
    const selectedTabIndex = hasRequestedTab ? requestedTab : 0;
    this.state = {
      selectedTabIndex,
      unreadNotifications: getUnreadNotificationCount(),
      pageVisible: true,
      initialTopicTab: hasRequestedTab ? params?.topicTab : undefined,
      visitedTabs: { [selectedTabIndex]: true },
      wideTabs: this.desktopTabs,
      currentUsername: getCachedUsername(),
    };
  }

  componentDidMount() {
    this.tabGeometry.mounted = true;
    this.measureTabGeometry();
    this.stopAccountSubscription = subscribeCurrentAccount(() => {
      this.accountRevision += 1;
      this.onOwnAvatarChange = this.createAvatarListener();
      this.setState({ currentUsername: getCachedUsername(), currentAvatarUrl: undefined });
    });
    this.stopUnreadSubscription = subscribeUnreadNotifications((count) => {
      this.setState({ unreadNotifications: count });
    });
  }

  onReady() { this.measureTabGeometry(); }

  onResize() { this.measureTabGeometry(); }

  componentDidShow() {
    this.tabGeometry.visible = true;
    this.measureTabGeometry();
    this.refreshBottomTabStyle();
    this.setState({ unreadNotifications: getUnreadNotificationCount(), pageVisible: true });
  }

  componentDidHide() {
    this.tabGeometry.visible = false;
    this.tabGeometry.generation += 1;
    this.setState({ pageVisible: false });
  }

  componentWillUnmount() {
    this.tabGeometry.mounted = false;
    this.tabGeometry.generation += 1;
    this.stopUnreadSubscription?.();
    this.stopAccountSubscription?.();
  }

  onShareAppMessage() {
    return { title: "过早客 - 武汉本地生活社区", path: "/pages/home/index" };
  }

  onShareTimeline() {
    return { title: "过早客 - 武汉本地生活社区", query: "" };
  }

  private stopUnreadSubscription?: () => void;
  private stopAccountSubscription?: () => void;
  private accountRevision = 0;
  private onOwnAvatarChange = this.createAvatarListener();

  private createAvatarListener() {
    const revision = this.accountRevision;
    return ({ account, avatarUrl }: { account: string; avatarUrl?: string }) => {
      if (!this.tabGeometry.mounted || revision !== this.accountRevision
        || !account || account !== getCachedUsername() || account !== this.state.currentUsername) return;
      if (this.state.currentAvatarUrl !== avatarUrl) this.setState({ currentAvatarUrl: avatarUrl });
    };
  }

  private measureTabGeometry() {
    const scope = this.tabGeometry;
    const generation = ++scope.generation;
    if (!scope.mounted || !scope.visible) return;
    // PC tabs belong on the left even in narrow frameset panes and before
    // native measurement. Lifecycle events never reset them to bottom.
    if (this.desktopTabs) { this.setState({ wideTabs: true }); return; }
    // Non-PC responsive navigation releases stale geometry immediately.
    this.setState({ wideTabs: false });
    // Navigation responds to this page's usable width, independently of the
    // desktop typography/density policy (including wide devtools previews).
    const owner = this.ownerPage;
    if (!owner) return;
    const current = () => scope.mounted && scope.visible && scope.generation === generation;
    try {
      Taro.nextTick(() => {
        if (!current()) return;
        try {
          const query = Taro.createSelectorQuery();
          if (typeof query.in !== 'function') return;
          query.in(owner).select(`#${this.rootId}`).boundingClientRect();
          query.exec((rects: unknown[]) => {
            if (!current()) return;
            scope.generation += 1;
            if (!Array.isArray(rects)) return;
            const rect = rects[0] as { left?: number; top?: number; width?: number; height?: number } | undefined;
            if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
              || rect.width! <= 0 || rect.height! <= 0) return;
            this.setState({ wideTabs: rect.width! >= WIDE_TABS_THRESHOLD });
          });
        } catch { /* Unsupported owner queries keep the original bottom tabs. */ }
      });
    } catch { /* Unsupported nextTick also keeps bottom tabs. */ }
  }

  private refreshBottomTabStyle() {
    if (((this.context as PageRenderer | undefined) ?? this.fallbackRenderer) !== "skyline") return;
    this.bottomTabStyle = {
      paddingBottom: Math.max(uiRpxToPx(16), getBottomSafeAreaInset()) + "px",
    };
  }

  private canEmbedCompose(): boolean {
    return this.desktopTabs && ((this.context as PageRenderer | undefined) ?? this.fallbackRenderer) === 'webview';
  }

  private handleDesktopSelection(index: number): Promise<void> | void {
    if (!this.desktopTabs) {
      if (index === 2) this.handleCompose(); else this.handleClick(index);
      return;
    }
    const url = index === 2 && !this.canEmbedCompose()
      ? '/pages/createTopic/index'
      : `/pages/home/index?tab=${index}`;
    // This trial replaces the current native page, not the entire history stack.
    return Taro.redirectTo({ url }).then(() => {}).catch(() => {
      if (this.tabGeometry.mounted) void Taro.showToast({ title: '无法打开所选页面，请重试', icon: 'none' });
    });
  }

  private handleCompose(): void {
    if (this.canEmbedCompose()) this.selectContent(2);
    else this.handleClick(2);
  }

  private handleClick(value: number): void {
    if (value === 2) {
      void Taro.navigateTo({ url: "/pages/createTopic/index" });
      return;
    }
    this.selectContent(value);
  }

  private selectContent(value: number): void {
    if (!CONTENT_TABS.includes(value)) return;
    this.setState(previous => ({
      selectedTabIndex: value,
      visitedTabs: previous.visitedTabs[value] ? previous.visitedTabs : { ...previous.visitedTabs, [value]: true },
    }));
  }

  render() {
    const skyline = ((this.context as PageRenderer | undefined) ?? this.fallbackRenderer) === "skyline";
    const bottomTabStyle = skyline && !this.state.wideTabs ? this.bottomTabStyle : undefined;
    const sideNavigation = this.state.wideTabs && !HIDE_TAB;

    return (
      <>
        <View id={this.rootId} className={`${this.state.selectedTabIndex === 0 ? "root root--topics" : this.state.selectedTabIndex === 1 ? "root root--discovery" : this.state.selectedTabIndex === 4 ? "root root--me" : "root"}${this.state.wideTabs ? ' root--wideTabs' : ''}`}>
          <View className='homeWorkspace'>
            <View className='homeMain'>
              {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 0 && (
                <Navbar>
                  <Text className="navTitle">过早客</Text>
                  <SearchEntry style={{ height: (isDesktopClient() ? 32 : getNavInfo().capsuleHeight) + "px" }} />
                </Navbar>
              )}
              {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 1 && (
                <Navbar left>
                  <Text className="navTitle">过早客</Text>
                </Navbar>
              )}
              {ENABLE_CUSTOM_NAVBAR && [2, 3, 5, 6].includes(this.state.selectedTabIndex) && (
                <Navbar left>
                  <Text className="navTitle">{this.state.selectedTabIndex === 2 ? '发帖' : this.state.selectedTabIndex === 6 ? '设置' : this.state.selectedTabIndex === 5 ? '私信' : '消息'}</Text>
                </Navbar>
              )}
              <View className="tabContent">
                <View style={{ display: this.state.selectedTabIndex === 0 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[0] && <Topics initialTab={this.state.initialTopicTab} active={this.state.selectedTabIndex === 0 && this.state.pageVisible} />}
                </View>
                <View style={{ display: this.state.selectedTabIndex === 1 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[1] && <Discovery active={this.state.selectedTabIndex === 1 && this.state.pageVisible} />}
                </View>
                <View style={{ display: this.state.selectedTabIndex === 3 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[3] && <Notifications active={this.state.selectedTabIndex === 3 && this.state.pageVisible} />}
                </View>
                <View style={{ display: this.state.selectedTabIndex === 4 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[4] && <Me active={this.state.selectedTabIndex === 4 && this.state.pageVisible} hideSettings={sideNavigation} onOwnAvatarChange={this.onOwnAvatarChange} />}
                </View>
                <View style={{ display: this.state.selectedTabIndex === 5 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[5] && <MessageConversationList embedded active={this.state.selectedTabIndex === 5 && this.state.pageVisible} />}
                </View>
                <View style={{ display: this.state.selectedTabIndex === 6 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[6] && <SettingsContent embedded active={this.state.selectedTabIndex === 6 && this.state.pageVisible} />}
                </View>
                <View style={{ display: this.state.selectedTabIndex === 2 ? 'block' : 'none', height: '100%' }}>
                  {this.state.visitedTabs[2] && this.canEmbedCompose() && <CreateTopicContent embedded active={this.state.selectedTabIndex === 2 && this.state.pageVisible} onPublished={() => {
                    if (this.state.selectedTabIndex === 2 && this.state.pageVisible) this.selectContent(0);
                  }}
                  />}
                </View>
              </View>
            </View>
            {!HIDE_TAB && (this.state.wideTabs ? (
              <DesktopSideNav selectedTabIndex={this.state.selectedTabIndex} unreadNotifications={this.state.unreadNotifications} username={this.state.currentUsername} avatarUrl={this.state.currentAvatarUrl} onSelect={index => this.handleDesktopSelection(index)} onCompose={() => this.handleDesktopSelection(2)} />
            ) : (
              <View className={skyline ? "bottomTab bottomTab--skyline" : "bottomTab"} style={bottomTabStyle}>
                {TAB_CONFIG.map((tab, index) => {
                  const active = this.state.selectedTabIndex === index;
                  if (index === 2) {
                    return (
                      <View key={index} className="tabItem tabItem--add" onClick={() => this.handleClick(index)}>
                        <ShareElement mapkey="create_topic_btn" className="composeShareElement">
                          <View className="addIcon">
                            <ThemedIcon src={ComposePlusIcon} color='#fff' mode="aspectFit" className="composePlusIcon" />
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
            ))}
          </View>
        </View>
        <AddToDesktopGuide />
      </>
    );
  }
}
