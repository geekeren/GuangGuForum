import { View } from '@tarojs/components';
import { useHeight } from '../../hooks/useHeight';
import { useState } from 'react';

function generateRandomLetters(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
export const AutoHeight = (props) => {
  const { children, style } = props;
  const [id] = useState(() => generateRandomLetters(16));
  const height = useHeight(id);
  console.log('height', height);
  return <View id={id} style={style}>{
    children(height)
  }</View>
}
