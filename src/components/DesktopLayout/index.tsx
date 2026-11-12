import { ScrollView, View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ReactNode } from "react";
import { Home, Discover, Bell, User, Plus, Star, TopicHash, ChevronLeft } from "gzk-ui/icons";
import { usePageScope, usePageOwner, usePageNavigation } from "../../hooks/usePageScope";
import { useViewport } from "../../hooks/useViewport";
import { usePageScrollViewType } from "../../hooks/usePageRenderer";
import { getHomeRailMode, HOME_RAIL_WIDTHS } from "./homeRailLayout";
import SearchEntry from "../SearchEntry";
import ThemedIcon from "../ThemedIcon";
import "./index.scss";

interface Props {
  children?: ReactNode;
  sidebar?: ReactNode;
  /** Home owns community data; the layout only places this wide-rail slot. */
  railContent?: ReactNode;
  title?: string;
  variant?: "compose" | "detail";
  back?: boolean;
  selectedTab?: number;
  unreadNotifications?: number;
  onSelectTab?: (tab: number) => void;
  onInterest?: () => void;
}
const links = [
  { tab: 0, label: "首页", icon: Home }, { tab: 1, label: "发现", icon: Discover },
  { tab: 3, label: "消息", icon: Bell }, { tab: 4, label: "我的", icon: User },
];

/** The center's parent chain never changes when crossing the desktop breakpoint. */
export default function DesktopLayout({ children, sidebar, railContent, title = "过早客", variant, back = false, selectedTab, unreadNotifications = 0, onSelectTab, onInterest }: Props) {
  const { viewport } = usePageScope();
  const owner = usePageOwner();
  const navigation = usePageNavigation();
  const { isDesktop, width } = useViewport();
  const scrollViewType = usePageScrollViewType();
  const homeRailMode = getHomeRailMode(viewport.isDesktopClient, width);
  const homeRail = !variant && homeRailMode !== 'none';
  const wideLayout = isDesktop && !viewport.isWindowsClient && (!!variant || homeRail);
  const narrowRail = homeRail && !wideLayout;
  const showRail = homeRail || (!!variant && wideLayout);
  const selectTab = (tab: number) => {
    if (onSelectTab) onSelectTab(tab);
    else void navigation.navigateTo({ url: `/pages/home/index?tab=${tab}` });
  };
  const compose = () => { if (variant === "compose") return; void navigation.navigateTo({ url: "/pages/createTopic/index" }); };
  return <View className={`desktopLayout${wideLayout ? " desktopLayout--wide" : ""}${narrowRail ? " desktopLayout--rail" : ""}${wideLayout && width < 1160 ? " desktopLayout--compact" : ""}${homeRail ? ` desktopLayout--home desktopLayout--home-${homeRailMode}` : ""}${variant ? ` desktopLayout--${variant}` : ""}`}>
    {showRail && <View className='desktopRail' style={homeRail ? { width: HOME_RAIL_WIDTHS[homeRailMode] + 'px' } : undefined}>
      <ScrollView type={scrollViewType} scrollY enhanced showScrollbar={false} className='desktopRailScroll'>
        <View className='desktopBrand' onClick={() => selectTab(0)}>
          <ThemedIcon src={Home} tone='accent' className='desktopBrandIcon' /><Text>过早客</Text>
        </View>
        <View className='desktopNav'>
          {links.map(link => <View key={link.tab} className={`desktopNavItem${selectedTab === link.tab ? " desktopNavItem--active" : ""}`} ariaRole='button' ariaLabel={link.label} onClick={() => selectTab(link.tab)}>
            <ThemedIcon src={link.icon} tone={selectedTab === link.tab ? 'accent' : 'secondary'} className='desktopNavIcon' />
            <Text>{link.label}</Text>{link.tab === 3 && unreadNotifications > 0 && <View className='desktopUnreadDot' />}
          </View>)}
        </View>
        <View className='desktopNavDivider' />
        <Text className='desktopNavCaption'>社区</Text>
        <View className='desktopNavItem' ariaRole='button' ariaLabel='浏览板块' onClick={() => selectTab(1)}>
          <ThemedIcon src={TopicHash} tone='secondary' className='desktopNavIcon' /><Text>浏览板块</Text>
        </View>
        <View className='desktopNavItem' ariaRole='button' ariaLabel='我的关注' onClick={() => {
          if (onInterest) onInterest();
          else void navigation.navigateTo({ url: "/pages/home/index?tab=0&topicTab=interest" });
        }}
        ><ThemedIcon src={Star} tone='secondary' className='desktopNavIcon' /><Text>我的关注</Text></View>
        {homeRail && homeRailMode === 'community' && railContent}
      </ScrollView>
      <View className='desktopCompose' ariaRole='button' ariaLabel='发布帖子' onClick={compose}>
        <ThemedIcon src={Plus} color='#fff' className='desktopNavIcon' /><Text>发帖</Text>
      </View>
    </View>}
    <View className='desktopMain'>
      {wideLayout && <View className='desktopTopbar'>
        {back && <View className='desktopBack' ariaRole='button' ariaLabel='返回上一页' onClick={() => {
          if (owner?.pageRouter || (Taro.getCurrentPages?.().length || 0) > 1) void navigation.navigateBack();
          else void navigation.reLaunch({ url: "/pages/home/index" });
        }}
        ><ThemedIcon src={ChevronLeft} tone='secondary' className='desktopBackIcon' /></View>}
        <SearchEntry className='desktopSearch' />
        <Text className='desktopPageTitle'>{title}</Text>
      </View>}
      <View className='desktopContent'>{children}</View>
    </View>
    {wideLayout && sidebar && <View className='desktopSidebar'>{sidebar}</View>}
  </View>;
}
