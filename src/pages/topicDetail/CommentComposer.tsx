import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import MentionTextarea from "../../components/MentionTextarea";
import { isSkyline } from "../../utils/renderer";

interface Props {
  value: string;
  sending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}

export default function CommentComposer({ value, sending, onChange, onClose, onSend }: Props) {
  const skyline = isSkyline();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
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

  return (
    <View className={`commentPopup commentPopup--visible${skyline ? " commentPopup--skyline" : ""}`} style={popupStyle}>
      <View className='commentPopupMask' onClick={onClose} />
      <View className='commentPopupBody' style={bodyStyle}>
        <View className='commentPopupHeader'>
          <View className='commentPopupCancel' onClick={onClose}><Text>取消</Text></View>
          <Text className='commentPopupTitle'>评论</Text>
          <View className={`commentPopupSend ${sending ? "commentPopupSend--disabled" : ""}`} onClick={onSend}>
            <Text>{sending ? "发送中..." : "发送"}</Text>
          </View>
        </View>
        <MentionTextarea
          className='commentPopupTextarea'
          cursorSpacing={skyline ? 0 : 100}
          adjustPosition={!skyline}
          fixed
          focus
          autoHeight={false}
          onFocus={(event) => updateKeyboardHeight(event.detail.height)}
          onKeyboardHeightChange={(event) => updateKeyboardHeight(event.detail.height)}
          onInput={(event) => onChange(event.detail.value)}
          value={value}
          showConfirmBar={false}
          placeholder='说点什么'
        />
      </View>
    </View>
  );
}
