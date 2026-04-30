# 光谷过早客论坛小程序

[过早客](https://www.guozaoke.com/) 是武汉光谷地区的本地社区论坛，本项目为其提供微信小程序客户端，带来更流畅的移动端浏览体验。

## 功能

- 帖子浏览（最近更新 / 最近发布 / 精华 / 关注 / 节点分类）
- 帖子详情、评论、点赞
- 用户登录、发帖、回复
- 用户个人主页
- 节点（板块）主页
- 分享到微信好友 / 朋友圈
- 下拉刷新、滚动加载更多

## 技术架构

### 整体设计

无需自建后端——小程序端直接请求过早客网站页面，通过 `guanggu-forum-api` 解析 HTML 转 JSON，渲染小程序界面。唯一例外是登录接口（网站 302 跳转导致小程序无法存储 cookie），使用轻量 serverless 代理完成。

### 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | [Taro 3](https://docs.taro.zone/) + React |
| 语言 | TypeScript |
| 样式 | SCSS + CSS Variables |
| UI 库 | [taro-ui](https://taro-ui.jd.com/) |
| 包管理 | Yarn 3 Workspaces (monorepo) |
| HTML 解析 | [node-html-parser](https://github.com/taoqf/node-html-parser) |
| 登录代理 | 阿里云 Serverless |

### Monorepo 结构

```
├── packages/
│   ├── guanggu-forum-api/   # HTML 解析层：抓取网站页面 → 解析为结构化 JSON
│   └── login-proxy-service/ # 登录代理：解决 302 跳转 cookie 问题
├── src/
│   ├── components/          # 通用组件
│   │   ├── PullDownRefresh/ # 下拉刷新
│   │   ├── HtmlRender/      # HTML 富文本渲染
│   │   ├── Navbar/          # 自定义导航栏
│   │   ├── Icon/            # SVG 图标
│   │   ├── Loading/         # 加载态
│   │   ├── Tag/             # 标签
│   │   └── ...
│   ├── pages/
│   │   ├── home/            # 首页（话题列表 + Tab 切换）
│   │   ├── topicDetail/     # 帖子详情 + 评论
│   │   ├── login/           # 登录
│   │   ├── createTopic/     # 发帖
│   │   ├── user/            # 用户主页
│   │   ├── node/            # 节点话题列表
│   │   └── me/              # 个人中心
│   ├── utils/               # 工具函数（缓存、URL 解析、尺寸计算等）
│   ├── assets/              # SVG 图标资源
│   └── app.config.ts        # 全局配置
└── project.config.json      # 微信小程序项目配置
```

## 快速开始

### 环境要求

- Node.js 16+
- Yarn 3+
- 微信开发者工具

### 安装

```bash
git clone https://github.com/geekeren/GuangGuForum.git
cd GuangGuForum
yarn install
```

### 开发

```bash
# 启动微信小程序开发模式（watch）
yarn dev:weapp
```

然后用微信开发者工具打开项目根目录即可预览。

### 构建

```bash
yarn build:weapp
```

## 项目约定

### 新增页面

1. 在 `src/pages/` 下创建目录，包含 `index.tsx`、`index.scss`、`index.config.ts`
2. 在 `src/app.config.ts` 的 `pages` 数组中注册页面路径

### 新增组件

1. 在 `src/components/` 下创建目录，包含 `index.tsx` 和 `index.scss`
2. 组件使用函数式组件 + hooks，样式使用 BEM 或简单嵌套

### API 层

所有数据获取逻辑在 `packages/guanggu-forum-api` 中维护。新增接口：

1. 在 `guanggu-forum-api/src/` 中添加抓取 + 解析函数
2. 导出类型定义和调用方法
3. 小程序端通过 `withCache` 包装调用以支持缓存

### 样式

- 全局设计变量定义在 `src/vars.scss`（颜色、圆角、阴影等）
- 尺寸使用 `rpx`，导航栏等需匹配系统胶囊的场景使用 `px`
- 使用 `rpxToPx()` 工具函数做单位转换

## 贡献

欢迎贡献代码！流程：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/your-feature`)
3. 提交改动 (`git commit -m 'feat: add your feature'`)
4. 推送分支 (`git push origin feature/your-feature`)
5. 提交 Pull Request

### 贡献方向

- 修复 Bug
- UI / 交互优化
- 新功能（消息通知、用户注册、深色模式等）
- `guanggu-forum-api` 接口覆盖完善
- 多端适配（H5、支付宝小程序等）

## 许可证

MIT
