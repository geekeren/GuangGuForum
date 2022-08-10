import { View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRouter } from '@tarojs/taro';
import { getNodeTopics } from 'guanggu-forum-api';
import { useEffect } from 'react';
import TopicList from '../../home/topics/topicList';
import './index.scss'

interface NodeTopicsProps {
  node: string;
}
const NodeTopics = (props: NodeTopicsProps) => {
  const router = useRouter();
  const { node, nodeName } = router.params;

  useEffect(() => {
    if (!node) {
      Taro.navigateBack().then();
      return;
    }
  }, [router.params]);

  if (!node) {
    return;
  }
  return (
    <View>
      <View style={{ height: 40, padding: 5 }}>
        板块：{nodeName || ''}
      </View>
      <TopicList
        getTopics={(page: number) => {
          return getNodeTopics({
            node,
            page
          })
        }}
        version={0}
      />
    </View>
  )
}

export default NodeTopics;
