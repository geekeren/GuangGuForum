# 光谷过早客论坛小程序

[过早客](https://www.guozaoke.com/) 是武汉光谷地区的本地社区论坛，本项目为其提供微信小程序客户端，带来更流畅的移动端浏览体验。

## 功能

### 信息浏览
- 首页四栏信息流（最近更新 / 最近发布 / 精华 / 我的关注）
- 动态热门节点标签页，双击标签回到顶部
- 帖子详情：毛玻璃导航栏、共享元素过渡动画、富文本渲染
- 评论排序（升序/降序）、评论点赞、回复、复制
- 发现页：热议排行、热门板块、关注板块更新
- 消息通知：回复和提及，点击直达目标评论并高亮闪烁

### 发帖
- 四种发帖类型：普通 / 转载 / 活动 / 相亲贴
- 转载：自动读取剪贴板链接，一键抓取标题/摘要/缩略图
- 活动：日期时间 + 地图选点，结构化发布
- 相亲贴：性别/出生年/期望，自动计算年龄
- 草稿自动保存，切换类型各自保留，重进恢复上次状态

### 用户与交互
- 用户主页：声望等级、发帖/回复/收藏统计
- 微信分享（好友 / 朋友圈），自动提取首图
- 链接预览：站内链接直接跳转，25+ 外站域名摘要预览
- 添加到桌面、看广告免广告 30 天
- 隐私协议、账号记忆
- 缓存管理：按类型查看缓存（帖子/节点/用户/链接预览），支持分类清除

## 技术架构

### 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   微信小程序 (Skyline)                │
│  ┌───────────────────────────────────────────────┐  │
│  │              Taro 4 + React 18                 │  │
│  │  ┌───────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │  Pages    │ │Components │ │   Utils      │ │  │
│  │  │ · home    │ │ · Navbar  │ │ · linkHandler│ │  │
│  │  │ · detail  │ │ · HtmlRdr │ │ · cacheReq   │ │  │
│  │  │ · create  │ │ · PullDwn │ │ · auth       │ │  │
│  │  │ · user    │ │ · MkdwnRdr│ │ · renderer   │ │  │
│  │  │ · ...     │ │ · ...     │ │ · ...        │ │  │
│  │  └─────┬─────┘ └──────────┘ └──────┬───────┘ │  │
│  │        │                            │         │  │
│  │  ┌─────▼────────────────────────────▼───────┐ │  │
│  │  │         guanggu-forum-api                │ │  │
│  │  │  HTML → DataDom → Structured JSON        │ │  │
│  │  │  · getTopicDetail  · getUserProfile      │ │  │
│  │  │  · getRecentTopics · createNewComment    │ │  │
│  │  │  · fetchLinkSummary · getNotifications   │ │  │
│  │  └────────────────┬────────────────────────┘ │  │
│  └───────────────────┼──────────────────────────┘  │
│                      │ request() + Cookie 管理      │
└──────────────────────┼─────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  guozaoke.com   │
              │   (HTML 网站)    │
              └────────┬────────┘
                       │
           ┌───────────▼────────────┐
           │  login-proxy-service   │
           │  (阿里云 Serverless)    │
           │  仅代理登录 POST 请求   │
           │  解决 302 跳转问题      │
           └────────────────────────┘
```

### 数据流

```
用户操作 → Page/Component → API 层 (withCache)
                              │
                    ┌─────────▼──────────┐
                    │  缓存命中？         │
                    │  CacheService 读取  │
                    └───┬──────────┬─────┘
                        │ Yes      │ No
                   即时返回      请求网站 HTML
                   后台刷新      ↓
                        │   request() 自动管理 Cookie
                        │   HTML → DataDom 解析 → JSON
                        ▼         ↓
                   setState   CacheService 缓存
                        │         ↓
                        ▼       下次秒开
                   UI 渲染
```

### 缓存系统

所有本地存储统一通过 `CacheService`（`src/utils/CacheService.ts`）管理，禁止直接调用 `Taro.setStorageSync`。

```
CacheCategory 枚举
  ├── Topic    帖子缓存（HTML、草稿、选中节点）
  ├── Node     节点缓存（导航、节点页 HTML）
  ├── User     用户主页缓存（HTML）
  ├── Link     链接预览（外站摘要 HTML）
  ├── System   系统数据（cookies、用户名、账号）— 不可删除
  └── Other    其他（广告、评论排序、桌面引导等）

CacheService
  ├── 自动序列化：set() 自动 JSON.stringify，get() 自动 JSON.parse
  ├── 元数据追踪：每条缓存记录 key/size/createdAt/expiresAt/priority/category
  ├── TTL 过期：读取时自动检查，dailyCleanup 批量清理（异步空闲执行）
  ├── 优先级驱逐：low → normal → high（默认 normal），同优先级按 LRU
  ├── 分类访问：cacheService.category(CacheCategory.Topic).getStats()/.clear()
  └── 保护机制：System 类别不可被常规清理删除，remove(key, true) 可强制删除
```

API 层通过 `ICacheService` 接口（`packages/guanggu-forum-api/src/types.ts`）与实现解耦，启动时在 `app.ts` 注入：

```ts
setCacheService(cacheService);
```

### 发帖流程

```
选择类型 → Strategy 模式
  ├── normal:  自由标题+内容，自选板块
  ├── repost:  剪贴板URL → fetchLinkSummary → 预览确认 → 自动填充
  ├── event:   日期+时间+地图选点 → 结构化 Markdown
  └── dating:  性别+出生年+期望 → 自动计算年龄

表单输入 → 800ms 防抖自动保存草稿 (按 type+node 隔离)
  ↓
切换类型 → 保存当前草稿 → 加载目标草稿或 initialFields
  ↓
预览 → MarkdownRender 渲染 → 确认发布
  ↓
createTopic(node, title, content) → 清除草稿 → 返回列表
```

### 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | [Taro 4](https://docs.taro.zone/) + React 18 |
| 语言 | TypeScript |
| 样式 | SCSS + CSS Variables |
| 渲染器 | Skyline + glass-easel |
| 包管理 | Yarn 3 Workspaces (monorepo) |
| HTML 解析 | [node-html-parser](https://github.com/taoqf/node-html-parser) |
| 登录代理 | 阿里云 Serverless |

### Monorepo 结构

```
├── packages/
│   ├── guanggu-forum-api/       # API 层：HTML 抓取 → 结构化 JSON
│   │   ├── src/
│   │   │   ├── client.ts        #   统一请求 + Cookie 管理（依赖 ICacheService）
│   │   │   ├── utils/
│   │   │   │   ├── getDataFromHtml.ts  # 声明式 HTML→JSON 解析
│   │   │   │   └── urls.ts      #   URL 模板
│   │   │   ├── topic/           #   帖子相关 API
│   │   │   ├── notification/    #   消息通知 API
│   │   │   ├── discovery/       #   发现页 API
│   │   │   ├── link/            #   链接摘要 API (25+ 站点规则)
│   │   │   ├── login/           #   登录/登出（登出强制清除登录缓存）
│   │   │   └── ...
│   │   └── index.ts             #   统一导出
│   └── login-proxy-service/     # 登录代理：解决 302 跳转 cookie 问题
├── src/
│   ├── components/              # 通用组件
│   │   ├── AdBanner/            #   广告横幅（带免广告逻辑）
│   │   ├── AddToDesktopGuide/   #   添加到桌面引导
│   │   ├── AutoHeight/          #   动态高度容器
│   │   ├── ClearableInput/      #   可清空输入框（Delete 跳转上一字段）
│   │   ├── HtmlRender/          #   HTML 富文本渲染（图片预览、链接路由）
│   │   ├── LinkPreviewCard/     #   链接预览卡片
│   │   ├── Loading/             #   加载态
│   │   ├── LoginPrompt/         #   登录引导
│   │   ├── MarkdownRender/      #   Markdown 渲染器（自研，无依赖）
│   │   ├── Navbar/              #   毛玻璃导航栏（worklet 驱动）
│   │   ├── PullDownRefresh/     #   自定义下拉刷新
│   │   ├── Tag/                 #   分类标签
│   │   └── UserProfileDetail/   #   用户主页详情（声望/统计/三栏内容）
│   ├── pages/
│   │   ├── home/                #   首页 Tab 容器
│   │   │   ├── topics/          #     话题列表（4 默认 Tab + 动态节点 Tab）
│   │   │   ├── discovery/       #     发现（热议/热门/关注）
│   │   │   ├── notifications/   #     消息通知
│   │   │   └── me/              #     个人中心
│   │   ├── topicDetail/         #   帖子详情 + 评论 + 分享
│   │   ├── createTopic/         #   发帖（4 类型 Strategy + 草稿）
│   │   │   └── topicTypes/      #     类型策略注册表
│   │   ├── login/               #   登录（账号记忆 + 隐私协议）
│   │   ├── user/                #   用户主页
│   │   ├── node/topicList/      #   节点话题列表
│   │   ├── linkPreview/         #   链接预览（bottom-sheet）
│   │   ├── webview/             #   WebView 容器
│   │   └── settings/            #   设置（反馈/开源/缓存管理/退出）
│   ├── utils/
│   │   ├── CacheService.ts     #   统一缓存服务（TTL/优先级/分类/保护机制）
│   │   ├── currentUser.ts      #   当前用户（通过 CacheService 读取）
│   │   ├── linkHandler.ts       #   智能链接路由（站内/白名单/外链）
│   │   ├── auth.ts              #   登录弹窗
│   │   ├── ad.ts                #   广告管理（看广告免广告）
│   │   ├── htmlToMarkdown.ts    #   HTML→Markdown 转换
│   │   ├── renderer.ts          #   Skyline 检测
│   │   ├── dimension.ts         #   布局尺寸计算
│   │   ├── nodeNavigation.ts    #   节点导航缓存
│   │   ├── localAssets.ts       #   本地默认头像
│   │   ├── theme.ts             #   品牌色常量
│   │   └── ...                  #   其他工具
│   ├── assets/                  # SVG 图标资源
│   └── app.config.ts            # 全局配置（Skyline + glass-easel）
└── project.config.json          # 微信小程序项目配置
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

### 新增发帖类型

发帖类型基于 Strategy + Registry 模式：

1. 在 `src/pages/createTopic/topicTypes/` 下新建策略文件，实现 `TopicTypeDefinition` 接口
2. 在 `registry.ts` 中注册到 `_registry`

### API 层

所有数据获取逻辑在 `packages/guanggu-forum-api` 中维护。新增接口：

1. 在 `guanggu-forum-api/src/` 中定义 `DataDom` 声明式解析模板
2. 用 `getDataFromHtml(body, domStructure)` 将 HTML 解析为结构化 JSON
3. 导出类型定义和调用方法
4. 小程序端通过 `withCache` 包装调用以支持缓存

### 缓存规范

所有本地存储**必须**通过 `CacheService` 操作，禁止直接调用 `Taro.setStorageSync`：

```ts
// 写入 — category 必传，priority/ttl 可选（默认 normal / 30min）
cacheService.set(key, value, { category: CacheCategory.Topic });

// 读取 — 自动反序列化，自动检查过期
const data = cacheService.get<SomeType>(key);

// 删除 — System 类别受保护，force=true 跳过保护（仅退出登录使用）
cacheService.remove(key);
cacheService.remove(key, true);

// 分类操作
cacheService.category(CacheCategory.Topic).getStats();  // 统计
cacheService.category(CacheCategory.Topic).clear();     // 清除该分类
cacheService.getAllCategoryStats();                      // 全部分类统计
```

`CacheCategory.System` 类别（cookies、current_username、saved_accounts）不可被常规清理删除，退出登录时通过 `remove(key, true)` 强制清除。

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
- 新功能（深色模式等）
- `guanggu-forum-api` 接口覆盖完善
- `linkContentRules` 支持更多站点

## 许可证

MIT
