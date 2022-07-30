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
  {title: '最近发布', type: 'latestPublish'},
  {title: '精华', type: 'elite'}
]

export default class Topics extends Component<TopicsProps, State> {
  private renderedTab: Record<number, React.ReactNode> = {};

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

  renderTab(tab, index) {
    if(!this.renderedTab[index]) {
      this.renderedTab[index] = <Suspense fallback={null}>
        <TopicList type={tab.type} />
      </Suspense>;
    }
    return this.renderedTab[index];
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
              {
                this.state.current === index ?
                  this.renderTab(tab, index) : null
              }
            </AtTabsPane>
          ))
        }
      </AtTabs>
    )
  }
}
