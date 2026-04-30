import React, { Component } from "react";
import { View, Text } from "@tarojs/components";
import { AtTabBar } from "taro-ui";
import Taro from "@tarojs/taro";
import "./index.scss";
import Topics from "./topics";
import Me from "../me/index";
import Navbar from "../../components/Navbar/index";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from "../config";
import { getNavInfo } from "../../utils/dimension";

interface State {
  selectedTabIndex: number;
}

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
            <AtTabBar
              className="bottomTab"
              tabList={[
                { title: "首页", iconType: "home" },
                { title: "", iconType: "add" },
                { title: "我的", iconType: "user" },
              ]}
              onClick={this.handleClick.bind(this)}
              current={this.state.selectedTabIndex}
            />
          )}
        </View>
      </>
    );
  }
}
