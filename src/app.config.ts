export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/login/index',
    'pages/topicDetail/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'WeChat',
    navigationBarTextStyle: 'black'
  },
  lazyCodeLoading: "requiredComponents",
  // renderer: 'skyline'
})
