import Taro from "@tarojs/taro";

export function getCachedUsername(): string {
  return Taro.getStorageSync("current_username") || "";
}
