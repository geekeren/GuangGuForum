/// <reference path="../../types/assets.d.ts" />
import { View } from "@tarojs/components";
import type { ReactNode } from "react";
import styles from "./index.module.scss";

export interface GzkTagProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function GzkTag({ children, onClick, className = "" }: GzkTagProps) {
  return (
    <View className={`${styles.gzkTag}${className ? ` ${className}` : ""}`} onClick={onClick}>
      {children}
    </View>
  );
}
