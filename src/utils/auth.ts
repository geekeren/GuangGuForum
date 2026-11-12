import { createPageNavigation, type PageOwner } from "./pageScope";
import { isSkyline } from "./renderer";

export function openLoginModal(fromUrl?: string, owner?: PageOwner) {
  if (getCurrentPages().some((page) => page.route === "pages/login/index")) return;
  const route = owner?.route || owner?.$taroPath?.split('?')[0] || 'pages/home/index';
  const query = Object.entries(owner?.options || {}).map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&');
  const redirect = fromUrl || `${route.startsWith('/') ? route : `/${route}`}${query ? `?${query}` : ''}`;
  const options = {
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}${(owner ? owner.renderer === "skyline" : isSkyline()) ? "&modal=true" : ""}`,
    routeType: "wx://cupertino-modal",
    routeOptions: { backgroundColor: "#00000066" },
  };
  if (owner) void createPageNavigation(owner).navigateTo(options).catch(() => {});
  else wx.navigateTo(options);
}
