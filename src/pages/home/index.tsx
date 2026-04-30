import React, { Component } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./index.scss";
import Topics from "./topics";
import Me from "../me/index";
import Navbar from "../../components/Navbar/index";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from "../config";
import { getNavInfo } from "../../utils/dimension";
import HomeIcon from "../../assets/home.svg";
import HomeActiveIcon from "../../assets/home-active.svg";
import UserIcon from "../../assets/user.svg";
import UserActiveIcon from "../../assets/user-active.svg";

interface State {
  selectedTabIndex: number;
}

const TAB_CONFIG = [
  { title: "首页", icon: HomeIcon, activeIcon: HomeActiveIcon },
  { title: "", icon: null, activeIcon: null },
  { title: "我的", icon: UserIcon, activeIcon: UserActiveIcon },
];

export default class Index extends Component<{}, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      selectedTabIndex: 0,
    };
  }

  private handleClick(value: number): void {
    if (value === 1) {
      Taro.navigateTo({ url: "/pages/createTopic/index" });
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
              <View className="searchEntry" style={{ height: getNavInfo().capsuleHeight + "px" }} onClick={() => Taro.showToast({ title: "开发中，敬请期待", icon: "none" })}>
                <Text className="searchText">搜索</Text>
              </View>
            </Navbar>
          )}
          <View className="tabContent">
            <View style={{ display: this.state.selectedTabIndex === 0 ? 'block' : 'none', height: '100%' }}>
              <Topics />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 2 ? 'block' : 'none', height: '100%' }}>
              <Me active={this.state.selectedTabIndex === 2} />
            </View>
          </View>
          {!HIDE_TAB && (
            <View className="bottomTab">
              {TAB_CONFIG.map((tab, index) => {
                const active = this.state.selectedTabIndex === index;
                if (index === 1) {
                  return (
                    <View key={index} className="tabItem tabItem--add" onClick={() => this.handleClick(index)}>
                      <View className="addIcon">+</View>
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
      </>
    );
  }
}
