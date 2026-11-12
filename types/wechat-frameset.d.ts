import "@tarojs/taro";

declare module "@tarojs/taro" {
  interface AppConfig {
    /** Native Windows WeChat two-page frameset; unsupported clients keep one page. */
    frameset?: boolean;
  }
}
