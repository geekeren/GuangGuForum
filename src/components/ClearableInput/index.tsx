import { View, Text, Input, Textarea } from "@tarojs/components";
import { forwardRef, useRef, useState } from "react";
import "./index.scss";

const ZWSP = "​";

interface ClearableInputProps {
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
  maxlength?: number;
  autoFocus?: boolean;
  focus?: boolean;
  confirmType?: string;
  onConfirm?: () => void;
  onDeleteWhenEmpty?: () => void;
}

interface ClearableTextareaProps {
  className?: string;
  placeholder?: string;
  placeholderClass?: string;
  value: string;
  onInput: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  cursorColor?: string;
  maxlength?: number;
  autoHeight?: boolean;
  cursorSpacing?: number;
  adjustPosition?: boolean;
  showConfirmBar?: boolean;
  confirmType?: string;
  onConfirm?: () => void;
  onDeleteWhenEmpty?: () => void;
}

export const ClearableInput = forwardRef<any, ClearableInputProps>((props, ref) => {
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
    <View className="clearableWrap">
      <Input
        ref={ref}
        className={`clearableControl ${className}`}
        placeholder={placeholder}
        placeholderClass={placeholderClass}
        value={displayValue}
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
        <View className="clearableBtn" onClick={() => onInput("")}>
          <Text className="clearableBtnText">✕</Text>
        </View>
      ) : null}
    </View>
  );
});

export const ClearableTextarea = forwardRef<any, ClearableTextareaProps>((props, ref) => {
  const {
    className = "",
    placeholder,
    placeholderClass,
    value,
    onInput,
    onFocus,
    onBlur,
    cursorColor,
    maxlength,
    autoHeight,
    cursorSpacing,
    adjustPosition,
    showConfirmBar,
    confirmType,
    onConfirm,
    onDeleteWhenEmpty,
  } = props;

  const [focused, setFocused] = useState(false);
  const wasEmptyRef = useRef(false);

  const handleInput = (e: any) => {
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

  const displayValue = focused && !value && onDeleteWhenEmpty ? ZWSP : value;

  return (
    <View className="clearableWrap clearableWrap--textarea">
      <Textarea
        ref={ref}
        className={`clearableControl ${className}`}
        placeholder={placeholder}
        placeholderClass={placeholderClass}
        value={displayValue}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        maxlength={maxlength}
        autoHeight={autoHeight}
        cursorSpacing={cursorSpacing}
        adjustPosition={adjustPosition}
        showConfirmBar={showConfirmBar}
        confirmType={confirmType as any}
        onConfirm={onConfirm}
        // cursorColor 不在 Taro TextareaProps 类型中但运行时支持
        {...({ cursorColor } as any)}
      />
      {value ? (
        <View className="clearableBtn clearableBtn--textarea" onClick={() => onInput("")}>
          <Text className="clearableBtnText">✕</Text>
        </View>
      ) : null}
    </View>
  );
});
