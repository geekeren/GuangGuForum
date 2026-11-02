import { ENABLE_CUSTOM_NAVBAR } from "../config";

export default definePageConfig({
  enablePageMeta: true,
  navigationBarTitleText: "过早客",
  enableShareAppMessage: true,
  enableShareTimeline: true,
  navigationStyle: "custom",
  disableScroll: true,
  renderer: "skyline",
  ...(ENABLE_CUSTOM_NAVBAR ? { componentFramework: "glass-easel" } : {}),
});
