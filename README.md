# 武汉过早客应用

基于过早客网站 https://www.guozaoke.com/ 提供一个更好产品运营、用户体验的论坛小程序。

## 阶段目标

1. 实现网站所有功能的小程序版

2. 优化 UI 布局，为每个板块提供更贴合的用户交互体验

## 开发过程

- 本项目基于 Taro 框架开发，开发过程参考

https://docs.taro.zone/docs/GETTING-STARTED

- 技术原理

无后端代理，直接在小程序端拉取并解析网站的HTML，转成json数据，渲染小程序界面
