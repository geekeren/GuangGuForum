/// <reference path="../../types/assets.d.ts" />
import { Picker, Text, View } from "@tarojs/components";
import type { ColorTheme } from "../../theme";
import { GzkIcon } from "../Icon";
import { ChevronRight } from "../../icons";
import "./index.scss";

export interface GzkSelectOption { value: string; label: string }
export interface GzkSelectProps {
  options: readonly GzkSelectOption[];
  value: string;
  onChange: (value: string) => void;
  theme: ColorTheme;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function GzkSelect({ options, value, onChange, theme, disabled = false, className = "", placeholder = "请选择" }: GzkSelectProps) {
  const index = options.findIndex(option => option.value === value);
  return <Picker mode="selector" disabled={disabled} range={options.map(option => option.label)} value={Math.max(0, index)} className={`gzkSelect${className ? ` ${className}` : ""}`} onChange={event => {
    if (disabled) return;
    const raw = event.detail.value;
    if (typeof raw !== "number" && (typeof raw !== "string" || !/^\d+$/.test(raw))) return;
    const selected = Number(raw);
    if (!Number.isInteger(selected) || selected < 0 || selected >= options.length) return;
    onChange(options[selected].value);
  }}><View className="gzkSelectControl">
    <Text className="gzkSelectValue">{options[index]?.label || placeholder}</Text>
    <GzkIcon src={ChevronRight} theme={theme} tone="muted" className="gzkSelectArrow" />
  </View></Picker>;
}
