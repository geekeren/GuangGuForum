export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/login/index",
    "pages/topicDetail/index",
    "pages/node/topicList/index",
    "pages/user/index",
    "pages/createTopic/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "WeChat",
    navigationBarTextStyle: "black",
  },
  lazyCodeLoading: "requiredComponents",
  rendererOptions: {
    skyline: {
      defaultDisplayBlock: true,
      defaultContentBox: true,
    },
  },
});
