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
- 文档式富文本正文：段落、加粗、标题、列表，上传完成的图片可点击插入当前光标位置
- Markdown 输入快捷排版；不支持的语法保留在源码模式，预览明确显示纯文本回退，旧草稿兼容恢复
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
  ├── event:   日期+时间+地图选点 → 结构化 HTML
  └── dating:  性别+出生年+期望 → 自动计算年龄

表单输入 → 原生 editor Delta / Markdown 源码 → 自动保存草稿 (按 type+node 隔离)
  ↓
切换类型 → 保存当前文档快照 → 加载目标草稿或 initialFields
  ↓
文档 → 校验图片状态及账号归属 → 安全 HTML → 类型 Strategy 组合正文
  ↓
预览 → HtmlRender 渲染 → 确认发布
  ↓
createTopic(node, title, content) → 清除草稿 → 返回列表
```

独立发帖页使用小程序 **WebView 渲染器**及原生 `editor`；PC首页实际运行于WebView时可在右侧内容Tab复用同一编辑器。手机首页及其他页面保持原Skyline配置，不是嵌入外部 H5。`topicDocument.ts` 负责有界 Delta 校验、Markdown 输入兼容、安全 HTML 导出及图片引用校验，UI 负责光标、工具栏和上传。论坛提交正文为 **HTML**，API 的 `content:string` 字段不变；文本和属性必须转义，标签、格式及图片 URL 使用白名单。草稿保留版本化 Delta 与兼容的源码正文；不支持的 Markdown 不能通过有损转换覆盖原稿。

图片先上传至现有图床，完成后点击缩略图插入当前选区；上传完成不会自动在已移动的光标处插图。已插入正文的附件不再重复追加到文末，删除正文图片也不会由附件列表重新补回。源码与富文本互切后仍校验已知图片的账号归属；正文中仍引用的图片保留附件记录，删除后才可移除记录、释放附件名额。

Markdown 快捷排版依赖基础库 3.7.11 起的原生选区接口并在运行时检测；只处理文末明确的单字符输入，跳过粘贴、正文中部和不明确的输入法替换。编辑时不逐次 `setContents` 重置全文。键盘、输入法、选区及撤销行为仍须在真实微信环境验收。

富文本验收须在构建后的实际发帖页进行，不以普通浏览器或其他临时项目代替：
- 从首页和板块页进入发帖页，确认原生编辑器初始化、返回导航和滚动正常。
- 输入中文、emoji、多段正文及 `**加粗**`、`# `，检查光标、后续输入格式和工具栏加粗/段落切换。
- 图片上传失败重试，完成后在两段文字之间插入；删除正文图片，确认预览没有重复或重新补回。
- 切换发帖类型、离开再进入及恢复旧草稿，确认正文、图片位置及类型字段保留。
- 预览四种类型的最终 HTML；实际发布属于独立操作，测试和预览不默认提交真实帖子。

### 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | [Taro 4](https://docs.taro.zone/) + React 18 |
| 语言 | TypeScript |
| 样式 | SCSS + CSS Variables |
| 渲染器 | Skyline + glass-easel；发帖页原生 editor 使用 WebView |
| 包管理 | Yarn 3 Workspaces (monorepo) |
| HTML 解析 | [node-html-parser](https://github.com/taoqf/node-html-parser) |
| 登录代理 | 阿里云 Serverless |

### 阅读字号

微信构建在 Taro 单位转换后，通过 `config/fixedReadingFonts.js` 将主要阅读区域的字号固定为逻辑 `px`。基准是 iPhone 15 Pro Max 的 430px 逻辑宽度，沿用微信的 rpx 整数取值：正文 `28rpx → 16px`，列表标题 `30rpx → 17px`，详情标题 `34rpx → 19px`。因此基准机型的字号保持不变，窄屏阅读文字不再按屏幕宽度缩小。

该规则覆盖帖子、评论、列表、发现、搜索、通知和用户资料等阅读区域，只转换 `font-size`。随后 `config/desktopLengths.js` 统一处理布局与仍响应式的字号：手机使用原 `rpx` 回退，桌面宿主提供固定逻辑像素。原生输入框及其提及文字叠层继续共用同一字号。新增阅读组件时应核对插件的选择器范围；修改转换顺序时需运行 `fixedReadingFonts.test.ts`、`desktopLengths.test.ts` 并检查最终 WXSS，避免固定字号被再次转换成 rpx。

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
│   │   ├── createTopic/         #   原生富文本发帖（4 类型 Strategy + 草稿）
│   │   │   ├── RichTopicBody.tsx #    原生 editor、源码兼容与文档快照
│   │   │   ├── nativeEditor.ts  #     原生上下文适配与有序变更
│   │   │   ├── editorShortcuts.ts #   保守的 Markdown 局部快捷转换
│   │   │   └── topicTypes/      #     类型策略注册表（HTML 正文）
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
│   │   ├── topicDocument.ts     #   Delta 校验、Markdown 输入兼容及安全 HTML 导出
│   │   ├── htmlToMarkdown.ts    #   外站 HTML 摘要提取（不用于作者正文）
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
yarn build:weapp --env production
```

发布前先停止 watch，再执行生产构建；不要让两次构建同时写入 `dist/`。生产构建压缩 JavaScript，并保留中文的 UTF-8 编码，避免不必要的 Unicode 转义膨胀。Skyline 所需的 CSS 双冒号兼容处理保持不变。

开发 watch 保留 source map 便于本地调试，生产构建不生成 Taro source map。开发者工具打包配置额外忽略 `.map` 文件，避免开发产物进入代码包；`uploadWithSourceMap` 保持开启，开发者工具自身的线上映射设置不变。对比包体积时，应比较相同生产构建的原始文件字节数，不将 gzip 大小或开发 source map 算作小程序代码体积。

小程序使用两个代码包：主包承载首页、详情、搜索、发帖、登录、用户主页、节点和链接页面，并复用私信列表、设置内容与发帖编辑器供Home内对应内容Tab使用；唯一的非独立分包 `secondary` 保留独立私信列表/会话与设置页面注册，首页按 `network: all` 预加载。私信与设置注册在 `pages/secondary/` 下的轻量入口，复用原功能目录，页面跳转统一使用 `src/utils/appRoutes.ts` 的注册路径；首页私信Tab和消息Tab一样在Home内切换内容，不通过页面跳转或替换导航栏。原 `pages/messages/`、`pages/settings/` 仅保留实现，不再注册为页面。首页直接引用私信列表使其UI及所需共享依赖进入主包；分包页面注册不变，不意味着私信实现仍全部只在分包。共有运行时、工具和模板仍由主包提供，分包减少的是首次下载的主包体积，不代表全部代码体积等量减少。

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
// 写入 — category 必传，priority 默认 normal；不传 ttl 时保留到容量淘汰
// 显式 ttl 仍按毫秒设置到期时间，供真正需要到期删除的临时数据使用
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

缓存策略分层：

- `src/utils/cachePolicy.ts`：定义保留语义与容量预算，不负责联网更新。
- `CacheService`：普通 storage 按 `getStorageInfoSync()` 获取本小程序总用量；预计写入超过 80% 时按过期、优先级、最近访问顺序淘汰到约 60%，未知数据和系统数据受保护。超大业务条目跳过缓存，写入失败可淘汰重试，不影响已获取的网络数据。
- `TopicFileCache`：详情／回复定位／用户资料 HTML 文件缓存预算 150MiB，默认 1000 条；计入临时文件与并发写入占用。共享索引持久化最近访问顺序，读取不改变联网刷新时间。
- `topicIndex`：帖子摘要索引有界合并，最多 1000 条且版本包装后的 UTF-8 内容不超过 512KiB；异常／超大条目不挤掉全部有效数据。
- API 层：缓存优先、后台联网更新；主动刷新跳过旧 HTML 读取，并写回成功的读取结果。节点导航按一天的重新验证间隔更新，失败保留旧数据；外链摘要命中后也后台更新。重新验证间隔不等于存储到期时间。
- 每个 API 校验自己的缓存版本及解析依赖版本；处理逻辑／结构变更时手动升级版本，旧包装不会作为有效数据使用。
- 新请求抑制旧响应发起写入及页面回调；已开始的文件提交可在新请求失败时保留可用数据，但不能覆盖已成功提交的更新数据。账号切换后不把旧账号结果送回页面。

无默认时间过期的策略只适用于新写入的数据，已有显式或旧缓存期限仍按原元数据处理；不会为迁移而清空用户数据。每日启动清理仍处理这些到期条目、文件垃圾与索引。平台可用空间不足时，即使应用预算未达到也可能无法缓存。

### 样式

- 全局设计变量定义在 `src/vars.scss`（颜色、圆角、阴影等）
- Mobile布局尺寸保留 `rpx` 回退，导航栏等需匹配系统胶囊的场景使用 `px`。微信构建依次执行 `pxtransform → fixedReadingFonts → desktopLengths`，最后一步原位将数字 `rpx` 长度转换成 `var(--gzk-rpx-N, 原值)`，由真实 `.themePageHost--desktop` 提供 `N/2 px`；窄窗格同样使用桌面密度，不复制高权重选择器，不改变手机声明顺序。共享库、CSS Modules、动画和阴影同策略；百分比、无单位值、固定PX、字符串与URL不转换，已有局部PC例外保留。
- `rpxToPx()` 保留原有窗口换算；需要兼容PC控件的内联值使用 `src/utils/desktopLayout.ts` 的 `uiRpxLength()`（桌面以375px设计基准换算、手机保留rpx）或 `uiRpxToPx()`（原生数值）。`uiCssRpxValue()` 仅转换自有主题等视觉字符串，不能传入论坛作者样式、正文HTML或媒体测量值。桌面身份依Windows/Mac客户端平台判断，不用屏幕宽度把手机或模拟器误判为PC。
- RootPortal 不假定继承页面作用域，浮层的既有真实根View需独立携带桌面class及主题变量，保持节点身份与草稿。复制到产物的原生 `topic-format-button` WXSS不经过PostCSS，通过内部 `desktop` 布尔视觉属性适配，触控事件与手机尺寸保持。新内联尺寸/原生组件也必须显式覆盖公共策略，不能只验证SCSS。

### PC窗口配置

`app.config.ts` 根级启用 `resizable: true` 和 `frameset: true`。首页导航在Windows/Mac PC客户端默认使用独立排版的56px左侧普通flex流列（按用户最终指定值，横向留白5px，保留44px头像点击目标），包括窄窗口与frameset首页，不再以960px门限或native测量成功为PC左栏前提。非PC客户端按捕获的所属native page测量实际区域：宽度达到960px也启左栏（内容仍有至少904px），窄区域或不可靠测量保持底部，因此手机常规宽度保持底栏、开发者工具宽屏预览仍适用。PC窄窗口的内容宽度按实际剩余空间收缩，不承诺800px最低内容预算。该局部导航策略不改变公共PC控件密度识别或手机rpx回退。永久 `homeWorkspace` 中保留 `homeMain` 内容列与Tab，页面标题/搜索的Navbar始终在 `homeMain` 内、正文之上；左栏布局时标题位于Tab右侧内容区，不再跨在左栏上方。内容列保持固定父链与key，不因导航模式切换重挂已访问页面；左侧导航独立于手机原五入口底Tab，论坛导航顶部为首页/发现/消息/私信，“私信”紧接“消息”下方，使用现有信封图标。私信与消息使用同一Home内容Tab机制，在右侧 `homeMain` 显示私信列表及“私信”标题，56px导航/footer结构不换成私信列表，并显示私信选中态；PC左栏当前通过下述redirectTo试验打开相应Home内容，不跳独立私信列表，也没有“返回论坛”或320px侧栏模式。私信列表复用既有MessageConversationList的账号验证、分页与刷新，首次访问懒挂载，随后像其他已访问Tab一样保留实例；仅选中私信且页面可见时active，切到其他Tab或页面隐藏时停用。点击会话仍使用现有会话分包路由与事件契约，可在frameset右侧打开会话。论坛导航底部依次为文字“发帖”、设置按钮、进入“我的”的头像。设置与消息一样使用Home设置内容Tab；PC身份且所属页面实际为WebView时，发帖使用Home发帖内容Tab，复用原生富文本editor、类型与工具栏，不跳独立发帖页；PC左栏目前通过下述redirectTo试验打开这些内容。手机仍保留原五项底栏及独立发帖路由，Home的Skyline配置与其他页面renderer不改；非PC或实际Skyline不尝试挂载原生editor。设置内部子页保留原路由。各内容首次访问懒挂载、随后保留实例，发帖切走或页面隐藏时停用输入/工具栏/迟到异步工作，但不清草稿；账号修订阻止旧任务跨账号写入或提交，不迁移草稿存储协议。2026-11-12的PC左栏 `Taro.redirectTo` 试验收到用户“按钮都点不动”的实测反馈；当前源码与dist仍为该试验，不将本次失败泛化为微信PC不支持该API。PC按钮目标为 `/pages/home/index?tab=对应内容`，实际WebView发帖目标为Home内容2、非WebView为独立发帖页。它只替换当前原生页，可能重建Home/Editor，不保证清除其他窗格历史；原native清栈及“未能关闭右侧页面”提示已退出。恢复Home本地切换的方案尚未实施，按用户最新要求暂缓，先处理相关主题缺失。现有草稿保存、账号与发布保护保持，不主动清缓存、私信数据、浏览记录存储或发帖草稿；手机与非PC宽屏入口保持原本地内容切换/独立发帖路由。Home的框架实例tid→所属page root native ctx仍用于非PC几何测量，不使用全局Current.page猜所属页面。内部详情导航及原生Tab/switchTab候选均未实施，边栏故障和右侧历史清理仍未解决。仅实际显示左栏时隐藏“我的”页原设置按钮（含未登录/加载/错误与资料就绪分支），无左栏或手机底栏模式保留原入口。只渲染当前模式的一侧导航，选中状态与未读标记保持；PC发帖/设置当前仍为上述redirectTo试验，手机发帖动作保持原路由。头像固定32px，初始使用本地默认图，复用“我的”页既有请求及后台刷新加载的当前账号头像；通过局部UI回调传递，发布绑定原请求的账号与回调修订，账号变化清回默认，旧账号或A→B→A前的晚响应不能覆盖新导航。不为导航额外请求用户资料，也不新增API缓存键或公共头像存储。桌面首页列表、发现与消息通过所属页面的剩余flex空间分配高度；详情卡片、头像、标签、评论工具栏、消息入口/通知卡片与发现横幅/排行行均采用紧凑像素尺寸，不使用整块显示器宽度放大控件。窗口布局测量不修改草稿或缓存。

共享帖子列表把分页加载提示放在永久 `topicListLoadingHost` 内：加载开始/结束只更新这个宿主的子节点，避免删除ScrollView的直接兄弟节点时由Taro重新下发包含滚动容器的整块子树。空宿主无margin/padding或固定高度；普通分页不设置scrollTop、不换列表key，主动刷新返回顶部的行为保留。安装版Taro reconciler与DOM的合成payload回归不等于真实微信的滚动位置验收。

帖子详情通过页面内 `useRelatedTopicsRail` 捕获所属 native page，测量页面根节点与真实滚动区域的交集：桌面可用宽度达到1156px时，相关主题在右侧336px悬浮列独立滚动（相对原280px增加20%），正文流预留356px并限制在实际交集内；PC窄窗格、手机或无法可靠测量时，相关主题应在文末正常展示；此前将手机缺失反馈误解为隐藏需求的desktop-only门控已撤除。相关主题只有一个组件和数据实例，不额外请求，也不通过换key重挂正文/评论编辑器；手机与非PC客户端使用普通View承载文末列表，由详情页统一滚动，避免为不滚动的内容嵌套ScrollView及其auto高度/裁剪风险。PC客户端在组件生命周期内保留同一ScrollView宿主，窄窗格文末与宽窗格浮栏切换不重挂相关列表；浮栏模式独立滚动。相关数组仍由原详情接口返回，不修改API或缓存契约。正文 `HtmlRender.imageLayoutKey` 只在局部列布局切换后使图片重测，不改变HTML或presentation token；窗口及页面生命周期的旧测量结果不会覆盖新布局。桌面首帧先隐藏仍挂载且可测量的正文流与相关列，并在实际滚动区的永久absolute宿主显示加载提示，待所属区域测量完成后一次发布布局与可见状态，避免先文末再右栏的可见切换。数据就绪后的显式测量最多等待300ms，失败或缺回调回退文末并失效同次晚到的回调；手机立即展示正文、评论与文末相关主题，无测量等待。此首帧与交互门控仍须真实微信验收。

官方[分栏模式](https://developers.weixin.qq.com/miniprogram/dev/framework/view/frameset.html)明确支持Windows微信3.3+；Mac的[可调整窗口](https://developers.weixin.qq.com/miniprogram/dev/framework/view/resizable.html)支持不能等同于原生分栏支持。源码与构建产物启用配置、Sass或合成组件测试均不代替真实微信的窗口调整、双栏导航、滚动与键盘验收。相关主题悬浮列在嵌套ScrollView/PullDownRefresh中的fixed裁剪、Skyline独立滚动与inline自动高度、首屏visibility与输入门控，以及首页左侧Tab在Windows frameset收放时的实际排布、滚动和组件状态保留，仍待真实微信验证。此前开发者工具1032px首页仅只读确认过旧112px左栏、left为0；本次56px独立左栏、标题右置、私信/设置/PC发帖的Home内内容Tab切换、左栏恢复本地切换后的实际点击和内容可见性、未解决的右侧原生历史清理、发帖工具栏在内容列内的定位与草稿保留、底部文字发帖/设置/头像、Me设置入口随模式切换及账号切换仍需实际宽屏验收，旧单实例几何证据不等于新布局或Windows/Mac真机、frameset动态验收。

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
