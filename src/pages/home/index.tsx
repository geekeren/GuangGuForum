import React, { Component } from "react";
import { View } from "@tarojs/components";
import { AtTabBar, AtToast } from "taro-ui";
import Taro from "@tarojs/taro";
import "./index.scss";
import Topics from "./topics";
import Me from "../me/index";
import Navbar from "../../components/Navbar/index";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from "../config";

interface State {
  selectedTabIndex: number;
  showToast: boolean;
}

export default class Index extends Component<{}, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      selectedTabIndex: 0,
      showToast: false,
    };
  }

  private handleClick(value: number): void {
    if (value === 1) {
      this.setState({ showToast: true });
    } else {
      this.setState({ selectedTabIndex: value });
    }
  }

  render() {
    return (
      <>
        <View className="root">
          {ENABLE_CUSTOM_NAVBAR && this.state.selectedTabIndex === 0 && (
            <Navbar
              onClickSearch={() => {
                this.setState({
                  showToast: true,
                });
              }}
            />
          )}
          <View className="tabContent">
            <View style={{ display: this.state.selectedTabIndex === 0 ? 'block' : 'none', height: '100%' }}>
              <Topics />
            </View>
            <View style={{ display: this.state.selectedTabIndex === 2 ? 'block' : 'none', height: '100%' }}>
              <Me />
            </View>
          </View>
          {!HIDE_TAB && (
            <AtTabBar
              className="bottomTab"
              tabList={[
                { title: "首页", iconType: "home" },
                { title: "发帖", iconType: "add" },
                { title: "我的", iconType: "user" },
              ]}
              onClick={this.handleClick.bind(this)}
              current={this.state.selectedTabIndex}
            />
          )}
        </View>
        <AtToast
          onClose={() => {
            this.setState({
              showToast: false,
            });
          }}
          isOpened={this.state.showToast}
          duration={1500}
          text="功能开发中..."
        />
      </>
    );
  }
}
