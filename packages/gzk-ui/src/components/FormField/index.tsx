import { Text, View } from "@tarojs/components";
import type { ReactNode } from "react";
import "./index.scss";

export interface GzkFormFieldProps {
  label: ReactNode;
  children: ReactNode;
  multiline?: boolean;
  className?: string;
  labelClassName?: string;
  controlClassName?: string;
}

export function GzkFormField({ label, children, multiline = false, className = "", labelClassName = "", controlClassName = "" }: GzkFormFieldProps) {
  return <View className={`gzkFormField${multiline ? " gzkFormField--multiline" : ""}${className ? ` ${className}` : ""}`}>
    <Text className={`gzkFormFieldLabel${labelClassName ? ` ${labelClassName}` : ""}`}>{label}</Text>
    <View className={`gzkFormFieldControl${controlClassName ? ` ${controlClassName}` : ""}`}>{children}</View>
  </View>;
}
