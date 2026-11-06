# 用户需求 TODO

更新时间：2026-11-06。此清单由主 agent 维护，不是自动 hook；没有修改 harness 设置或权限。

## 跟踪约定

- 每条新的修改需求先记录 TODO，再分配或实现；一条消息包含多个需求时分别建项。
- 同一问题的追加修正保留在对应项里，以最新要求为准，避免旧方案覆盖新要求。
- 状态明确区分：待处理、实现中、待集成验证、阻塞、代码与检查完成。
- 发消息给 agent、watch 编译成功均不等于需求完成。完成项必须有实现与验证证据。
- UI 源码和 UI 测试由同一个 UI agent 负责，主 agent 负责公共基础设施和集成验证。已被用户停止的 agent 不重启。
- 未进行真实微信工具或真机验收时明确保留验收缺口。保留草稿和账号隔离；不发布论坛内容、不清数据，不自动提交或推送。2026-11-06用户明确要求“推一下代码”“推到 main”，已授权本轮代码提交并正常推送至origin/main；下文早前暂停/禁止commit或push记录不再限制这次授权，但其他真实数据与原生操作限制不变。

## 当前待办

- [x] **T01 · 代码与检查完成｜私信列表不要展示多个“加载中”**
  - 用户原话：“私信列表你怎么展示那么多加载中干嘛”。
  - 已修复无内容时中央 Loading 与 busy 页脚同时出现，以及原生下拉 spinner 叠 busy 页脚。
  - 首次中央至多一个；已有内容第一页刷新不放页脚；真正分页才放一个底部反馈；原生下拉不叠页脚。
  - 真实请求、防重、失败重试及账号/权限保护保持；主 agent 私信集成 7 个 suite 共 111/111，两包产物 30/30，git diff --check 通过。
  - 有限 scratch runner 验证，不是完整 Vitest；真实微信视觉验收未完成。

- [x] **T02 · 代码与检查完成｜私信列表与会话支持原生下拉刷新**
  - 同一 UI agent 实现；主 agent 私信集成 7 个 suite 共 111/111，两包产物 30/30。
  - 已确认两页编译产物使用公共 refresher hook 并将 props 展开到原生 ScrollView。初次按单页搜索回调字段误报缺失，随后确认公共 hook 实际位于 common.js，跨 chunk 验证通过。
  - 有限 scratch runner 验证，完整 Vitest 启动与真实微信下拉手感验收仍有缺口。
  - 列表同时刷新两个 bucket 第一页；会话只刷新选中的 CID；compose 发现已有会话时等待其读取完成。
  - 刷新绑定真实请求完成，不调用会清状态的 store.hide，不清草稿/选择，不自动 send/accept。
  - 成功、失败、拒绝刷新、账号变化、hide 均应停止 spinner；保留并发与过期响应保护。

- [x] **T03 · 代码与检查完成｜帖子详情顶部偶发偏蓝背景**
  - 已移除 worklet 硬编码深蓝 RGB 与该页 surface-soft 背景梯度。
  - 修复限定在帖子详情：背景与 Navbar/worklet 使用当前主题页面背景，主题变化同步；保留滚动、透明度、模糊与分享行为，不全局替换品牌色。
  - 主 agent 2 个 suite 共 63/63，涵盖明暗、滚动进度、主题切换、缺失 worklet 与默认 Navbar；编译产物确认 theme-bg 和当前 palette，旧 RGB 已不存在；diff --check 通过。
  - 未完成真实微信视觉验收。该页图片相关改动仍为中间态，不能将 T05 一并计为完成。

- [x] **T04 · 代码与检查完成｜个人信息编辑页底部安全距离和按钮样式**
  - 已借鉴帖子预览动作区：26rpx 普通间距叠加 safe area；80rpx 高、44rpx 圆角；刷新/保存按钮 1:2，保存品牌渐变与轻阴影。
  - 保存 loading/disabled、API 与草稿保护保持，不把资料页改成弹窗。
  - 主 agent UI/state 共 23/23，原生编译产物确认 safe inset/按钮样式/canSave guard，diff --check 通过。初次产物 CSS 检查错误匹配到合并按钮规则，随后按主按钮独立规则检查通过，没有修改生产代码掩盖。
  - 有限 runner 验证；真实微信视觉验收未完成。

- [x] **T05 · 代码与检查完成｜帖子正文图片溢出、左右不对称**
  - 使用实际滚动 viewport 与父内容 rect，扣除 padding/border，以 flex 与实测中心差对齐，不使用 window 原点推算负 margin。
  - 宽幅大图占满有效 viewport；小图不放大；长图按宽度与 60% 窗口高度等比例限高；测量不可用退回 contained，挂载/加载/window resize 重算，无定时器。
  - 主 agent 图片 19/19；连同 HTML/Skyline/Navbar/包边界 6 个 suite 131/131。补充不对称边框、缺失/无效视口、过期响应、评论与贴纸隔离均通过；最新视觉 guard 加图片复跑 49/49。
  - 两包产物 30/30、图片/表单编译产物 13/13；初次缺失图标 barrel 的加载失败已解决并真实重跑，没有计入通过。
  - 有限 scratch runner 验证，真实 Skyline/WebView 视觉验收未完成；非 window resize 的外部容器宽度变化无自动观察，当前详情横向布局固定随窗口变化。

- [x] **T06 · 代码与检查完成｜GzkUi 标准表单控件库并替换应用控件**
  - 已抽取受控 Input/Textarea，增加原生表单别名、FormField、Select；应用标准控件已迁移，AST 检查无遗漏，Editor 保持专用。
  - 原生别名保持组件身份与事件、ref、openType，不增加包装布局或事件转换；选择器验证 native index 后仅回传实际 API 值。
  - 主 agent 库/表单/caret 44/44、资料 UI/state 24/24；合并图标及消费者 11 个 suite 107/107，纯包边界纳入 131/131 集成。
  - 独立资产声明归库，根类型只 reference；GzkUi 生产源独立 ES2019/DOM/React 编译 0 诊断，不依赖应用声明。完整应用在此阶段 baseline 142/current 142/new 0。
  - 两包产物 30/30、UI 产物 13/13；有限 runner 验证，未完成真实微信视觉验收。
  - 负责人：UI agent；package/config/锁文件与集成：主 agent。

- [x] **T07 · 代码与检查完成｜图标统一收敛到 GzkUi，合并相同语义图标**
  - 70 个通用资产经 home/nav-home 去重为 69 个独立 SVG，24 个应用消费者已迁移；语义 raw 与静态 URL barrel 独立，不相互加载。
  - plus 统一线条并保留消费者圆/方形边界；私信用 Envelope，通知用 Bell；保留有意义的 active/outline/filled/彩色变体，Star 与 Heart 不合并。
  - 应用仅保留 5 个场景插画/默认头像/微信标识 SVG，无库到应用反向依赖。
  - 主 agent 图标 8/8、表单/图标/消费者 107/107；经 HEAD 对照迁移的 4 个视觉 guard suite 30/30 独立通过，未倒退生产视觉迁就旧断言。
  - 两包 30/30、UI 编译产物 13/13，diff --check 通过；真实微信视觉验收未完成。

- [ ] **T08 · 部分代码与检查完成（切回键盘仍有缺口）｜发帖共享评论表情面板，切表情时收起输入法**
  - 同一 UI agent 已复用实际评论面板；用户2026-11-06最新明确选择“切表情时收起输入法”，覆盖此前共存选择，不另造近似面板。历史共存代码/检查记录仅表示先前方案，不计最新要求完成。真实微信验收缺口统一保留在T11。
  - [x] **T08a · 代码与检查完成｜表情面板打开时保留原工具栏**：仅将表情按钮切换为键盘按钮，在工具栏下方展示共享面板；native blur 与迟到 keyboard-close 后仍保留。早前主165/165为阶段检查，最新共存验证见T08b。
  - [ ] **T08b · 切表情收键盘代码与检查完成，切回键盘仍有能力缺口｜保留工具栏与富文本草稿**：用户最新反馈“切换到表情的时候直接不收起输入法啊”，并通过选项明确选择“切表情时收起输入法”，覆盖此前“保留富文本，键盘共存”。同一UI agent窄修已冻结并通过主独立检查：打开表情请求hideKeyboard，不保留键盘与面板叠放，工具栏与表情保留，草稿/附件/格式/选区及生命周期保护不回退。点键盘图标关闭面板；原生Editor无法公开主动唤起的限制仍未解决，因此整项仍不勾选，不能假称输入法已唤起。无textarea迁移授权，被中断的提交/push暂不执行。
  - 历史共存方案曾代码/检查完成：打开表情保键盘、面板位于键盘上方；以下136/123/类型/产物证据仅为此前方案，不代表本次收键盘修正交付。最新实现与独立检查须另记。
  - 原生Editor无公开focus/showKeyboard；catchtouchend仅保焦、get/setSelection不承诺键盘。最新修正只明确切表情时请求hideKeyboard，不伪造keyboard-height=0/focus证据，hide失败不清数据或改新panel状态；关闭面板不是隐藏后主动唤起，T08b切回键盘仍有能力缺口。禁止空insertText、readOnly切换、重写全文及透明Editor↔textarea往返。由同一UI agent拥有页面/native交互/UI测试；API与草稿结构不改。
  - 最新最小契约已与UI协调：表情面板bottom=0，toolbar在面板上方，正文占位toolbar+max(真实keyboardHeight,panelHeight)而非两者叠加；面板cap不为共存扣真实键盘高度，仍保同批body/probe平移与过期回调保护。待hide期间与失败仍如实接收高度，不靠乐观高度隐藏真实状态；shared/native/API文件不改。源模式只撤销其受支持focus请求，不能用不支持的native focus/blur技巧。已冻结TopicEditor.tsx/.scss与topicEditor.test/topicEditorScrollbar.test四文件，shared/native/API/T16/T17不改；hide迟缓/失败时系统键盘仍可能遮挡面板，此为真实失败状态，不靠假height或Toast掩盖。
  - 最新收键盘修正主独立四suite141/141、0load，新增5项覆盖hide reject/throw、迟到resolve/reject跨新panel/collapse/账号/hide/unmount、source focus撤销；旧136项保留并迁新替换契约。相邻七suite123/123、0load（重叠不相加）；类型baseline142/current142/new0、GzkUi独立0；生产build成功5.39s，压缩无关实际产物23/23、两包30/30、分享注册2/2、文字色4/4、diff --check通过。日志emoji-keyboard-dismiss-final-main-1106.txt、types-emoji-keyboard-dismiss-main-1106.txt、build-emoji-keyboard-dismiss-main-1106.txt；scratch产物检查按新emoji-open+Collapse+preview三合法hide调用更新并验证真实bottom0，未改生产迎合旧共存断言。有限runner不是完整Vitest，未做真实微信/真机键盘或视觉验收；切回键盘主动唤起仍未完成。
  - 历史共存实现（不是最新目标）：TopicEditor独立真实键盘高度/表情高度，打开表情不hide、不乐观lastHeight，真实height=0同样更新；面板最多300px并按可用空间封顶，尽量保留72px正文空间，极小空间允许面板降到0，安全区/占位各一次。shared ComposerEmojiPanel可选tab/sticker捕获槽仅topic使用，评论默认保持；所有表情点击控件复用native captureOnly，不吞整panel滚动。tab/sticker host分别匹配14.91×1.4px与112rpx原内容尺寸；合成尺寸检查不冒充原生像素验收。
  - 同批query测body/probe，body布局坐标仅加baselineTop-currentProbeTop实测平移，不把纯resize inset当translation。已补实际pan/resize、宽度/基线/新query/账号/hide/unmount/disabled旧回调隔离、旧panel tab/sticker/emoji/关闭回调隔离与零面板安全区；公共keyboardDockPosition未改。
  - 主最终独立四suite136/136、0load，相邻七suite123/123、0load（两组重叠不相加）；真实height多轮共存/关闭、native完成点击一次/move/cancel、草稿附件与发布预览保护覆盖。生产build成功5.43s；压缩无关实际产物23/23、两包30/30、分享注册2/2、文字色4/4、diff --check通过。有限scratch runner不是完整Vitest或原生验收。
  - 最终类型曾baseline142/current143/new1：exec mock返回void，首次return SelectorQuery仍不符合安装版Taro声明。UI按真实NodesRef签名补完整typed fixture，无any cast或生产改动；主最终baseline142/current142/new0，GzkUi独立0，日志types-keyboard-coexist-nodesref-main-1106.txt与keyboard-coexist-nodesref-main-1106.txt。保留现有142项应用诊断，不称全项目类型全过。
  - 产物检查首次22/23失败为helper误认为整createTopic bundle只有一个hideKeyboard；实际Collapse与预览准备各有合法调用。主仅修scratch，按AST实际Collapse控制绑定及预览handler识别后23/23；未删除生产合法调用。未刷新/导航模拟器、覆盖草稿或执行真实发布/保存/上传。
  - [x] **T08c · 代码与检查完成｜“+”改收起图标并关闭工具栏与输入法**：已使用共享 Collapse，点击关闭工具栏/面板并调用 hideKeyboard，保留草稿与附件；延迟 focus/keyboard 回调及旧 emoji/sticker 回调不能重开或修改草稿。hideKeyboard 拒绝时不清数据、不重开 UI；真实微信输入法收起验收未完成。
  - [x] **T08d · 代码与检查完成｜工具按钮靠左，标题按钮上方展开 H2/H3**：72rpx 固定按钮靠左，收起尾部 auto；标题在加粗左侧，上方 H2/H3 菜单通过 native format('header','h2'/'h3') 设置选区，同级可恢复正文，不重写全文、不新增 H1。菜单关闭/账号/disabled/hide 保护与两张新语义图标均已验证，当前 71 个独立 SVG。
  - 应用级 ComposerEmojiPanel 与独立 Sass 唯一拥有 tabs、数据、8 列 emoji/5 列贴纸和单元外观；usage/storage、keyboard、附件由消费者保留。
  - Topic 原生控件仅增加可选 captureOnly slot，复用现有 native capture 保持 Editor 选区；emoji insertText，贴纸仍放正文上方附件，不作为正文原生图片插入。
  - 原生组件文件归 UI agent，根 JSX 可选属性由主 agent 负责。共享面板阶段 165/165；最新 toolbar/Heading/native/icon/title 6 suite 主独立 98/98，发布及相邻评论/键盘/scrollbar 6 suite 101/101（组有重叠，不相加）；编译 toolbar/capture/menu/hide 21/21，两包 30/30，diff --check 通过。类型 baseline 142/current 142/new 0，库独立 0；这些早前检查不覆盖最新“切表情时收输入法”修正，T08b已重开实现与检查，原生验收仍未完成；工具栏重复显示回归另见T13。
  - createTopicRichFlow 旧 renderer mock/TopicTitle 及 preview/clear/typeTag 边界已与 HEAD 对照，仅修测试而保留 HTML、快照、账号、锁定结果断言；11/11 主独立复跑通过，不代表真实发布验收。首次集成使用不存在的 editorShortcuts.test.ts 文件中止，未计成功，改实际 keyboardDockPosition 等文件后完整 101/101。

- [x] **T09 · 代码与检查完成｜个人编辑页 label 与控件同一行，“选择”改右箭头**
  - 11 行表单已用 GzkFormField/GzkSelect：标签同行，多行顶部对齐，语义右箭头；保留实际 Picker 值验证和原生行为。
  - 主 agent 资料 UI/state 24/24、表单选择器回归及完整控件迁移通过；编译产物确认 FormField/Select 样式在资料本地 chunk 内。
  - 有限 runner 验证；真实微信布局验收未完成。

- [ ] **T10 · 阻塞（指定页面只读研究完成）｜个人信息编辑页支持修改头像**
  - 用户最新提供接口研究页面：https://www.guozaoke.com/setting/avatar；同一 API agent 已只读研究：WebFetch转换为空，无凭据GET为HTTP200/text-html/gzip，标准解码后未取得可用form/input/script结构，不能分类为登录页或挑战页，也不能将页面URL推断为POST action。已停止请求，不绕过、不猜接口；需要删除所有值/身份/凭据的表单结构或正式服务端协议。没有上传头像、保存资料、读取真实Cookie或持久化响应，无生产代码/API版本改动。
  - 用户此前要求：“个人信息编辑页支持修改头像”；合并既有微信原生 chooseAvatar 需求，不遗漏、不重复假交付。
  - 现有 API agent 只读重新核查完成：资料 /setting 仅支持九个文本字段，现有图床上传不是论坛头像保存接口；无头像 endpoint/action、method/enctype、file field、专属 CSRF、成功回读证据。仍需脱敏头像表单或服务端协议，不能安全落地 API/cache/调用迁移。
  - 需要脱敏 endpoint/action、method/enctype、file field、CSRF 契约与成功回读证据。
  - 不虚构接口，不把临时 wxfile 路径当成已保存头像；不执行真实资料保存验收。
  - 负责人：现有 API agent 与 UI agent，获得契约后协调。

- [ ] **T11 · 原生验收阻塞｜GzkUi 最终集成与原生验收缺口**
  - 用户最新“继续”：已核实际安装wechatide v0.3.11与当前工具参数；仅执行当前page类型布尔查询（无正文/路由参数/身份输出），失败MCP_TOOL_ERROR：timeout waiting for automator response。未刷新、重开、导航、截图、读网络/缓存正文、改草稿/存储或真实保存/上传/发布；没有原生验收通过证据。停止自动重试，保留当前调试状态。T08b历史共存后已按最新选择完成切表情收输入法窄修与主独立141/141、相邻123/123及构建/类型/产物检查；切回键盘主动唤起仍有能力缺口，真实原生仍未验收，不能沿用合成检查冒充完成；T10仍缺头像协议，不擅自真实保存。
  - T05/T06/T07/T09 阶段独立集成：图片/layout/boundary 131/131；表单/图标/消费者 107/107；视觉迁移加图片复跑 49/49。这些组有重叠，不相加宣传总数。
  - 图标/表单阶段新增 ReactNode 与 nullable 类型问题已真实修复：应用 baseline 142/current 142/new 0，GzkUi 独立生产源 ES2019/DOM/React 环境 0 诊断；保留现有 142 个应用诊断，不称完整应用类型全过。
  - 两包产物 30/30、UI 产物 13/13、diff --check 通过；FormField/Select 样式位于 profile 本地 chunk，初次按 common 单 chunk 的误报已确认并改检查，不改生产掩盖。
  - 有限 runner 已补 afterAll/env/native-global 桥接，Navbar 8/8、shared Skyline 36/36；旧断言与 HEAD 对照后仅迁移测试，不为测试回退生产。
  - 私信最终 7 个 suite 128/128，原生下拉、多个加载提示、账号与会话隔离、draft/send/accept 保护均通过；仅合成数据与有限 runner。
  - T08早前收起/H2H3/native/icon/title主独立98/98，发布及相邻101/101；最新T08b富文本键盘共存主独立四suite136/136、相邻七suite123/123、0load（各组重叠不相加）。生产build5.43s、产物23/23、两包30/30、分享2/2、文字色4/4、diffcheck通过；最终类型baseline142/current142/new0、库独立0。真实微信键盘共存、native捕获控件尺寸与图片/文本几何仍未验收，不把保焦或收面板声称为隐藏后主动唤起。
  - 补充 emoji/压缩策略回归旧 toast 9 项失败已按 HEAD test-only 迁移并纳入 165/165；1920 限高、错误、输出实际测量与原图保护仍覆盖。
  - createTopicRichFlow 旧 renderer mock/TopicTitle/preview/clear selector 已按 HEAD test-only 修正，主独立 11/11（纳入 101/101），没有执行真实帖子发布。T12 骨架/高度动画已独立图片与布局5suite142/142、骨架编译12/12，类型baseline142/current142/new0；真实原生动画验收仍未完成。
  - 普通 Vitest 启动仍受 Vite ./module-runner exports 不兼容阻塞，不升级依赖掩盖；上述有限 scratch runner 不称为完整 Vitest。
  - 真实微信/Skyline/WebView/真机布局验收尚未完成，不以普通浏览器替代。

- [x] **T12 · 代码与检查完成｜帖子图片测量期间骨架屏，高度动画过渡到真实图片**
  - 用户原话：“帖子页计算图片展示大小的时候会有很大的跳动，在计算完成的时候展示图片骨架屏，然后通过高度动画过渡到真实图标”。按上下文以正文真实图片为目标。
  - 测量/加载期间展示主题适配骨架占位；尺寸就绪后平滑过渡容器高度并显示真实图片，避免先露出原始尺寸再突然缩放。
  - 同一 UI agent 已定位 load-before-effect 的 300px 临时尺寸与随后实测的二次跳动；实现仅针对真实帖子 fullBleedImages，预解析展示标记不授予测量/账号权限，实际权限继续由 mounted-root WeakMap 控制。容器过渡高度、图片 aspectFit 淡入，resize 保留旧图至新尺寸就绪；原生平滑效果仍需验收。
  - 保留 T05 实测 viewport 居中、宽幅有效满宽、长图等比例限高、小图不放大与失败 contained 回退；不影响评论、贴纸、预览及账号/过期响应隔离。
  - 负责人：现有 UI agent；主 agent 独立图片/布局/边界 5 suite 142/142（图片31项）；骨架编译12/12、原UI编译13/13、两包30/30、首页/帖子原生分享注册2/2、diff --check通过。应用类型baseline142/current142/new0，库独立0；有限runner不是完整Vitest。
  - 首次骨架180px，实测后容器height 220ms、图片opacity 140ms；容器裁剪仅限自身已实测图框，宽幅图框保持有效满宽，不覆盖上下正文。失败回退无负margin，resize保旧图；正文/代码示例保留，预展示token一次消费且最多32个无数据flag。
  - 首次compiled骨架11/12失败为helper未匹配新增current guard，已检查真实代码后修helper并复跑12/12；旧sharing checker误要求首页class静态flag，已核真实prototype方法及native注册后修checker，未改生产。
  - 真实微信/Skyline/WebView/真机动画与视觉验收未完成；此完成仅表示代码与检查，不声称真实平台高度过渡已验收。

- [x] **T13 · 代码与检查完成｜发帖工具栏展示一次后无法再次显示**
  - 用户原话：“怎么工具栏展示一次就不会再展示了”；补充：“发帖编辑器的，消失一次 再次点击输入框不会再唤起了”。这是新的实际反馈，不由早前 T08 合成检查代替验收。
  - 检查收起后重新触摸正文、原生 focus/blur、标题切换及页面 hide/show 的完整事件链；修复可重复重新打开工具栏，同时保留账号、disabled、草稿和迟到回调保护。
  - 负责人：复用现有 UI agent；主 agent 负责集成验证与本条状态。当前代码根因链已双方核查：dismiss 清掉 bodyFocused，native canFocus=false 时 fresh touch 仅释放闭锁而不恢复展示，若 Editor 内部焦点不变则没有第二个 focus。未声称已观察真机事件。
  - UI 已冻结 TopicEditor/RichTopicBody 与对应测试：有效的正文 completed tap 独立恢复展示，不冒充原生 focus/keyboard；保留 move/cancel、未就绪、disabled、账号、hide/title/blur 与旧 panel generation 隔离。主独立7suite155/155（含T14与发布等相邻测试），原生保留焦点连续3轮关闭→重新点击不人工补 onFocus；评论/键盘/滚动/标题4suite59/59。类型baseline142/current142/new0，库独立0，diff --check通过。生产构建成功、压缩无关AST产物14/14、两包30/30、原生分享注册2/2；真实微信/真机仍未验收。
  - 工具栏重新显示与 T08b 原生键盘主动唤起是不同问题，不将前者修复冒充后者完成；不操作模拟器当前草稿。

- [x] **T14 · 代码与检查完成｜“评论回复”文案去掉蓝色，与“私信”颜色一致**
  - 用户原话：“评论回复 这个文案不要是 蓝色的 跟私信一样颜色”。对照实际“私信”同类入口/文案使用相同主题文字色，不硬编码浅色或暗色颜色。
  - UI 已冻结通知样式与privateHub窄回归：实际“评论回复”与“私信”共用messageHubCategoryLabel的primary token，去掉active label专属accent，图标/正文链接accent不变，API与交互不变。主独立privateHub23/23（纳入T13七suite155/155），亮暗共用token断言与Sass实际编译通过；生产构建成功、文字色产物4/4通过，真实微信视觉未验收。

- [x] **T15 · 代码与检查完成｜私信列表缓存首屏、静默后台刷新、下拉强制刷新**
  - 用户原话：“私信列表后台自己刷新就行了 下拉强制刷新，首屏使用缓存，后台自动刷新 不要展示首屏的刷新中”。
  - 首屏立即使用当前账号合法缓存，自动刷新不展示首屏“刷新中”或替换已有列表；下拉走真正强制刷新并正确结束原生刷新指示。没有缓存时保留诚实的空态/失败/重试，不把尚未请求完成当成确认无会话。
  - 同一 API/UI agent 先协调缓存命中、后台完成回调、强制刷新、并发去重、过期响应与账号隔离契约；不新增无人触发的定时轮询，不放松 verified/permissionsFresh/send/accept 保护。
  - API agent 只读确认现 getMessageConversations 每次 cache:false/no-store 的真实 GET，Promise 等请求解析后 settle；无需新增 API SWR/force 参数、去重层或缓存版本变化，memory/file 策略、schema/TTL/容量保留。UI 与 API 明确沿用现契约，由列表展示状态与真实 request 生命周期区分缓存首屏、后台刷新和下拉。
  - API agent 现契约2suite94/94，主独立复跑同2suite94/94（不改生产/API/版本）。UI 冻结仅私信index与privateList.test：主独立列表/生命周期/状态/文件缓存/请求5suite118/118（list20项），UI/会话缓存/草稿/消息主页4suite85/85；类型baseline142/current142/new0，库独立0，diff --check通过。生产build成功（7.01s），两包30/30、文字色产物4/4、分享注册2/2；旧命名型compiled checker在minify下失败，NODE_ENV及--env development一次性构建也仍压缩，不将旧checker计通过。主改用解析真实emitted JS的压缩无关AST/checks14/14（仅scratch，未改生产迎合测试），验证native事件桥、共享面板、cache completed、实际flight scope/settle与刷新参数。有限runner/产物检查不等于完整Vitest或原生验收。
  - 已登录!ready首JSX空布局不Loading；沿既有授权effect同步恢复缓存，不提前render读取LRU/文件缓存，缓存可用后不等网络即可展示。未知/部分空缓存不显示新解释或假暂无；缓存[]已完成且静默。下拉first GET join真实Promise、分页settle后原账号/generation/uid有效才新first GET，失败/重入/旧scope结束均正确释放，不改共享cache/TTL/schema/版本或发送保护。

- [x] **T16 · 代码与检查完成｜帖子正文单行与空文本容器高度异常（52/78px）**
  - 用户截图与原话：“为什么这个高度这么高”；补充截图：“这个空文字行也这么高”。单行text约384×52，空文字行约384×78，padding/margin/border均0，内部含h5-br及换行/空白。同时检查图片前后无意义空白行与显式换行，不只降低单行高度。
  - 同一UI agent实际Taro parser合成诊断已核：br原节点无children，normalize仅追加一次\n；Text尾\n额外形成末空linebox，br-only N换行会产生N+1行。普通HTML源换行未折叠，one\n<br>two实际为one\n\ntwo；不是parser重复追加br。精确52/78像素仍未原生验收。
  - 窄修Skyline普通文本run空白/换行语义：折叠ASCII源码空白且保内联语义空格，修br-only/尾break多余末行，保显式连续br、空paragraph、nbsp与pre/code（含嵌套）；不改WebView、图片scope/token/测量/骨架、链接及预览。UI唯一负责HtmlRender与测试，主负责集成；不复制截图正文为fixture、不导出缓存HTML或操作真机草稿。
  - UI文本规范化已冻结；主最终独立4suite157/157、0load（包含新增15文本actual-parser cases与T17九项）。初次类型集成baseline142/current145/new3失败已窄修正确element类型收窄与测试节点类型，主最终baseline142/current142/new0，库独立0。生产build成功5.68s、压缩无关实际产物18/18、两包30/30、分享注册2/2、文字色4/4、diff --check通过。有限runner/产物不等于完整Vitest；真实原生52/78px高度仍未验收。

- [x] **T17 · 代码与检查完成｜帖子图片满宽越过实际内容视口（用户截图再次溢出）**
  - 用户截图与原话：“这个图片为什么溢出了”。图框横向到达外层两侧，超过正文深色内容区域；不能仅以早前满宽设计/合成测试通过否认实际反馈。
  - 同一 UI agent 顺序检查 mounted viewport/content rect、padding/border、host width/left/translate、受限祖先与原生裁剪；保留合法 viewport 满宽、长图比例、小图不放大及骨架过渡，不把所有图片退回固定宽度。
  - 已确认代码根因：显式viewport注册在外scrollContent，但正文卡片.main有16rpx水平margin与24rpx padding；满宽目标误取外滚动视口，计算可正确却越过正文卡片。授权最小修复为viewport移动到.main，继续扣padding/border，以实际正文content box为边界；不靠裁图掩错，不声称原生额外位移已实测。需实际page tree归属及外scroll/内card不对称insets下最终host左右边界回归。
  - UI已冻结最小page viewport归属改动与九项回归，不改HtmlRender缩放公式或增加裁剪。主独立4suite157/157、0load，验证actual page tree唯一main viewport、两renderer合成外scroll/内card不对称insets下host/图片双边界，以及小图/长图/四类受限祖先。类型baseline142/current142/new0、库0；生产build成功5.68s、产物18/18、两包30/30、分享2/2、diff --check通过。该组与T16重叠不相加；未真实微信/Skyline/WebView/真机布局与动画验收，受控query边界代数不冒充原生量测。

- [x] **T18 · 代码与检查完成（用户已更正目标）｜点击图片或收起按钮后，再次点击正文无法重新显示工具栏**
  - 用户先前称“点击图片，之后聚焦正文编辑就再也不能唤起输入法了”，追加“点击收起按钮之后也是”；最新明确更正：“我说错了 是图片／收起后无法重新唤起工具栏”。以工具栏恢复为唯一最新修复目标，不继续按原生键盘能力缺口解释，不替用户扩大键盘/Editor架构改造。与T13同类最新实际回归需重新检查，不用早前合成检查否认反馈。
  - 负责人：复用同一UI agent，按更正目标检查附件缩略图/选图入口/预览返回与Collapse到正文的touch/focus/blur链、dockVisible/toolsDismissed/bodyTapped/bodyFocused、原生点击转发与可点击正文区域；区分代码证据和未观察原生事件，不预先认定根因。
  - 更正后UI定位并经主只读实际dist/base.wxml核查：Editor仅bindtap/focus/blur等，没有bindtouchstart/move/cancel；现RichTopicBody把手势监听放Editor上，bodyTapStarted在真实模板路径不会置true，tap被handleBodyTap拒绝，无法解除toolsDismissed。旧mock直接调用不存在的Editor.onTouchStart掩盖产物缺事件。native View模板实际支持touchstart/cancel/tap/move；不是原生键盘限制，也无全局吞tap证据。
  - 已协调最小修复并进一步收窄：仅native Editor外包View承载手势桥；source MentionTextarea原受支持事件桥保留，不扩其popup target。不改Taro模板/config/node_modules/native按钮捕获；notice/recovery/mentions在桥外，bubble且不catch/stop、不重写内容或改focus。测试按实际模板Editor无start、View完整gesture来派发，覆盖重复图片blur/Collapse→body恢复及move/cancel/边界拒旧；不追加空白区layout猜修。UI已冻结RichTopicBody生产与相关测试，主实际产物确认View支持事件/Editor无unsupported touch与focus。最终四suite148/148、0load（含T18新增5与T20仅保护新增2），真实installed template/runtime hydrate确认ordinary nn0 bindmove非catch-view；两真实组件独立hook合成3轮Collapse/图片blur恢复实际dock、move/cancel不恢复且不吞事件，无人工Editor.start或第二focus。
  - 主初次类型baseline142/current143/new1（新测试addEventListener缺options）已按安装版真实签名补第三参数，最终baseline142/current142/new0、GzkUi独立0。生产build5.04s、压缩无关产物24/24、两包30/30、分享2/2、文字色4/4、diffcheck通过；日志toolbar-native-view-typefix-main-1106.txt及types-toolbar-native-view-typefix-main-1106.txt。有限runner不是完整Vitest，未真实微信/真机hit与交互验收；不把本项完成声称为T20滚动已修好。
  - 主相邻保护基线：native adapter/文档/发帖预览/评论照片/评论五suite125/125、0load，日志image-body-keyboard-adjacent-baseline-1106.txt；只为修前基线，不计T18修复通过。当前等待UI定位与冻结，未修改原生草稿或重启已停止agent。
  - 保留当前切表情收键盘要求、草稿/附件/格式/选区、账号与生命周期隔离；禁止重写全文、readOnly切换、空insertText或不支持的focus接口来强拉键盘。不导航/刷新模拟器或改真实草稿，不发布/上传/保存/commit/push；实现及独立验证待完成，真实微信验收缺口保留。

- [x] **T19 · 代码与检查完成｜恢复发帖正文与“发自小程序”之间的分割线**
  - 用户原话：“现在发帖正文和发自小程序之间没有分割线了”。检查提交来源尾注的序列化、实际hr解析与Skyline/WebView显示边界，恢复分割线，不删除或重复来源文案，不更改作者正文语义。
  - 负责人：同一UI agent排查来源footer/HTML renderer及相关UI测试；如涉及提交API参数或协议须先协调，不凭猜测改API。主负责TODO与独立集成；不真实发布帖子、读取真实正文/缓存HTML或操作模拟器草稿，保留T16文本与T17图片修复。
  - 主只读定点证据：createTopic/index.tsx的FROM_MINI只有来源paragraph，buildContent直接body+附件+FROM_MINI，当前与HEAD都未附加hr；HtmlRender现有.h5-hr主题样式仍在。不能把此缺线未经证据归因T16换行修复。已授权同一UI agent唯一负责页面footer assembly/UI回归，公共topicDocument/API无需修改；需核预览与提交相同内容及恰一次separator/source，保作者自有hr和附件位置。
  - 主正文保护基线：HTML图片/Skyline文本/详情视觉/正文展示四suite104/104、0load，日志attribution-separator-body-baseline-main-1106.txt；此为修前保护，未计T19通过。UI正补实际preview/confirmSubmit合成路径，API请求均mock，无真实发布。
  - UI冻结页面FROM_MINI前缀真实<hr>及3个实际handleSubmit/preview/confirmSubmit、2个actual-parser Skyline/WebView回归；不改HtmlRender生产/topicDocument/API。主最终两suite67/67、0load，核正文/附件→hr→来源、重复预览恰一次footer、作者原hr保留且成独立view。初次类型baseline142/current143/new1（新测试TaroNode.className）已正确instanceof TaroElement收窄，主最终baseline142/current142/new0、库独立0；生产build成功6.17s，实际压缩无关产物24/24、两包30/30、分享2/2、文字色4/4、diff --check通过。日志attribution-separator-typefix-main-1106.txt与types-attribution-separator-typefix-main-1106.txt；有限runner非完整Vitest，未真实发布或微信/真机视觉验收。

- [ ] **T20 · 排查中｜点击收起按钮后，正文输入区域无法滚动**
  - 用户原话：“而且点击收起按钮之后 输入框里面的内容也滚动不了”。与T18工具栏恢复分别验收；检查Collapse后的正文ScrollView/Editor滚动、height/scrollY/disabled/overlay状态和实际模板move事件，不用工具栏恢复或合成keyboard事件冒充滚动修好。
  - UI核actual模板：普通View nn0为bindtouchmove，catch-view nn8才catchtouchmove；安装runtime仅catchMove=true选择后者，新body target不得设置catchMove，需真实hydrate与模板断言验证。当前Collapse只hide/dismiss，无scrollY=false/scrollTop重置/disabled；dock/panel卸载、bodyAvailable扩大，暂未确认永久滚不动根因。新增scroll配置/回调保护不计真实滚动已修好。
  - 同一UI agent持续负责，T18新View手势桥不得catch/stop滑动，不重写正文/切readOnly/擅改native捕获。主相邻评论/事件/键盘/标题四suite53/53、0load为修前保护基线，不计T20交付。保草稿、附件、账号/lifecycle、最新表情替换要求。不真实编辑或清草稿、不刷新/导航模拟器、不发布/commit/push；代码与原生验收均未完成。

- [x] **T21 · 代码与检查完成｜输入法弹起时编辑器底部留白过大，正文可编辑高度过小**
  - 用户原话：“输入法弹起时，编辑器的下面有很大的 padding，导致输入高度极小”。追加用户真机截图：正文顶部越到状态栏/胶囊后，卡片底至键盘有大片页面空白，应用工具栏未显示，系统输入附件栏可见。仅记录几何/可见控件，不复制正文、导出图片或把截图像素等同client坐标。该证据不能仅归因24rpx padding；需核页面pan/resize、probe baseline未建立/不准、bodyAvailable及toolbar隐藏联动。
  - 用户最新拆分两项边界：①“编辑器背景色下面有留白”——背景底边外部空白；②“背景色内部 输入框滚动范围离下面也有 padding”——背景内正文scroll区域底边未到背景底边。两者分别建子验收点，不混为一个键盘inset：
    - [x] **T21a｜外部留白（代码与检查完成）**：bodyAvailable改用同client坐标rawBodyTop，消除正文未补偿pan但dock已补偿导致的重复translation留白；合成边界验证背景bottom到dock/keyboard仅保24rpx普通gap及舍入误差，不用内padding修复冒充外几何。
    - [x] **T21b｜内部留白（代码与检查完成）**：卡片底padding/min-height置0，保顶部/横向与外margin；实际scroll viewport bottom对齐background bottom，bodyContent可滚24rpx为唯一末行间距，实测height0不回退40vh。未按截图像素写死高度，真实平台边界验收仍缺。
  - 核真实keyboard/probe pan/resize坐标、bodyAvailable、dockHeight、安全区、bodyBottomGap/content padding及原生Editor实际尺寸，定位重复占位或留白，不未经证据归因单条CSS。
  - UI只读并主核代数定位T21a：RootPortal dock以bottom=-inset抵消pan，但正文DOM仍位移；bodyAvailable用rawTop+translation逆归一后少算一个translation，pan时实际bodyBottom到dockTop多留translation+普通gap，pure resize无此错。以同client坐标的effectiveBottom=probeBottom+inset减rawBodyTop/真实替换占位推height，不给正文加transform，不伪造baseline/keyboard。保同批query/stale/account保护及保守panel cap。
  - T21b已协调最小范围：editorSection底padding32rpx→0、min620rpx→0，保顶32rpx/横36rpx、外margin24rpx；动态body viewport唯一撑背景，背景内viewport底gap为0，bodyContent原可滚24rpx保留为唯一末行间距，外背景到dock普通24rpx一次。短测量height0必须真0而非fallback40vh；无量测可保CSS fallback，不按截图写死高度。UI唯一own TopicEditor/index.scss及对应测试实现中，主不并改。
  - 同一UI agent已冻结页面几何与UI测试；主独立编辑器四suite156/156、0load，新增8项覆盖pan/pure resize/首pan/无probe/短与窄viewport/零面板/实际卡片和末行边界；保同批query与stale guards、保守panel cap。最终类型baseline142/current142/new0、GzkUi独立0；生产build5.16s，压缩无关UI产物24/24、两包30/30、分享2/2、文字色4/4、diffcheck通过；实际emitted body height为raw client top差值、卡片bottom padding/min0及margin24已检查。日志editor-gap-final-prepush-main-1106.txt、types-final-profile-typefix-prepush-main-1106.txt、build-final-prepush-main-1106.txt。有限runner非完整Vitest，真机几何未验收，T20永久滚动故障仍未知，不将本项完成冒充T20解决。未改真实草稿、导航/刷新或真实发布。

- [x] **T22 · 代码与检查完成｜编辑资料“已保存”使用惯用弹窗，不做特化设计**
  - 用户原话：“编辑资料 已保存使用 惯用的弹窗啊 不要特化设计”。对照项目实际通用成功提示/原生弹窗模式复用，不新增资料专属成功卡片/定制弹层；只改成功反馈呈现，不改API、保存成功语义、失败处理、草稿和账号保护。
  - 同一UI agent复用ImageHostSettings现有Taro.showToast({title:'已保存',icon:'success'})；仅位于ProfileEditState已验证成功回调，保留ownProfileSettingsUpdated，移除profileEditorNotice专属节点/样式，不改state/API/cache/失败语义。主独立资料UI/state两suite31/31、0load，新增7项核一次成功/不重播、三类失败保draft/error、hide/account/reactivate迟到不通知。初次新增fixture返回可选Promise类型错误已按真实Promise签名窄修，主最终baseline142/current142/new0、库独立0；生产build5.16s，实际compiled原生success toast存在且专属host不存在。日志profile-standard-feedback-typefix-prepush-main-1106.txt；有限runner非完整Vitest，未真实保存或微信原生验收。

## 代码与检查完成（不等于真机视觉验收）

- [x] **D01｜私信头像回到标题栏，整个身份组居中，简短状态位于昵称下面**
  - 最新布局优先于早期“状态在头像下面”的要求；头像 52rpx，不移到页面外部头部。
  - Navbar opt-in autoHeight 与 balanced middle region，其他页面默认行为保持。
  - 私信相关集成 6 个 suite 共 100/100；两包产物检查 30/30；未完成真实微信视觉验收。

- [x] **D02｜私信长禁发说明显示在输入框内，保留草稿**
  - 空输入用 placeholder；已有草稿时说明位于输入体内，不替换/清除草稿。
  - 已纳入上述 100/100 私信回归。

- [x] **D03｜去掉会话刷新、缓存仅查看、正在查找记录的多余提示**
  - 删除可见文案及对应空卡片，不放松 verified/permissionsFresh/send/accept 保护。
  - 已纳入上述 100/100 私信回归；三个移除的提示在编译 JS 中均不存在。

- [x] **D04｜发帖编辑器底部预留安全距离**
  - 已增加 24rpx 普通间距并按场景叠加 safeBottom，正文内底 padding 24rpx。
  - 聚焦集成检查 58/58；未完成真机验收。

- [x] **D05｜GzkUi 第一阶段基础 workspace、主题、Loading/Tag/Icon 抽取**
  - 第一阶段生产编译通过，支持的回归 175 项通过；TypeScript 保持现有 142 诊断基线。
  - 不表示后续标准表单与图标收敛已完成；相关待办见 T06/T07/T11。

## 执行状态

- 2026-11-06用户授权“推一下代码”“推到 main”，随后要求编辑器高度最高优先，最新顺序明确“先推代码”。当前已验证代码先提交并正常推送origin/main，不强推；编辑器高度后续复查最高优先，真实键盘/几何未验收及T20滚动仍未知，推送不等于问题全解决。
- 最高优先高度后续复查：settled raw client height、实测0、卡片/scroll/dock边界暂无确认新永久缺陷；只读发现keyboard/resize事件先更新viewport而bodyTop/dockHeight等待异步同批测量的过渡窗口，旧bodyTop可能暂使正文缩小。现有settled合成检查未覆盖回调未返回时的渲染；后续优先补快照一致性/迟到测试与必要最小修复，不当作真机根因或已修好证据。本次push前文件保持冻结。
- 提交前主独立回归：编辑器156/156、GzkUi69/69、私信105/105、正文图片/文本/分割线/提交预览120/120、资料31/31，各组有重叠不相加；仅合成数据与有限scratch runner。最终类型baseline142/current142/new0、GzkUi独立0，生产build5.16s、UI产物24/24、包30/30、分享2/2、文字色4/4、diffcheck通过；标准yarn test仍ERR_PACKAGE_PATH_NOT_EXPORTED ./module-runner启动失败，不升级依赖。未进行论坛真实发布/保存/上传或原生验收；本地生成的.yarn/install-state.gz不纳入代码提交，保留工作区修改。
- WeChat watch build 已因后台运行时限被停止，相关日志监听已停止；当前未运行 watch。本轮实现与独立检查已完成，因此未自动重启。后续启动构建时不重复启动、不同时向相同 dist 运行 production build。
- 后续需求追加在本清单；主 agent 更新状态后再向用户汇报，不能只说“会改”。
