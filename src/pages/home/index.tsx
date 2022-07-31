import React, { Component } from 'react'
import { View } from '@tarojs/components'
import { AtTabBar, AtToast } from "taro-ui";
import './index.scss'
import Topics from "./topics";
import Navbar from "../../components/Navbar/index";
import { ENABLE_CUSTOM_NAVBAR, HIDE_TAB } from '../config';

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
    }
  }

  componentDidMount() {
  }

  componentWillUnmount() {
  }

  private handleClick(value: number): void {
    if (value > 0) {
      this.setState({
        showToast: true,
      })
    } else {
      this.setState({
        selectedTabIndex: value
      })
    }
  }

  render() {
    return (
      <>
        <View className='root'>
          {
            ENABLE_CUSTOM_NAVBAR && <Navbar onClickSearch={() => {
              this.setState({
                showToast: true,
              })
            }}
            />
          }
          <View
            className='tabContent'
          >
            <Topics />
          </View>
          {
            !HIDE_TAB && <AtTabBar
              className='bottomTab'
              tabList={[
                { title: '首页', iconType: 'home' },
                { title: '消息', iconType: 'bell', text: '100', max: 99 },
                { title: '我的', iconType: 'user' }
              ]}
              onClick={this.handleClick.bind(this)}
              current={this.state.selectedTabIndex}
            />
          }
        </View>
        <AtToast
          onClose={() => {
            this.setState({
              showToast: false,
            })
          }}
          isOpened={this.state.showToast}
          duration={1500}
          text='功能开发中...'
        />
      </>
    )
  }
}
