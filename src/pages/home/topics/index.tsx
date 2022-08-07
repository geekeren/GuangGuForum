import React, { Component, lazy, Suspense } from 'react'
import { AtTabs, AtTabsPane } from "taro-ui";
import { GetTopicsParam } from "guanggu-forum-api";
import './index.scss'

const TopicList = lazy(() => import("./topicList")) ;
interface TopicsProps {
}

interface State {
  current: number
}

const tabs: { title: string; type: GetTopicsParam['type'] }[] = [
  {title: '最近更新', type: 'default'},
  {title: '最近发布', type: 'latest'},
  {title: '精华', type: 'elite'},
  {title: '我的关注', type: 'follows'}
]

export default class Topics extends Component<TopicsProps, State> {
  constructor(props, state) {
    super(props, state)
    this.state = {
      current: 0,
    }
  }

  handleClick(value) {
    this.setState({
      current: value
    })
  }


  render() {
    return (
      <AtTabs
        current={this.state.current}
        tabList={tabs.map(({title}) => ({
          title
        }))}
        onClick={this.handleClick.bind(this)}
      >
        {
          tabs.map((tab, index) => (
            <AtTabsPane
              key={tab.type}
              current={this.state.current}
              index={index}
            >
              <Suspense fallback={null}>
                <TopicList type={tab.type} />
              </Suspense>
            </AtTabsPane>
          ))
        }
      </AtTabs>
    )
  }
}
