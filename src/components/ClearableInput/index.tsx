import { View, Text, Input, Textarea } from "@tarojs/components";
import { forwardRef, useRef, useState, type CSSProperties } from "react";
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
  style?: CSSProperties;
  disabled?: boolean;
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
  style?: CSSProperties;
  disabled?: boolean;
  maxlength?: number;
  autoHeight?: boolean;
  focus?: boolean;
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
    <View className={`clearableWrap${value ? " clearableWrap--hasValue" : ""}`}>
      <Input
        ref={ref}
        className={`clearableControl ${className}`}
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
    style,
    disabled,
    maxlength,
    autoHeight,
    focus,
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

  const displayValue = focused && !value && onDeleteWhenEmpty ? ZWSP : value;

  return (
    <View className={`clearableWrap clearableWrap--textarea${value ? " clearableWrap--hasValue" : ""}`}>
      <Textarea
        ref={ref}
        className={`clearableControl ${className}`}
        placeholder={placeholder}
        placeholderClass={placeholderClass}
        value={displayValue}
        style={style}
        disabled={disabled}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        maxlength={maxlength}
        autoHeight={autoHeight}
        focus={focus}
        cursorSpacing={cursorSpacing}
        adjustPosition={adjustPosition}
        showConfirmBar={showConfirmBar}
        confirmType={confirmType as any}
        onConfirm={onConfirm}
        // 兼容旧调用方；微信原生模板未绑定 cursor-color，光标样式应通过 style/CSS 设置
        {...({ cursorColor } as any)}
      />
      {value ? (
        <View className="clearableBtn clearableBtn--textarea" onClick={() => { if (!disabled) onInput(""); }}>
          <Text className="clearableBtnText">✕</Text>
        </View>
      ) : null}
    </View>
  );
});
