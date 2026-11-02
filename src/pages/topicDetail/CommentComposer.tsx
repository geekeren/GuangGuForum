import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useRef, useState } from "react";
import MentionTextarea, { type MentionEditorHandle } from "../../components/MentionTextarea";
import ThemedIcon from "../../components/ThemedIcon";
import { isSkyline } from "../../utils/renderer";
import { getCommentBody } from "../../utils/mentions";
import MentionIcon from "../../assets/composer-mention.svg?raw";
import EmojiIcon from "../../assets/composer-emoji.svg?raw";
import CollapseIcon from "../../assets/composer-collapse.svg?raw";

interface Props {
  value: string;
  mentionUsers?: string[];
  sending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}

const QUICK_EMOJIS = ["👍", "😂", "❤️", "👏", "🤔", "🎉"];
const EXTRA_EMOJIS = ["😊", "😄", "🤣", "🥹", "😍", "😎", "😭", "😅", "🙃", "😮", "😤", "🙏", "💪", "🤝", "🌹", "✨", "🔥", "💯"];

export default function CommentComposer({ value, mentionUsers, sending, onChange, onClose, onSend }: Props) {
  const skyline = isSkyline();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const editorRef = useRef<MentionEditorHandle>(null);
  const bodyLength = getCommentBody(value).trim().length;
  const canSend = !sending && bodyLength >= 3;
  const windowInfo = skyline ? Taro.getWindowInfo() : undefined;
  const safeBottom = windowInfo?.safeArea
    ? Math.max(0, windowInfo.screenHeight - windowInfo.safeArea.bottom) : 0;

  const updateKeyboardHeight = (height: number) => {
    if (!skyline || !Number.isFinite(height)) return;
    setKeyboardHeight(Math.min(Math.max(0, height), windowInfo!.windowHeight));
  };

  // Skyline's fixed overlay needs explicit bounds; only the sheet follows the keyboard.
  const popupStyle = windowInfo ? {
    width: windowInfo.windowWidth + "px",
    height: windowInfo.windowHeight + "px",
  } : undefined;
  const bodyStyle = windowInfo ? {
    bottom: keyboardHeight + "px",
    paddingBottom: `calc(24rpx + ${keyboardHeight > 0 ? 0 : safeBottom}px)`,
    maxHeight: Math.max(0, windowInfo.windowHeight - keyboardHeight) + "px",
  } : undefined;

  const insertEmoji = (emoji: string) => editorRef.current?.insertText(emoji);

  return (
    <View className={`commentPopup commentPopup--visible${skyline ? " commentPopup--skyline" : ""}`} style={popupStyle}>
      <View className='commentPopupMask' onClick={onClose} />
      <View className='commentPopupBody' style={bodyStyle}>
        <View className='commentPopupHandle' />
        <MentionTextarea
          editorRef={editorRef}
          className='commentPopupTextarea'
          mentionUsers={mentionUsers}
          cursorSpacing={skyline ? 0 : 100}
          adjustPosition={!skyline}
          fixed
          focus
          autoHeight={false}
          maxlength={5000}
          mirrorMaxLines={3}
          disabled={sending}
          onFocus={(event) => updateKeyboardHeight(event.detail.height)}
          onKeyboardHeightChange={(event) => updateKeyboardHeight(event.detail.height)}
          onInput={(event) => onChange(event.detail.value)}
          value={value}
          showConfirmBar={false}
          placeholder='说点什么，参与讨论…'
        />
        <View className='commentPopupToolbar'>
          <View className='commentPopupTools'>
            <View className='commentPopupTool commentPopupMention' ariaRole='button' ariaLabel='提及用户' onClick={() => {
              if (sending) return;
              setShowEmojis(false);
              editorRef.current?.openMentions();
            }}>
              <ThemedIcon src={MentionIcon} tone='secondary' className='commentPopupToolIcon' />
            </View>
            <View className={`commentPopupTool commentPopupEmoji${showEmojis ? " commentPopupTool--active" : ""}`} ariaRole='button' ariaLabel={showEmojis ? '收起表情' : '更多表情'} onClick={() => setShowEmojis(!showEmojis)}>
              <ThemedIcon src={EmojiIcon} tone={showEmojis ? 'accent' : 'secondary'} className='commentPopupToolIcon' />
            </View>
            <View className='commentPopupTool commentPopupCancel' ariaRole='button' ariaLabel='收起评论，保留草稿' onClick={onClose}>
              <ThemedIcon src={CollapseIcon} tone='secondary' className='commentPopupToolIcon' />
            </View>
          </View>
          <View className='commentPopupSubmit'>
            {bodyLength < 3 && <Text className='commentPopupMinimum'>至少3个字</Text>}
            <Button className={`commentPopupSend${canSend ? "" : " commentPopupSend--disabled"}`} disabled={!canSend} loading={sending} onClick={() => { if (canSend) onSend(); }}>
              <Text>{sending ? "发送中" : "发送"}</Text>
            </Button>
          </View>
        </View>
        <View className='commentPopupQuickEmojis'>
          <Text className='commentPopupQuickLabel'>常用</Text>
          {QUICK_EMOJIS.map((emoji) => (
            <View key={emoji} className='commentPopupQuickEmoji' ariaRole='button' ariaLabel={`插入表情${emoji}`} onClick={() => { if (!sending) insertEmoji(emoji); }}><Text>{emoji}</Text></View>
          ))}
        </View>
        {showEmojis && (
          <View className='commentPopupEmojiPanel'>
            {EXTRA_EMOJIS.map((emoji) => (
              <View key={emoji} className='commentPopupPanelEmoji' ariaRole='button' ariaLabel={`插入表情${emoji}`} onClick={() => { if (!sending) insertEmoji(emoji); }}><Text>{emoji}</Text></View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
