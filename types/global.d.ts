/// <reference types="@tarojs/taro" />

declare module "*.png";
declare module "*.gif";
declare module "*.jpg";
declare module "*.jpeg";
declare module "*.svg";
declare module "*.svg?raw" {
  const source: string;
  export default source;
}
declare module "*.css";
declare module "*.less";
declare module "*.scss";
declare module "*.sass";
declare module "*.styl";

declare namespace JSX {
  // Narrow event surface forwarded by the native format button. Keep this local
  // instead of importing Taro types here, so global JSX resolution and existing
  // declaration ordering stay unchanged.
  type NativeFormatEvent = { stopPropagation(): void };
  interface IntrinsicElements {
    'topic-format-button': {
      key?: string;
      icon: string;
      label: string;
      disabled: boolean;
      active: boolean;
      background: string;
      thumbnail?: boolean;
      caption?: string;
      loading?: boolean;
      onFormatend: (event: NativeFormatEvent) => void;
    };
  }
}

declare namespace NodeJS {
  interface ProcessEnv {
    TARO_ENV:
      | "weapp"
      | "swan"
      | "alipay"
      | "h5"
      | "rn"
      | "tt"
      | "quickapp"
      | "qq"
      | "jd";
  }
}
