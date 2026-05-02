import Taro from "@tarojs/taro";
import { isSkyline } from "./renderer";

export function openLoginModal(fromUrl?: string, showToast = true) {
  const redirect = fromUrl || Taro.getCurrentPages().pop()?.route || "";
  if (showToast) {
    Taro.showToast({ title: "请登录后再操作", icon: "none", duration: 1500 });
  }
  const delay = showToast ? 500 : 0;
  setTimeout(() => {
    wx.navigateTo({
      url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}${isSkyline() ? "&modal=true" : ""}`,
      routeType: "wx://cupertino-modal",
      routeOptions: { backgroundColor: "#00000066" },
    });
  }, delay);
}
