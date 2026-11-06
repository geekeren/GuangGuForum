import { Image, ScrollView, Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';
import { EMOJIS } from '../../utils/emojiUsage';
import { STICKERS, type Sticker } from '../../utils/stickers';
import './index.scss';

export type ComposerEmojiTab = 'common' | 'emoji' | 'sticker';
export interface ComposerEmojiPanelProps {
  tab: ComposerEmojiTab;
  common: { emojis: string[]; stickers: Sticker[] };
  disabled: boolean;
  scrollViewType?: 'custom' | 'list';
  onTabChange: (tab: ComposerEmojiTab) => void;
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: Sticker) => void;
  /** A native editor may capture touches without changing this shared cell's content/geometry. */
  renderEmojiControl?: (emoji: string, select: () => void, content: ReactNode) => ReactNode;
  renderTabControl?: (tab: ComposerEmojiTab, select: () => void, content: ReactNode) => ReactNode;
  renderStickerControl?: (sticker: Sticker, select: () => void, content: ReactNode) => ReactNode;
}

export default function ComposerEmojiPanel({ tab, common, disabled, scrollViewType, onTabChange, onEmoji, onSticker, renderEmojiControl, renderTabControl, renderStickerControl }: ComposerEmojiPanelProps) {
  const emojis = tab === 'common' ? common.emojis : EMOJIS;
  const stickers = tab === 'common' ? common.stickers : STICKERS;
  return <View className='composerEmojiPanel'>
    <View className='composerEmojiTabs'>
      {(['common', 'emoji', 'sticker'] as const).map((item, index) => {
        const label = ['常用', '表情', '过早客'][index];
        const content = <Text>{label}</Text>;
        const select = () => { if (!disabled) onTabChange(item); };
        const className = `composerEmojiTab${tab === item ? ' composerEmojiTab--active' : ''}`;
        return renderTabControl
          ? <View key={item} className={className}>{renderTabControl(item, select, content)}</View>
          : <View key={item} className={className} ariaRole='button' ariaLabel={label} onClick={select}>{content}</View>;
      })}
    </View>
    <ScrollView type={scrollViewType} scrollY className='composerEmojiScroll' {...{ 'keyboard-dismiss-mode': 'none' }}>
      <View className='composerEmojiGrid'>
        {tab === 'common' && <Text className='composerEmojiHeading'>Emoji</Text>}
        {tab === 'common' && emojis.length === 0 && <Text className='composerEmojiEmpty'>选择后，常用 Emoji 会显示在这里</Text>}
        {tab !== 'sticker' && Array.from({ length: Math.ceil(emojis.length / 8) }, (_, row) => <View className='composerEmojiRow' key={`emoji-${row}`}>
          {emojis.slice(row * 8, row * 8 + 8).map(emoji => {
            const select = () => { if (!disabled) onEmoji(emoji); };
            const content = <Text className='composerEmojiText'>{emoji}</Text>;
            return renderEmojiControl
              ? <View className='composerEmojiCell' key={emoji}>{renderEmojiControl(emoji, select, content)}</View>
              : <View className='composerEmojiCell' key={emoji} ariaRole='button' ariaLabel={`插入表情${emoji}`} onClick={select}>{content}</View>;
          })}
        </View>)}
        {tab === 'common' && <Text className='composerEmojiHeading'>自定义表情</Text>}
        {tab === 'common' && stickers.length === 0 && <Text className='composerEmojiEmpty'>选择后，常用自定义表情会显示在这里</Text>}
        {tab !== 'emoji' && Array.from({ length: Math.ceil(stickers.length / 5) }, (_, row) => <View className='composerEmojiRow' key={`sticker-${row}`}>
          {stickers.slice(row * 5, row * 5 + 5).map(sticker => {
            const select = () => { if (!disabled) onSticker(sticker); };
            const content = <Image lazyLoad src={sticker.url} mode='aspectFit' className='composerEmojiStickerImage' />;
            return renderStickerControl
              ? <View className='composerEmojiSticker' key={sticker.filename}>{renderStickerControl(sticker, select, content)}</View>
              : <View className='composerEmojiSticker' key={sticker.filename} ariaRole='button' ariaLabel={`添加表情包${sticker.name}`} onClick={select}>{content}</View>;
          })}
        </View>)}
      </View>
    </ScrollView>
  </View>;
}
