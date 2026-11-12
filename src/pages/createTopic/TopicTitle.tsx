import { Text, View } from '@tarojs/components';
import { useImperativeHandle, useState, type RefObject } from 'react';
import { ClearableTextarea } from '../../components/ClearableInput';
import { BRAND_COLOR } from '../../utils/theme';
import { tryHideKeyboardAccessoryView } from '../../utils/keyboardAccessory';

export const TOPIC_TITLE_MAX_LENGTH = 50;

interface Props {
  inputRef: RefObject<any>;
  editorRef: RefObject<any>;
  value: string;
  placeholder?: string;
  onInput: (value: string) => void;
  onNext: () => void;
}

export default function TopicTitle({ inputRef, editorRef, value, placeholder = '标题（必填）', onInput, onNext }: Props) {
  const [focused, setFocused] = useState(false);
  useImperativeHandle(inputRef, () => ({ focus: () => setFocused(true) }));
  const next = () => { setFocused(false); onNext(); };
  return <View className='topicTitleSection'>
    <ClearableTextarea className='titleInput' placeholder={placeholder} placeholderClass='titlePlaceholder'
      cursorColor={BRAND_COLOR} maxlength={TOPIC_TITLE_MAX_LENGTH} value={value} onInput={nextValue => { if (nextValue.includes('\n')) setFocused(false); onInput(nextValue); }} autoHeight
      focus={focused} onFocus={() => { tryHideKeyboardAccessoryView(); setFocused(true); editorRef.current?.dismissTools?.(); }} onBlur={() => setFocused(false)}
      showConfirmBar={false} adjustPosition={false} confirmType='next' onConfirm={next} onDeleteWhenEmpty={next}
    />
    <Text className='topicTitleCount'>{value.length}/{TOPIC_TITLE_MAX_LENGTH}</Text>
  </View>;
}
