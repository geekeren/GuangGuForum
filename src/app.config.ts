export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/login/index",
    "pages/topicDetail/index",
    "pages/node/topicList/index",
    "pages/user/index",
    "pages/webview/index",
    "pages/linkPreview/index",
    "pages/search/index",
    "pages/createTopic/index",
  ],
  subPackages: [
    {
      root: "pages/secondary",
      name: "secondary",
      pages: [
        "messages/index",
        "messages/thread",
        "settings/index",
        "settings/image-setting",
        "settings/edit-profile",
      ],
    },
  ],
  preloadRule: {
    "pages/home/index": {
      network: "all",
      packages: ["secondary"],
    },
  },
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "@backgroundTextStyle",
    navigationBarBackgroundColor: "@navigationBarBackgroundColor",
    navigationBarTitleText: "过早客",
    navigationBarTextStyle: "@navigationBarTextStyle",
    backgroundColor: "@backgroundColor",
  },
  darkmode: true,
  themeLocation: "theme.json",
  lazyCodeLoading: "requiredComponents",
  renderer: "skyline",
  componentFramework: "glass-easel",
  rendererOptions: {
    skyline: {
      defaultDisplayBlock: true,
      defaultContentBox: true,
      tagNameStyleIsolation: "legacy",
      enableScrollViewAutoSize: true,
      disableABTest: true,
    },
  },
});
