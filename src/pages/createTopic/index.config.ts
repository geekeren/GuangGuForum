export default definePageConfig({
  enablePageMeta: true,
  navigationBarTitleText: "发帖",
  navigationStyle: "custom",
  renderer: "webview",
  disableScroll: true,
  componentFramework: "glass-easel",
  usingComponents: {
    'topic-format-button': '../../native-components/topic-format-button/index',
  },
});
