import { Text, View } from '@tarojs/components';
import { TopicHash, ChevronRight } from 'gzk-ui/icons';
import { usePageNavigation } from '../../hooks/usePageScope';
import ThemedIcon from '../../components/ThemedIcon';
import { useDesktopHotNodes } from './useDesktopHotNodes';
import './desktop.scss';

/** Mounted only in Home's expanded desktop rail, never in a detail/compose pane. */
export default function HomeHotNodes({ active }: { active: boolean }) {
  const navigation = usePageNavigation();
  const { nodes, loading, error, retry } = useDesktopHotNodes(active);
  return <View className='homeRailNodes'>
    <View className='homeRailNodesHeader'><ThemedIcon src={TopicHash} tone='accent' className='homeRailNodeIcon' /><Text>热门板块</Text></View>
    {nodes.slice(0, 12).map(node => <View key={node.link} className='homeRailNode' ariaRole='button' ariaLabel={node.title} onClick={() => {
      const slug = node.link.match(/^\/node\/([^?#/]+)(?:[?#].*)?$/)?.[1];
      if (slug) void navigation.navigateTo({ url: `/pages/node/topicList/index?node=${encodeURIComponent(slug)}&nodeName=${encodeURIComponent(node.title)}` });
    }}
    ><Text className='homeRailNodeName' overflow='ellipsis' maxLines={1}>{node.title}</Text><ThemedIcon src={ChevronRight} tone='muted' className='homeRailNodeChevron' /></View>)}
    {error ? <View className='homeRailNodesStatus' ariaRole='button' onClick={retry}><Text>板块加载失败，点击重试</Text></View> : !nodes.length && <Text className='homeRailNodesStatus'>{loading ? '正在加载热门板块…' : '暂无热门板块'}</Text>}
  </View>;
}
