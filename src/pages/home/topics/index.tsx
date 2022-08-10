import { Component } from 'react'
import { AtTabs, AtTabsPane } from "taro-ui";
import { getRecentTopics, GetTopicsParam } from "guanggu-forum-api";
import './index.scss'

import TopicList from "./topicList";

interface TopicsProps {
}

interface State {
  current: number;
  tabsConfig: { title: string; type: GetTopicsParam['type']; version: number }[]
}

const getVersion = () => {
  return Math.floor(new Date().getTime() / 5000);
}
const tabs: { title: string; type: GetTopicsParam['type'] }[] = [
  { title: '最近更新', type: 'default' },
  { title: '最近发布', type: 'latest' },
  { title: '精华', type: 'elite' },
  { title: '我的关注', type: 'follows' }
]

export default class Topics extends Component<TopicsProps, State> {
  constructor(props, state) {
    super(props, state)
    this.state = {
      current: 0,
      tabsConfig: tabs.map((tab) => ({
        ...tab,
        version: getVersion(),
      })),
    }
  }

  handleClick(value) {
    if (this.state.current !== value) {
      const tab = this.state.tabsConfig[value];
      tab.version = getVersion();
      this.setState({
        current: value,
        tabsConfig: [
          ...this.state.tabsConfig
        ],
      })
    }
  }


  render() {
    return (
      <AtTabs
        current={this.state.current}
        tabList={tabs.map(({ title }) => ({
          title
        }))}
        onClick={this.handleClick.bind(this)}
      >
        {
          this.state.tabsConfig.map((tab, index) => (
            <AtTabsPane
              key={tab.type}
              current={this.state.current}
              index={index}
            >
              <TopicList
                type={tab.type}
                getTopics={(page: number) => {
                  return getRecentTopics({
                    type: tab.type,
                    page
                  })
                }}
                version={tab.version}
              />
            </AtTabsPane>
          ))
        }
      </AtTabs>
    )
  }
}
