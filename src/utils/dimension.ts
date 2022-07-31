import Taro from "@tarojs/taro";

let navInfo;

export const getNavInfo = () => {
  if (navInfo) {
    return navInfo;
  }
  const {statusBarHeight = 0, screenWidth, screenHeight, windowHeight} = Taro.getSystemInfoSync()
  // 获取胶囊信息
  const {width, height, left, top, right} = Taro.getMenuButtonBoundingClientRect()
  // 计算标题栏高度
  const capsulePaddingTop = top - statusBarHeight;
  const titleBarHeight = height + (top - statusBarHeight) * 2
  // 计算导航栏高度
  const appHeaderHeight = statusBarHeight + titleBarHeight
  //边距，两边的
  const marginSides = screenWidth - right
  //标题宽度
  const titleBarWidth = screenWidth - width - marginSides * 3
  //去掉导航栏，屏幕剩余的高度
  const contentHeight = screenHeight - appHeaderHeight

  navInfo = {
    statusBarHeight: statusBarHeight, //状态栏高度
    titleBarHeight: titleBarHeight,  //标题栏高度
    titleBarWidth: titleBarWidth,  //标题栏宽度
    appHeaderHeight: appHeaderHeight, //整个导航栏高度
    marginSides: marginSides, //侧边距
    capsuleWidth: width, //胶囊宽度
    capsuleHeight: height, //胶囊高度
    capsuleLeft: left,
    capsulePaddingTop: capsulePaddingTop,
    contentHeight: contentHeight,
    screenHeight,
    windowHeight,
    screenWidth
  };
  return navInfo;
}
