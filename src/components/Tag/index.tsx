import { View } from "@tarojs/components";
import React from 'react';
import styles from './index.module.scss';

interface Props {
  children: React.ReactNode
}

const Tag = ({ children }: Props) => {
  return <View className={styles.tag}>
    {children}
  </View>;
}
export default Tag;
