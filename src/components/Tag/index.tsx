import { View } from "@tarojs/components";
import React from 'react';
import styles from './index.module.scss';

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
}

const Tag = ({ children, onClick }: Props) => {
  return <View className={styles.tag} onClick={onClick}>
    {children}
  </View>;
}
export default Tag;
