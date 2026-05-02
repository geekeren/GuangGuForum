export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/login/index",
    "pages/topicDetail/index",
    "pages/node/topicList/index",
    "pages/user/index",
    "pages/createTopic/index",
    "pages/webview/index",
    "pages/linkPreview/index",
    "pages/settings/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "过早客",
    navigationBarTextStyle: "black",
    backgroundColor: "#666666",
  },
  lazyCodeLoading: "requiredComponents",
  renderer: "skyline",
  componentFramework: "glass-easel",
  rendererOptions: {
    skyline: {
      defaultDisplayBlock: true,
      defaultContentBox: true,
    },
  },
});
