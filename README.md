# 武汉过早客应用

基于过早客网站 https://www.guozaoke.com/ 提供一个更好产品运营、用户体验的论坛小程序。

![过早客微信小程序](https://user-images.githubusercontent.com/13082375/183296328-ed27f320-2346-4627-b351-7c0839632a2d.jpg)


借助微信入口，帮助“过早客”用户粘度更强、访问更频繁、用户体验更佳，成为武汉地区具备广泛知名度的应用。


## 阶段目标

1. 实现网站所有功能的小程序版，包括

  - 帖子浏览
  - 用户登录、回复、发帖
  - 用户分享、点赞、收藏
  - 用户个人页
  - 板块主页
  - 消息中心
  - 用户注册
    > 涉及验证码考虑嵌入 过早客网站网页来进行注册，但由于个人账号无法内嵌 webview，可能只能指引到浏览器中进行）


2. 优化 UI 布局，为每个板块提供更贴合板块产品特性而非众生一面的用户交互体验

## 开发过程

- 本项目基于 Taro 框架开发，开发过程参考

https://docs.taro.zone/docs/GETTING-STARTED

技术上支持 Android/IOS 多端，但考虑到过早客是一个相对轻量级的网站，小程序已经足够满足需求而且用户无需安装应用。

- 技术原理

  - 技术设计初衷：尽量在无任何后端代理完成所有功能，降低后期维护复杂度和运营成本，直接在小程序端拉取并解析网站的HTML，转成json数据，渲染小程序界面
  - 工程采用 monorepo 管理，html 转 json api 代码 在 packages/guanggu-forum-api 单独维护
  - packages/guanggu-forum-api 使用 node-html-parser 解析 HTML
 
> 例外: 由于登录接口过早客网站通过 302 进行跳转，微信小程序对于 302 返回会自动 follow-redirect，直接给上层返回跳转后的页面，所以小程序无法存储登录后的 cookie。
所以登录接口使用了本项目唯一的后端代理，部署在了阿里云的serverless 服务上。
相关代码位于packages/login-proxy-service
