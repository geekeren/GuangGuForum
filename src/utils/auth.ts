import Taro from "@tarojs/taro";
import { isSkyline } from "./renderer";

export function openLoginModal(fromUrl?: string) {
  let redirect = fromUrl;
  if (!redirect) {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    if (currentPage) {
      const route = currentPage.route || "";
      const params = (currentPage as any).options || {};
      const query = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
        .join("&");
      redirect = query ? `/${route}?${query}` : `/${route}`;
    } else {
      redirect = "/pages/home/index";
    }
  }
  wx.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}${isSkyline() ? "&modal=true" : ""}`,
    routeType: "wx://cupertino-modal",
    routeOptions: { backgroundColor: "#00000066" },
  });
}
