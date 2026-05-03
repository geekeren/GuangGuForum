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
import { getNavInfo } from "../../utils/dimension";
import HomeIcon from "../../assets/home.svg";
import HomeActiveIcon from "../../assets/home-active.svg";
import DiscoverIcon from "../../assets/discover.svg";
import DiscoverActiveIcon from "../../assets/discover-active.svg";
import UserIcon from "../../assets/user.svg";
import UserActiveIcon from "../../assets/user-active.svg";
import NotificationIcon from "../../assets/notification.svg";
import NotificationActiveIcon from "../../assets/notification-active.svg";

interface State {
  selectedTabIndex: number;
}

const TAB_CONFIG = [
  { title: "首页", icon: HomeIcon, activeIcon: HomeActiveIcon },
  { title: "发现", icon: DiscoverIcon, activeIcon: DiscoverActiveIcon },
  { title: "", icon: null, activeIcon: null },
  { title: "消息", icon: NotificationIcon, activeIcon: NotificationActiveIcon },
  { title: "我的", icon: UserIcon, activeIcon: UserActiveIcon },
];

export default class Index extends Component<{}, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      selectedTabIndex: 0,
    };
  }

  componentDidMount() {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.tab) {
      const tab = parseInt(params.tab);
      if ([0, 1, 3, 4].includes(tab)) {
        this.setState({ selectedTabIndex: tab });
      }
    }
  }

  private handleClick(value: number): void {
    if (value === 2) {
      wx.navigateTo({
        url: "/pages/createTopic/index",
        routeType: "wx://upwards",
      });
    } else {
      this.setState({ selectedTabIndex: value });
    }
  }

  render() {
    return (
      <>
        <View className="root">
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 0 && (
            <Navbar>
              <Text className="navTitle">过早客</Text>
              <View className="searchEntry" style={{ height: getNavInfo().capsuleHeight + "px" }} onClick={() => Taro.navigateTo({ url: "/pages/search/index" })}>
                <Text className="searchText">搜索</Text>
              </View>
            </Navbar>
          )}
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 1 && (
            <Navbar left>
              <Text className="navTitle">发现</Text>
            </Navbar>
          )}
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 3 && (
            <Navbar left>
              <Text className="navTitle">消息</Text>
            </Navbar>
          )}
          <View className="tabContent">
            <View style={{ display: this.state.selectedTabIndex === 0 ? 'block' : 'none', height: '100%' }}>
              <Topics />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 1 ? 'block' : 'none', height: '100%' }}>
              <Discovery active={this.state.selectedTabIndex === 1} />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 3 ? 'block' : 'none', height: '100%' }}>
              <Notifications active={this.state.selectedTabIndex === 3} />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 4 ? 'block' : 'none', height: '100%' }}>
              <Me active={this.state.selectedTabIndex === 4} />
            </View>
          </View>
          {!HIDE_TAB && (
            <View className="bottomTab">
              {TAB_CONFIG.map((tab, index) => {
                const active = this.state.selectedTabIndex === index;
                if (index === 2) {
                  return (
                    <View key={index} className="tabItem tabItem--add" onClick={() => this.handleClick(index)}>
                      <ShareElement mapkey="create_topic_btn">
                        <View className="addIcon">+</View>
                      </ShareElement>
                    </View>
                  );
                }
                return (
                  <View key={index} className={`tabItem ${active ? "tabItem--active" : ""}`} onClick={() => this.handleClick(index)}>
                    <Image src={active ? tab.activeIcon! : tab.icon!} svg className="tabIcon" />
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
