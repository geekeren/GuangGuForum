import { View, Text, Input } from "@tarojs/components";
import { forwardRef, useRef, useState, type CSSProperties } from "react";
import "../FormControl/index.scss";

const ZWSP = "​";

export interface GzkInputProps {
  className?: string;
  placeholder?: string;
  placeholderClass?: string;
  value: string;
  onInput: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  type?: string;
  password?: boolean;
  cursorColor?: string;
  style?: CSSProperties;
  disabled?: boolean;
  maxlength?: number;
  autoFocus?: boolean;
  focus?: boolean;
  confirmType?: string;
  onConfirm?: () => void;
  onDeleteWhenEmpty?: () => void;
}

export const GzkInput = forwardRef<any, GzkInputProps>((props, ref) => {
  const {
    className = "",
    placeholder,
    placeholderClass,
    value,
    onInput,
    onFocus,
    onBlur,
    type,
    password,
    cursorColor,
    style,
    disabled,
    maxlength,
    autoFocus,
    focus,
    confirmType,
    onConfirm,
    onDeleteWhenEmpty,
  } = props;

  const [focused, setFocused] = useState(false);
  const wasEmptyRef = useRef(false);

  const handleInput = (e: any) => {
    if (disabled) return;
    const val = e.detail.value.replace(ZWSP, "");
    if (!val && wasEmptyRef.current && onDeleteWhenEmpty) {
      onDeleteWhenEmpty();
      return;
    }
    wasEmptyRef.current = !val;
    onInput(val);
  };

  const handleFocus = (_e: any) => {
    setFocused(true);
    wasEmptyRef.current = !value;
    onFocus?.();
  };

  const handleBlur = (_e: any) => {
    setFocused(false);
    onBlur?.();
  };

  // 只在聚焦且值为空时插入零宽空格，让删除键可捕获
  const displayValue = focused && !value && onDeleteWhenEmpty ? ZWSP : value;

  return (
    <View className={`gzkInput clearableWrap${value ? " clearableWrap--hasValue" : ""}`}>
      <Input
        ref={ref}
        className={`gzkFormControl clearableControl ${className}`}
        placeholder={placeholder}
        placeholderClass={placeholderClass}
        value={displayValue}
        style={style}
        disabled={disabled}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        type={type as any}
        password={password}
        cursorColor={cursorColor}
        maxlength={maxlength}
        autoFocus={autoFocus}
        focus={focus}
        confirmType={confirmType as any}
        onConfirm={onConfirm}
      />
      {value ? (
        <View className="clearableBtn" onClick={() => { if (!disabled) onInput(""); }}>
          <Text className="clearableBtnText">✕</Text>
        </View>
      ) : null}
    </View>
  );
});
