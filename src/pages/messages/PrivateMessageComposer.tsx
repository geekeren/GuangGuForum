import { Text, View } from '@tarojs/components';
import { GzkNativeTextarea as Textarea } from 'gzk-ui/native-form';
import Taro, { useDidHide } from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import ThemedIcon from '../../components/ThemedIcon';
import { Send as SendIcon } from "gzk-ui/icons";
import { resolveKeyboardDockInset } from '../../utils/keyboardDockPosition';

interface Props {
  value: string;
  limit: number;
  disabled: boolean;
  posting: boolean;
  unavailableReason?: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

function windowSize() {
  try { return Taro.getWindowInfo(); } catch { return { windowHeight: 0, screenHeight: 0, safeArea: undefined }; }
}

/** Native text-only comment-style dock. Geometry reuses the shared viewport compensation. */
export default function PrivateMessageComposer({ value, limit, disabled, posting, unavailableReason = '当前会话暂不能发送', onChange, onSend }: Props) {
  const initial = windowSize();
  const baseline = useRef(initial.windowHeight);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(initial.windowHeight);
  const mounted = useRef(true);
  const keyboardRef = useRef(0);
  const safeBottom = initial.safeArea ? Math.max(0, initial.screenHeight - initial.safeArea.bottom) : 0;
  const dockInset = Math.max(0, resolveKeyboardDockInset({ keyboardHeight, baselineHeight: baseline.current, viewportHeight }));
  const blocked = disabled || posting;
  const canSend = !blocked && value.trim().length > 0 && value.trim().length <= limit;

  const updateKeyboard = (height: number) => {
    if (!mounted.current || !Number.isFinite(height)) return;
    const next = Math.max(0, height);
    keyboardRef.current = next;
    setKeyboardHeight(next);
    setViewportHeight(windowSize().windowHeight);
    // One native layout pass, no polling/timers. A trailing hide/unmount cannot update the dock.
    Taro.nextTick(() => { if (mounted.current && keyboardRef.current === next) setViewportHeight(windowSize().windowHeight); });
  };
  useDidHide(() => { keyboardRef.current = 0; setKeyboardHeight(0); });
  useEffect(() => {
    mounted.current = true;
    const resize = (event: unknown) => {
      const size = (event as { size?: { windowHeight?: number } })?.size;
      if (!mounted.current || !size || !Number.isFinite(size.windowHeight)) return;
      const height = size.windowHeight!;
      if (keyboardRef.current === 0) baseline.current = height;
      setViewportHeight(height);
    };
    Taro.onWindowResize?.(resize);
    return () => { mounted.current = false; Taro.offWindowResize?.(resize); };
  }, []);

  return <View className='privateMessageDock' style={{ paddingBottom: `${keyboardHeight > 0 ? 8 : safeBottom + 8}px` }}>
    <View className='privateMessageComposer'>
      <View className='privateMessageInputBody'>
      <Textarea className='privateMessageInput' value={value} maxlength={limit} disabled={blocked} autoHeight
        adjustPosition={false} showConfirmBar={false} holdKeyboard cursorSpacing={0}
        placeholder={posting ? '提交中…' : disabled ? unavailableReason : '说点什么…'}
        onFocus={event => updateKeyboard(event.detail.height)}
        onKeyboardHeightChange={event => updateKeyboard(event.detail.height)}
        onInput={event => { if (!blocked) onChange(event.detail.value); }}
      />
      {blocked && value.length > 0 && <Text className='privateMessageInputState'>{posting ? '提交中…' : unavailableReason}</Text>}
      </View>
      <View className={`privateMessageSend ${canSend ? '' : 'privateMessageSend--disabled'}`} ariaRole='button' ariaLabel={posting ? '私信提交中' : '发送私信'} onClick={() => { if (canSend) onSend(); }}>
        <ThemedIcon src={SendIcon} tone='accent-text' className='privateMessageSendIcon' />
      </View>
    </View>
    {(value.trim().length > 0 || limit === 120) && <Text className='privateMessageComposerCount'>{posting ? '提交中…' : `${value.trim().length}/${limit}${limit === 120 ? ' · 首条消息请求' : ''}`}</Text>}
    {dockInset > 0 && <View className='privateMessageKeyboardSlot' style={{ height: `${dockInset}px` }} />}
  </View>;
}
