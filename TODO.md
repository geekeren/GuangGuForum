# 用户需求 TODO

更新时间：2026-11-12。此清单由主 agent 维护，不是自动 hook；没有修改 harness 设置或权限。

## 跟踪约定

- 每条新的修改需求先记录 TODO，再分配或实现；一条消息包含多个需求时分别建项。
- 同一问题的追加修正保留在对应项里，以最新要求为准，避免旧方案覆盖新要求。
- 状态明确区分：待处理、实现中、待集成验证、阻塞、代码与检查完成。
- 发消息给 agent、watch 编译成功均不等于需求完成。完成项必须有实现与验证证据。
- UI 源码和 UI 测试由同一个 UI agent 负责，主 agent 负责公共基础设施和集成验证。已被用户停止的 agent 不重启。
- 未进行真实微信工具或真机验收时明确保留验收缺口。保留草稿和账号隔离；不发布论坛内容、不清数据，不自动提交或推送。2026-11-06“推一下代码”“推到 main”的授权仅属于当时已完成的提交，不延伸到2026-11-12当前未提交修改；用户2026-11-12最新已授权“先 commit and push 一下代码”：仅提交并推送当前代码快照到新分支，不扩展为直推main或真实数据/原生操作授权。

## 当前待办

- [ ] **T59 · 暂缓，先提交当前代码｜发帖与评论框支持粘贴图片**
  - 用户最新2026-11-12明确“先 commit and push 一下代码”，授权本次当前代码快照的提交与推送；T59尚未实现，先冻结。官方editor明确粘贴仅纯文本、getClipboardData成功仅data:string、textarea文档无图片paste事件，不能把URL/选图冒充剪贴板图像。本次提交不声称包含该功能，T56边栏故障/T57iframe未解决项保持。当前在main，先建分支再commit/push，未授权直推main、真实用户数据或媒体操作。
  - 用户2026-11-12要求“发帖和评论框支持 粘贴图片”。明确分别支持原生发帖editor和评论输入框的图片粘贴，先核微信/Taro实际事件与剪贴板能力，不把粘贴图片URL/选图按钮冒充系统图片剪贴板。不主动读取用户真实剪贴板或上传；实现复用现图片附件上传、容量/账号/生命周期与失败重试保护，保正文文本和草稿，不重复上传或绕平台限制。若需API/上传返回契约变更先协调，不改缓存语义或停止中的T56/T57。

- [ ] **T57 · 用户暂停，输入已澄清｜iframe嵌入视频被展示成链接**
  - 用户随后明确“video 是个 iframe”：此次实际目标是iframe嵌入的视频，不是a[href]视频直链；此前直链/data-src扩展不能当作本需求解决。iframe src可能是第三方播放器页面而非媒体URL，不得直接传给原生video或破解隐藏源。后续若获继续授权，需按iframe提供方与小程序可用能力处理；若改变API缓存清洗/版本须先协调。当前不恢复已停agent、不进一步检查或构建。
  - 用户2026-11-12最新“不用看了”：已停止UI subagent与后续检查、修改和构建，保留工作区已有修改。停止通知报告已有视频直链/data-src展示修改，但主未完成集成复核，不能记作完成；当前dist未重建。未经用户新要求不恢复该agent或本项。
  - 用户2026-11-12补充“现在视频被展示成链接了”。已有video/src与source原生渲染；此次补HTML中a[href]视频直链识别，安全http(s)及路径视频扩展名判断，保留签名参数、普通链接/文案/图片预览，不将第三方播放页或iframe当可播放直链，不修改API/cache或获取平台隐藏媒体。同UI owner负责HtmlRender/media与合成回归，主集成/构建；格式、域名、手机/PC真实播放仍需微信验收。
  - 用户2026-11-12追加“支持一下视频播放，”；先核已有HtmlRender原生video/iframe转码/安全URL与UI尺寸/交互，按现有真实输入契约补缺口，不假定旧91704b3视频支持覆盖当前。UI owner负责组件与测试，若涉及HTML解析/API数据契约先协调，不擅改API缓存版本。不读取真实缓存HTML或导出视频，不真实请求/发布，微信原生播放验收缺口准确记录。
- [x] **T58 · 展示容器补丁与构建完成，微信实测待做｜相关主题应正常展示**
  - 同UI owner最终冻结4文件：撤误desktop-only门控；手机/非PC useState固定身份的普通View承载非空相关列表、随外层详情滚动，PC永久ScrollView保inline/wide宿主与keys。正文/评论/editor父链、336/356/1156/hook/样式、API/cache/Home/media均不改。新增ios/android/devtools在Skyline/WebView3行与25行非空列表、文末父链/ready/overlay/正文12评论/composer草稿保护；red3/6fail后UI三suite122/122。主最终五suite208/208（含既有图片/video）及reply/form84/84；TS213→213无新增/移除，lint有效基线detail17errors/3warnings、related组件/两tests0，诊断多重集无新增/移除；tsc exit2/eslint exit1不称全绿。临时compile-cache resolver3错误未作为合法基线，首次比较误将同baseline重复输入的removed20已纠正为removed0，未改生产迁就。
  - 主唯一non-watch显式production构建4.96s成功；恢复展示+手机普通View/PCScrollView产物2/2，保原Home redirect/desktop AST/WXSS145/145，注册10/10。新产物checker先正确拒旧dist无普通View分支；最终首轮误查common.js而真实组件在page bundle，修scratch定位后2/2，未改生产。raw main1319977B/secondary56744B/HomeJS42913B、74文件，不含map/gzip。git diff --check通过。当前dist已包含相关主题容器补丁，Home仍redirect试验，T56恢复未实施，T57iframe停。撤误gate不证明旧dist缺失根因；此次容器补丁移除手机无必要嵌套滚动/auto-height裁剪风险，未真实微信/真机验证其实际高度与可见性，不称用户原问题已实测解决。标准Vitest仍既有module-runner启动阻塞，有限runner不代原生验收；未真实导航/请求/读取账号私信/发布/清存储草稿、commit/push。
  - 主阶段reply/form两suite84/84，TS213→213新增0；共享pageSharing旧mock缺subscribeCurrentAccount造成load fail，该三suite合并次整体exit1，未改无关Home/测试迁就。已核API relatingTopics按.hot-topics .cell .ui-content抽取，无手机条件，未证实API缺口；不修改API/cache。旧dist未包含错误desktop-only门控，撤误改本身不证明修复用户原始缺失。UI继续手机普通View承载相关列表，真PC永久ScrollView保窄/宽同宿主，移除手机无必要嵌套scroll/auto高度裁剪风险，真实根因及原生可见性待验证。
  - 用户最新2026-11-12要求“优先修复不展示相关主题的问题”。此前“手机上不展示相关主题了”是缺失展示反馈，主误解为隐藏需求；撤除本轮错误增加的desktop-only挂载门控，恢复手机文末相关主题、保留PC窄inline/宽rail布局，测试改为正常展示契约。暂停T56边栏实现与构建队列，先完成T58最小修复、集成与一次生产构建。原隐藏实现/测试通过不代表正确满足需求。
  - 下述为此前误解产生的错误方向，现撤销，不作为需求完成证据。同UI owner曾冻结仅topicDetail/index.tsx与topicDetailVisualContract.test.ts：真实PC判断门控相关主题；手机/非PC不挂，PC窄inline与宽336/356/1156保持。五suite204/204，TS213→213新增0，test lint0/detail既有17errors/3warnings；首轮scratch URL provider差异的1fail已用正确桥重跑通过，不改生产迁就。相关数据仍随原detail接口返回，不声称减少返回字段或清缓存。尚未主集成/重构建/真实微信验收。
  - 用户2026-11-12追加“手机上不展示相关主题了”，按手机端隐藏相关主题处理；保留桌面相关主题与窄窗格回退布局、详情正文/评论/编辑器行为，移动端不挂相关主题且避免为隐藏内容新增请求。不改API缓存协议或草稿，不以浏览器代微信验收；同UI owner负责详情/rail/tests，主公共基础设施/集成/构建。

- [ ] **T56 · 暂缓，先修T58；右侧历史清理未解决｜边栏所有按钮点不动**
  - 用户最新要求优先修复相关主题展示：本地切换恢复尚未实施，UI owner确认未修改Home；当前源码/dist仍为redirectTo试验。边栏诊断发现PC按钮完全依赖native替换、没有本地select，但不能证明native失效根因。暂停该实现与专属验证，不将README预写方案当已交付。
  - 用户追问“是不是 redirect to不行啊”。当前试验实测失败不等于官方API在PC一概不支持；安装Taro adapter正常Promise化，尚无真实失败分支证据。优先撤除边栏强制redirectTo依赖，恢复Home既有本地内容选择/实际WebView嵌入发帖及非WebView独立发帖，手机不变。不让原清栈或redirect失败再阻塞按钮，不擅自改nativeTab/reLaunch/迁移详情。不声称本地切换可清已打开右侧原生历史；该需求仍未解决，原生点击验收也待做。
  - 主阶段公共route/config/layout/旧未使用history四suite41/41、既有内容/草稿/editor六suite195/195、详情/desktop门控/图片/既有视频五suite204/204通过；分组可能重叠不累计唯一cases。新local-selection产物checker已正确拒绝旧redirect dist，尚未构建恢复版。公共native video模板测试因有限runner require声明冲突load fail，另三document/sanitizer/HTML72/72但该次整体exit1；未改生产/依赖迁就或声称全通过。视频实际iframe输入保持暂停，不将既有视频回归作为新iframe支持。
  - 用户2026-11-12反馈“现在边栏的按钮都点不动”。本次仅恢复同UI owner处理边栏故障，T57视频任务保持暂停。先区分点击事件受遮挡、redirectTo拒绝/不支持、目标Home参数丢失或所属page漂移，不凭现有mock通过称原生可用；优先恢复按钮可切换，不恢复已失败的清栈提示或擅自扩展nativeTab/内部导航架构。保留工作区/草稿与手机行为，主集成与构建，不真实导航/请求/清数据/提交推送。
  - 用户最新明确“先试一下 左侧边栏按钮 使用 redirect to”：仅试验PC左栏动作改原生redirectTo，不实施内部导航或native Tab注册；其他入口及手机保持。默认Home内容按钮跳Home?tab=对应值，PC实际WebView发帖保Home内容2，非WebView保独立发帖route；退出原native清栈检查/失败toast，不按route猜清全栈、不reLaunch/清storage。redirectTo只替换当前页，可能重建Home/Editor且不会清已有下层历史；这一试验不再承诺常驻实例和全栈清理，草稿保存协议/保护保持，真实PC结果待用户复核。UI owner最小页面及测试修改，主集成/构建；不真实导航、发布/上传/清草稿或提交推送。
  - 主公共route/config/layout/未使用旧history四suite41/41、既有draft/editor/附件/settings/private lifecycle六suite195/195通过；组间有重叠不累计唯一用例。新增redirect产物checker正确拒绝旧dist残留paneHistory，未覆原owner-history checker/失败证据；README已注明试验范围和重建/下层历史限制。UI生产已实现redirectTo目标，旧history依赖从Home退出，保tid几何；关键测试初始红18项后两suite86/86。主阶段八suite272/272，TS213→213 NEW0/REMOVED0，Home lint原30errors/1warning、两UI tests0，多重集无新增/移除。同UI owner最终冻结仅Home+两tests，十suite320/320（关键两suite90/90），补Windows/Mac全部入口/repeat、缺owner、zero栈检查/back、失败/unmounted迟到failure、ios/android/devtools不变；主最终八suite276/276，私信/头像相邻三suite40/40。最终完整TS213→213诊断多重集无新增/移除，lint同基线Home30errors/1warning、两tests0，无新增/移除，不称全TS/lint通过；git diff --check通过。唯一non-watch production构建5.27s成功，实际压缩AST/WXSS145/145、注册10/10（保原九+无nativeTab/新增page约束），当前dist含redirectTo试验；原始字节main1319859B/secondary56744B/HomeJS42913B，74文件，不含map/gzip。标准Vitest既有module-runner启动阻塞未修，有限installed Taro/React runner不等于标准Vitest或真实微信；不把mock redirect称原生替换/草稿实例保留验收。没有内部导航/Tab迁移、真实导航/账号联系人私信读取/上传/发布/清草稿或commit/push；T56保留未勾选直到用户PC实测。
  - 用户随后追问“不能充分利用微信路由吗”。按最新方向暂停Home内部详情/会话迁移；尚未修改UI或公共导航，仅只读审计。重新评估Home原生Tab锚点+switchTab清非Tab页面，详情/会话保native路由与生命周期；最少两Tab/主包注册、原生栏隐藏/frameset与手机布局、URL参数及已存在Home重选清栈仍需明确。此追问不是已批准具体nativeTab注册方案，不凭API一般描述称真实分栏已验证。主核官方route.html进一步明确：switchTab目标就是栈底Tab时，相当delta=页面总量减一navigateBack；当前Tab已栈顶则Nothing happened；Tab全应用最多同一实例。因此原生方案可保Home七内容，详情/会话仍navigateTo，不自造pane栈。官方custom-tabbar.html（2026-06-16）允许完全接管Tab渲染、Skyline需absolute/pointer-events适配；候选使用无额外可见栏的custom host及Home+复用设置内容的第二主包Tab壳，保原secondary独立设置路线，尚未实施。
  - 用户2026-11-12选择“建议第二种”：采用Home内部显式右侧导航，不再依赖native清栈；迁移PC详情/会话及同链嵌套入口，左栏任意项（含重复点击）直接清内部历史。保留56px rail、Home七保留内容/native Editor、草稿/账号/发送保护；手机原路由与独立页面保持。此授权为本地实现/测试/构建，不扩展真实数据操作或提交推送；先明确职责/导航及生命周期契约后实施。
  - 用户2026-11-12再次反馈“点击的时候还是未能关闭右侧页面”。前轮owner修复未解决用户实际问题，不把292/292或构建通过当完成；重新核PC frameset页面栈与导航作用域，必要时仅在此局部策略输出失败枚举/布尔状态，禁止真实页面参数/账号/正文/凭证输出。保留原生验收未完成，不重建Home、不清缓存或草稿。
  - 用户追加“你思考个其他方案吧”“搜索一下微信小程序的资料”“是不是左边栏的几个按钮用 redirectTo 就可以了”。此轮只读查官方并复用UI owner审计：frameset与Router正文只保证相对路径基准，不保证pageRouter.navigateBack指定右栏；redirectTo明确只关闭当前页，H→D→T重定向Home仍有H→D→H_new，不能清全栈/保同Editor。switchTab官方明确关闭所有非Tab且复用既有Tab实例，是候选但当前无native tabBar；至少2/最多5、Tab在主包、URL禁params，不能直接套七内容或secondary页，隐藏原生栏与同current Tab/PC分栏须验证。另一候选为PC详情/会话在Home内显式内容历史，不依赖native清栈，但需较大UI路由/lifecycle/event契约迁移。尚未实施或改变dist，不再凭猜测继续改owner。资料：官方frameset.html、reference/api/Router.html、framework/app-service/route.html、api/route/wx.redirectTo.html及wx.switchTab.html；API WebFetch多次仅菜单，改本地fetch+HTML正文选择器核实，无用户信息上传、真实数据或原生导航。
  - 用户2026-11-12实测反馈“未能关闭右侧页面 请重试”，撤回完成状态。当前清栈失败会阻止左栏切换；排查Taro/native getCurrentPages身份、captured Home owner与frameset pageRouter作用域，增加实际adapter差异回归后修复并重新构建。不以此前合成检查证明原生成功，不删缓存/草稿，不reLaunch重建Home。
  - 只读核安装Taro：React AppWrapper.mount异步forceUpdate才render，constructor读全局Current.page存在另页覆盖窗口；getCurrentPages直绑native，旧Home fixture整helper mock恒true，未覆盖此差异。尚无用户native失败分支实测，不能将该缺口称唯一根因。主helper允许所属owner resolver，按===/非空getPageId/含$taroTimestamp唯一实例path匹配唯一native栈成员、拒route-only/歧义；使用matched native router、exact delta，success先核栈，未同步只nextTick一次复核，不timer/polling。新21case红6fail→21/21，helper/tests lint0。同UI owner已冻结框架props.tid→所属root.ctx绑定，history与所有Home selector共用owner且query单次捕获；真实createPageConfig覆盖ctx晚赋，新增真实helper集成4case，rendererLayout69/69，TS213→213/新增0、lint无新增。主首轮集成183完成/182通过/1失败：旧homepageVisualContract仍断言query.in(this.ownerPage!)字符串，交同UI owner按单次捕获owner更新契约，不能改生产迁就。该旧契约已由同UI owner更新并freeze：单次const owner/fail-closed/query.in(owner)、tid/root.ctx及禁止借Current约束，85/85与test lint0，未改生产迁就。用户原生唯一失败分支仍未确认。
  - 主最终冻结后九suite292/292（rendererLayout69、history21及Home visual/settings/share/compose/editor/RichBody/attachments）；相邻三suite120/120与前组重叠、不累计唯一用例。完整TS213→213诊断多重集新增0/移除0，lint多重集新增0/移除0（Home既有30errors/1warning；helper及三tests均0），git diff --check通过；不称全项目TS/lint绿。唯一writer non-watch `yarn build:weapp --env production` 5.03s成功，实际压缩AST/WXSS144/144、renderer/native/share注册9/9；当前dist包含最新owner修复，无watch。显式production原始字节main1321547B/secondary56744B/HomeJS44601B，74文件，不含map、不用gzip。
  - 修正的是安装版Taro异步owner捕获与原生返回栈同步的已证实风险，尚未确认用户实际toast的唯一原因；故T56保留未勾选直到真实PC复核。标准Vitest既有module-runner启动阻塞未修，有限installed React/Taro合成runner与AST/WXSS不代替真实微信Windows/Mac/frameset验收；未真实导航/请求/读取账号联系人私信/上传/发布/清存储或草稿、commit/push。
  - 用户2026-11-12追加“能不能点击这些按钮的时候把 右边边栏的历史记录全清空了”。解释为PC frameset右侧原生页面导航栈（详情/会话等），不是缓存、浏览记录存储、私信数据或发帖草稿；点击左栏首页/发现/消息/私信/设置/发帖/头像应收起旧右侧历史并选择Home对应内容，包括重复点击当前项。不reLaunch Home或重挂常驻编辑器，不清storage/cache/草稿、不发请求；先核官方frameset路由与所属Home/page-stack能力，不能凭navigateBack默认值猜。UI owner负责左栏接线和测试，主负责公共栈策略/集成，手机动作保持；原生验收缺口准确记录。
  - 主新增desktopPaneHistory策略：严格captured Home owner在getCurrentPages中的identity，按其上页面数delta清栈，优先所属pageRouter，旧API安全回退；成功核owner栈顶，缺owner/失败不猜route或reLaunch，重复reset共享飞行、dispose使迟到回调无效。12/12合成单测和新增lint0；公共history/config/layout/package/length五suite40/40。UI子任务曾被服务额度中断，用户continue后复用同owner续做，未重置工作区。最终Home接线冻结：所有PC左栏动作经同策略，重复点击也清栈、同一back飞行后仅最新selection生效，返回show不以旧pageVisible挡操作，失败安全toast不切内容。T55集成缺陷补修并重新冻结后，最终build7.60s及产物检查通过（详T55）；真实Windows/Mac/frameset右栏清栈仍未验收，不以合成导航栈证明原生行为。

- [x] **T54 · 代码与检查完成｜左栏设置与消息同机制切换右侧内容，保留导航；原生验收待做**
  - 用户2026-11-12追加“点击设置和发帖的时候也是一样的”。左栏设置不navigateTo独立页面，而在Home右侧展示既有设置功能、左侧56px导航/footer不变并显示选中态；复用既有设置逻辑，普通手机/独立页面入口保持。不扩展到设置内部子页面路由，除非实施确有需要；UI owner实现/测试，主集成/文档，不改API/cache或清真实数据。
  - SettingsContent追加内容6，首次访问刷新stats/added，隐藏自己的Navbar/share注册以保Home所有权；active/page/account修订拒迟到theme/shortcut/modal回写，每可见生命周期独立ad实例拒旧reward授权。原独立设置wrapper及内部子页路由保留。新增真实content合成behavior10项及share layout2项通过，Home/footer/settings选中和100%边界产物通过；包含于T55最终回归，真实微信验收待做。
- [x] **T55 · 代码与检查完成｜左栏发帖与消息同机制切换右侧内容，保留草稿及发布保护；原生验收待做**
  - 同条追加要求：左栏发帖不navigateTo独立页面，而在Home右侧显示既有发帖编辑器与类型/工具栏，导航/footer不替换，显示选中态；首次访问懒挂载、切Tab保留草稿/实例、inactive停用原生输入和后台交互，保留提交/账号/上传保护。Home当前配置Skyline、独立发帖页为WebView原生editor，不能用伪编辑器或外部H5代替；用户已明确“PC 端才会这样，PC 端只会使用 webview”。保留手机Home Skyline配置，仅desktop身份&&所属PageRenderer实际webview时允许左栏发帖内容2，非PC/Skyline保持独立原发帖route且不挂editor；不新增PC页/路由、不改全局renderer。手机原发帖页面与五入口保持；UI owner负责实现/测试，主负责Home native usingComponents注册/公共配置测试与最终构建，无真实上传/发布/改草稿、无commit/push。
  - 主Home config仅追加既有native topic-format-button注册；config/routes两suite6/6，新增config/test lint0。document/sanitizer/HTML三suite72/72；attachments/native-format两suite17/17（初始editor runner load失败，改installed-Taro桥完整exit0，不把失败次算通过）。新产物注册checker已拒绝旧T53输出缺Home toolbar。
  - UI首次冻结17suite502/502；主Home/settings/compose/editor/history八suite273/273、相邻七suite68/68、adapter/scrollbar23/23（分组重叠不相加），TS215→214新增0、lint新增0/移除4warning。首次production non-watch构建6.47s成功，实际AST/WXSS142/142、注册9/9；注册checker初次错误要求JSON含Taro sharing flags，核安装版emit/page后改scratch检查实际JS enable assignments/handlers，生产未改。集成复核发现常驻compose成功发布后published标志未复位，会阻止下一篇草稿保存，已交同UI owner补明确新编辑会话与旧timer保护/回归；同时补旧RichBody mutation完成notice的boundary保护。附件邻套14pass/5fail为旧effect字符串定位失效，交UI迁移fixture后重跑，不能记为全通过；document首轮错写不存在topicMarkdownHtml测试ENOENT，改实际createTopicHtml后72/72 exit0。上述为最终交付前发现的问题，均已补修并重新冻结。
  - 同UI owner补修draftSession/rendered session：embedded有效发布后进入新编辑会话，下一篇自动保存与切走保存正常，旧timer/unload/异步persist不能恢复旧已发布稿；独立页面原published+navigateBack不变。RichBody旧mutation失败notice也核currentBody/boundary/adapter identity，旧visit/account不能回写。普通切Tab保同native Editor且不setContents；初始化未ready可恢复绑定/必要hydrate，退休adapter先drain已提交调用，拒tab/A→B→A旧任务。Toolbar RootPortal按captured owner内容left/width界定，不覆盖56px栏。
  - UI重新冻结18suite508/508；主最终九suite279/279（Home/visual/settings/share/compose/editor/RichBody/history/attachments），相邻七suite68/68、adapter/scrollbar23/23、document三suite72/72，组间重叠不累计唯一用例。最终唯一writer non-watch production构建7.60s成功，实际AST/WXSS142/142、renderer/native/share注册9/9；当前dist已包含本批和补修，无watch。显式production原始字节main1320520B/secondary56744B/HomeJS43606B（不含map、不用gzip），不与旧NODE_ENV=development的production-format包体直接比较。
  - 主完整TS215→213，多重集新增0/移除2；lint多重集新增0/移除4warning，修改七UI tests及公共tests/config/helper均0，生产既有诊断保留，不称全TS/lint绿。git diff --check通过。标准Vitest既有module-runner启动阻塞未修；有限installed React/Taro合成runner与构建不是真实微信验收。Windows/Mac/frameset右侧栈清理、编辑器输入/工具栏几何/草稿保留仍待原生验收；未真实导航/请求/上传/发布/读取私信联系人或正文、清存储草稿、commit/push。

- [x] **T53 · 代码与检查完成｜私信与消息同样切换Home内容，左侧Tab栏不变；原生验收待做**
  - 用户2026-11-12明确纠正：“我是说点私信就行点 消息一样 不是替换 tab 栏”。私信应成为Home内与消息同机制的内容选择，点击后显示右侧私信列表、左栏保持56px/原入口/设置/头像，并显示私信选中态；不navigateTo独立列表页、不替换左栏、不增加返回论坛按钮。撤除T52私信侧栏状态/320px布局/compact窄列适配，复用既有列表与active/账号/分页/会话路由，手机原五入口保留。UI owner负责实现和测试，主集成/docs；不改API/cache、不真实请求/读私信联系人/修改数据、不提交推送。
  - 同UI owner七文件冻结：CONTENT_TABS追加5而手机TAB_CONFIG仍五项；私信onSelect(5)走同handleClick并显示accent选中，56px导航/footer不替换。homeMain复用消息/私信Navbar，原四wrapper父链/顺序不变，追加私信wrapper，visitedTabs[5]首次懒挂载后常驻；embedded且active仅selected5&&pageVisible。精确撤除T52 privateSidebar/visitedPrivateSidebar/homeNavigation/320px/back/compact，Me隐藏设置恢复实际左栏条件；独立列表/会话路由及原API/cache/事件契约不变。
  - 新正常Tab契约red5fail/67pass后UI10suite290/290；主冻结后Home/visual/Me/privateList/privateLifecycle五suite112/112，公共package/desktop四suite27/27、相邻私信state/thread/composer三suite60/60、UI/Hub两suite52/52（各组与UI有重叠，不累计唯一用例）。安装Taro/React合成节点验证私信点击左栏同实例、原四内容/新增私信跨Tab/width/show-hide保留，手机五入口可切离；embedded默认头像、独立cursor/刷新及线程eventChannel全部CID回归。主首轮误指定不存在ownAvatar.test.ts导致ENOENT，该次不算完成；改用实际meAvatarPublication.test.ts后112/112且exit0。
  - 主唯一non-watch构建5.75s成功；实际压缩AST/WXSS172/172。新checker曾拒绝旧T52输出缺私信标题；最终仅scratch适配共享消息/私信标题表达式、Me局部sidebar变量与minifier交换===左右项/参数alias，未改生产迁就。产物确认私信在永久homeMain、同selection5/visited/active、左栏选中/五原手机入口/footer56px保留，无sidebar/back/compact请求；未启watch。
  - 主全TS215→215诊断多重集NEW0/REMOVED0；Home30errors/1warning、Me9errors/0warning、messages2errors/0warning与基线同多重集，五test lint0，git diff --check通过。标准Vitest再次确认既有ERR_PACKAGE_PATH_NOT_EXPORTED ./module-runner启动阻塞，未升级依赖。有限scratch与构建不代替真实微信Windows/Mac/frameset点击/滚动/会话返回验收；未真实导航/请求/读取联系人或私信正文、修改存储草稿、commit/push。

- [x] **T52 · 历史误解实现｜替换左栏方案已被T53明确否定，不作为当前需求**
  - 用户2026-11-12纠正T51：“点击私信应该把左边栏换成私信列表，现在是在右边栏打开的”。左栏私信入口改为本地切换左侧内容，复用既有MessageConversationList及账号/分页/刷新语义，不再从此入口navigateTo私信列表页；列表可返回原论坛导航，选会话继续使用现有会话路由与事件契约。普通手机入口保留；Home既有内容/选择/visited/头像与设置行为保持，私信模式仅实际左栏可用并绑定页面可见性。UI owner负责页面/布局/相关测试，主集成与文档；不改API/cache协议、不读真实私信联系人、不提交推送。实施和验证分别记录，真实微信PC/frameset验收待做。
  - 同UI owner七文件冻结：永久homeNavigation仍是workspace第二子节点，不移动homeMain；论坛模式56px、私信模式320px且max-width60%，顶部返回论坛。首次点击懒挂载既有MessageConversationList，之后display隐藏保留实例，active绑定实际私信侧栏与pageVisible；私信模式恢复Me原设置入口。仅列表UI增加默认false的compact头像28px与Home局部窄列排版（8px留白、名称ellipsis、时间/未读次行、header wrap），不改请求/缓存/会话事件协议或手机默认。分包注册与preload不改。
  - UI10suite289/289；主独立Home/visual/Me/privateList/privateLifecycle五suite111/111、privateState/lifecycle/threadCache/composer四suite70/70、其余privateList/UI/Hub三suite72/72、package/desktop公共四suite27/27（存在重叠，不累计为唯一用例）。安装Taro/React合成DOM确认homeNavigation/私信list host/homeMain/已访问内容在mode返回重开、width/pageVisible变化保持身份；合成列表独立cursor/刷新及线程eventChannel全部CID、inactive/账号变更/旧响应回归通过。
  - 单次non-watch构建5.96s成功；实际压缩AST/WXSS197/197，旧输出缺private列已red。最终checker适配shared common.js中的compact object-spread及render局部minified alias，仅改scratch匹配、不改生产行为。同格式原始dist字节：main1471855→1481313（+9458B）、secondary78948→71644（-7304B），Home JS42013→42950；首页导入既有列表实现及依赖后进入主包shared chunk，如实记录而非声称私信实现仍全部分包。
  - TS最终215→215多重集NEW0/REMOVED0；新增测试曾有unused props及header不满足ReactNode，均在UI test修复（合法key:null），未放宽生产签名。lint Home30errors/1warning、Me9errors/0warning、messages2errors/0warning与基线同多重集，五test lint0；git diff --check通过。标准Vitest既有module-runner启动阻塞未修，有限scratch/产物不替代真实微信验收。未启watch、真实请求/导航/读取私信联系人、改存储草稿或提交推送；Windows/Mac/frameset左侧替换与会话右侧实际导航仍待原生验收。

- [x] **T51 · 历史实现与检查完成｜左栏私信快捷入口；跳转方式已被T53内容Tab要求取代**
  - 用户2026-11-12要求“消息下新增私信”。独立左栏顶部顺序为首页→发现→消息→私信；私信复用现有Envelope图标及APP_ROUTES.messages，不增加Home内容Tab、请求或私信未读计数。56px/5px栏宽、底部发帖→设置→头像、手机原五入口、选中/visited/未读及内容父链保持不变。同UI owner仅修改Home TSX与rendererLayout test，主负责集成/文档；未改SCSS、Me、API/cache。
  - UI新增契约red4fail51pass后green，8suite256/256；主独立Home/visual/Me三suite78/78（与UI计数重叠，不相加）。覆盖Windows/Mac/devtools宽栏顺序/可访问/mock私信路由、点击Home state同对象、未读点仅归消息、宽窄与HIDE_TAB切换，以及既有手机/页父链/footer/Me回归。
  - 主单次non-watch构建5.30s成功，实际压缩AST/WXSS169/169；新产物checker先拒绝旧输出缺私信入口，再完整green，保留T50设置与既有98项公共检查。TS215→215诊断多重集NEW0/REMOVED0；Home30errors/1warning、Me9errors/0warning基线不变，三test lint0（DISABLE_V8_COMPILE_CACHE=1仅本次命令环境）。git diff --check通过。标准Vitest既有module-runner启动阻塞未修，本次有限scratch不等于标准Vitest或真实微信验收；未启watch、真实导航/读取私信联系人/改存储草稿或提交推送。实际Windows/Mac/frameset入口布局及跳转仍待原生验收。

- [x] **T50 · 代码与检查完成｜左栏头像上方增加设置；有左栏时隐藏“我的”页设置入口；原生验收待做**
  - 用户2026-11-12要求“左边栏 头像上面添加设置按钮，同时隐藏用户主页的设置按钮（仅有左边栏时候）”。左栏footer顺序为文字发帖→设置按钮→头像；设置沿用APP_ROUTES.settings，点击不改变当前Tab或新建页面状态。有实际左栏渲染时向Me传UI-only hideSettings标志，已登录/加载/未登录/错误两种Navbar分支均隐藏原设置动作，保留Navbar本身及资料编辑入口；普通手机底栏、无左栏及独立用户主页不受影响。56px栏宽、44px头像点击目标、头像账号scope/现有请求、页面稳定父链不变。同UI owner负责页面/SCSS/tests，主集成/文档；不改API/cache、不真实导航/读数据、不提交推送。
  - 同UI owner六文件冻结：Home footer新增desktopSettingsButton44px/图标22px，点击现有设置分包路由不走Tab选择；Home传hideSettings={wideTabs && !HIDE_TAB}，Me默认false，仅条件取消两分支同settingsAction。保留Navbar、资料编辑、56px/5px左栏及现有头像fallback/账号请求scope；不修改独立user页面或shared Navbar/API/cache。
  - 新契约8项red后UI8suite253/253；主独立Home/Me三suite75/75、共享Navbar/头像/profile四suite61/61、公共尺寸/config三suite24/24，计数重叠不相加。覆盖Windows/Mac/devtools左栏、宽窄动态恢复、HIDE_TAB无导航保入口、ready/未登录/loading/error默认消费者，以及mock点击路由与选择/visited/unread状态不变。
  - 单次non-watch构建4.67s成功，实际压缩AST/WXSS最终162/162；先记录缺设置44px目标的实质red，最终checker因minifier的shared:false→!1匹配失败，仅修scratch布尔形式匹配后完整通过。TS215→215诊断多重集NEW0/REMOVED0；Home30errors/1warning、Me9errors/0warning与基线不变，三test lint0（本次命令DISABLE_V8_COMPILE_CACHE=1，不改依赖/配置）。git diff --check通过。标准Vitest既有module-runner启动阻塞未修，本次有限scratch不代替标准Vitest或原生验收；未启watch，未真实导航/请求/改数据或提交推送。Windows/Mac、frameset与宽屏实际设置跳转/入口切换仍待真实微信验收。

- [x] **T49 · 代码与检查完成｜左栏收窄至56px；实际宽屏验收待做**
  - 用户2026-11-12追加“左边栏还可以更窄 1/5”，随后明确“56px”，以精确56px为准，不采用早期57.6px计算值。仅独立左栏宽度及横向留白收窄：72px→56px，横向padding8px→5px，扣除1px边框后45px内容宽，可容纳44px头像点击目标和40px图标框；头像/发帖/字号/纵向排布、标题右置、PC-first/非PC960px与手机原底栏不变。同UI owner最小样式与契约测试，主集成；不新增API、不改草稿或真实数据、不提交推送。
  - 同UI owner已冻结两文件（Home SCSS及visual契约test），56px/5px最终red→green；主独立Home两suite64/64、实际压缩AST/WXSS产物149/149（含原98及56px控件容纳边界），单次non-watch构建5.28s成功，git diff --check通过；visual test lint0。仅尺寸/测试与文档变更，未重跑全TS或标准Vitest（既有启动阻塞未修），未启watch。Windows/Mac及宽屏原生56px几何/交互仍未验收，未将合成或构建替代真实微信验收。

- [x] **T46 · 代码与检查完成｜左栏收窄为72px；实际宽屏验收待做**
  - 用户2026-11-12截图反馈“tab 栏太宽了”。当前112px左列改为72px固定逻辑像素；左栏入口重排按后续T48：首页/发现/消息在顶部，文字发帖和账户头像在底部，选择/未读/发帖动作保持。普通手机五入口底部尺寸不变。同UI owner负责样式与测试，主集成；不根据截图读取或复制真实内容。
- [x] **T47 · 代码与检查完成｜页面标题在左栏右侧；实际宽屏验收待做**
  - 同条反馈“另外标题展示在tab栏右侧而不是上面”。现有Navbar在整个homeWorkspace之前，改为永久右侧内容列顶部；左栏覆盖自身整列高度，标题/搜索/正文在右侧，非左栏布局保原标题在内容上/Tab在底。正文/Navbar父链和keys保持，不重挂已访问页面；用户后续T48明确允许独立左侧导航，不再要求左右导航复用同一树。公共Navbar若无需改保持原契约，API/cache不变；真实验收待做。
- [x] **T48 · 代码与检查完成｜独立左栏底部头像、其上文字发帖；实际PC验收待做**
  - 用户2026-11-12补充“左边的 Tab栏无需复用原来的 Tab组件，需要重排版，把我的换成头像，放在底部，发帖变成文字按钮放在我的上面”。独立左侧导航顶部首页/发现/消息，底部账户头像，其上文字发帖；72px栏宽与右侧标题保留，手机原五入口底Tab不变。左右导航只在当前模式一侧可见/可交互，正文与已访问页面不重复/重挂；选择/未读/发帖仍共享原行为。头像默认本地图，复用Me既有资料请求/后台刷新，由局部UI回调传递；账号事件清默认，原请求账号/回调修订保护A→B→A晚响应。不为导航新增getUserProfile/API请求、不猜cache键、不读真实资料做fixture、不改公共账号/cache契约；UI owner负责实现/测试。
  - T46/T47/T48同UI owner正式冻结：永久homeMain含Navbar/正文，独立DesktopSideNav只在左栏模式渲染，mobile原TAB_CONFIG.map/ShareElement/safe inset保留；顶部0/1/3，footer margin-top:auto，文字发帖32px高/12px字号，头像点击目标44px/内部32px。导航可换树，root/workspace/homeMain/Navbar/tabContent与四已访问页面身份保留；PC-first及非PC所属root960px保持。
  - UI有限合成8suite246/246；主独立Home/Me三suite68/68（安装版Taro注册/父链、唯一导航、动作与账号scope），相邻分页/Navbar/头像/通知/发现/资料六suite110/110，公共密度26/26、账号资料相邻59/59、媒体86/86，各组重叠不相加。Me覆盖零额外请求、effect才发布、后台refresh/设置fresh、旧请求、A→B→A、退出、非法profile/loginError及卸载。
  - 主单次non-watch构建6.34s成功；Taro CLI即使NODE_ENV=development仍对非watch指定production打包模式，产物已压缩，不称readable development构建。阶段旧watch产物207/207；最终旧checker可读JS/CSS-module变量名匹配失败，不能称最终207/207。另建minification-independent Babel AST＋WXSS checker验证实际压缩产物145/145 exit0：保原98项公共/phone基线，47项独立rail/父链/唯一分支/五入口/动作/头像绑定检查；未为checker重建或改生产。独立左栏checker先记录缺新样式实质red，后按冻结32px/12px设计值及flex:none语义调整scratch断言，不改生产迁就。TS215→215诊断多重集NEW0/REMOVED0。首轮普通lint有v8-compile-cache错误处理async-function/require.mjs导致13条resolver故障；只对本次命令设DISABLE_V8_COMPILE_CACHE=1重跑后Home30errors/1warning、Me9errors/0warning与基线多重集无变化，三test lint0。不修改依赖或harness，不称全项目lint/TS绿。
  - 标准yarn test重核仍ERR_PACKAGE_PATH_NOT_EXPORTED ./module-runner启动阻塞；有限scratch不等于标准Vitest。UI额外pageSharing两项旧mock缺useCallback失败、skylinePageLayout旧HtmlRender mock load失败，未修不相关fixture，不计入通过suite。git diff --check通过。当前普通窄工具预览不证明新左栏：72px/标题右置/底部文字发帖与头像、Windows/Mac及frameset拖窗/滚动/账号切换真实微信验收仍待做，未浏览器替代、未访问真实资料/消息/草稿或提交推送。

- [x] **T45 · 代码与检查完成｜PC默认左侧；实际PC验收待做**
  - 本次PC-first修正已冻结：捕获desktopTabs=isDesktopClient，constructor同步wideTabs，ready/resize/show的PC分支在底栏reset前直接保持true，不依赖960px/owner/nextTick/query成功；非PC保原960px响应式。4项实质red（Windows/Mac初帧及missingowner/故障）修正后绿。
  - 同UI owner7suite234/234 exit0，主独立Home56/56＋相邻178/178、媒体86/86、公共密度26/26、产物158/158（重叠不相加）。安装版页面注册fixture覆盖Windows/Mac/devtools；PC零query、窄resize保左、原host/page leaf/keys/visited/unread/compose保持。主TS215→215多重集NEW0/removed0、Home lint原30errors/1warning无新增、两tests lint0。生成checker首轮遗漏common.isDesktopClient模块前缀失败，仅修scratch匹配后158/158，未改生产迁就。
  - 当前能访问的运行实例是平板devtools预览，不重复作为PC验收；Windows/Mac实际客户端与用户所指PC模式尚未实测。未主动切模型、刷新、导航、读取真实正文或改数据；未提交推送。
  - 用户2026-11-12继续反馈“PC 模式下还是没有展示在左侧啊”；再次撤回完成状态。本次能访问的工具仍为1032px宽屏实例，左栏112px/left0；安全枚举只读确认platform=devtools、modelCategory=tablet、systemCategory=mobile，是平板预览，不能代表用户实际PC模式。现有代码所有平台一律要求root≥960px，PC常见窄窗口/frameset首页也会走底栏；本次将PC导航策略与手机宽屏断点分开：Windows/Mac PC同步默认112px左栏，窄窗口/frameset或native测量失败不回底部；非PC保960px所属root阈值与原guard。PC窄区内容按剩余空间缩，不再承诺800px内容预算。保留既有开发者工具证据但不称用户PC已验收；同UI owner负责修改，公共密度/API/cache不变。
  - 用户2026-11-12要求“宽屏模式下，tab 栏展示在左边”，复测追加“还是没有展示在左侧啊”；前轮完成状态已撤回并重新修正。原方案的desktop平台门、1100px门限及desktop祖先样式排除了实际宽屏：只读微信工具确认Home为devtools、所属root1032×1376，无wide/desktop class。不是ThemePage吞生命周期或constructor缺owner；安装版页面注册/ref/lifecycle合成已排除这两项假设。
  - 当前导航按捕获所属native page的唯一root scoped query实测宽度≥960px启112px左侧普通flex流列（最小848px内容预算），不依赖平台身份或desktop祖先；局部wide控件固定px。常规390/430px手机及窄窗格保持底栏，不改公共PC密度识别/手机rpx回退，不使用整屏/最近页，不恢复已撤销desktop/cache架构。
  - 永久homeWorkspace保留一份tabContent及五入口Tab，同父链/顺序/keys，wide仅row-reverse改变视觉位置，不overlay或重挂四已访问内容；选中/未读/发帖动作保持。wide取消Skyline底部safe inset、dark旧55px高度；resize释放旧wide，generation拒绝旧nextTick/query、重复响应及hide/unmount回调，无轮询或新增timer/API/cache变更。
  - 同UI owner冻结及主独立重跑7suite226/226、进程exit0（Home两suite48/48），安装版createPageConfig→connectReactPage→生产App.render包装→Home ref及native ready/resize/hide/show路径通过；inert adapter entry不挂载生产App effects。主正确URL桥媒体86/86、公共密度26/26、实际产物156/156；各组重叠不相加。主第一次误写不存在的topicListRenderer.test.ts导致ENOENT，该次不计通过，改为实际topicListRefresh.test.ts后完整重跑226/226。
  - 主最终全TS215→215诊断多重集NEW0/removed0；Home lint30errors/1warning与旧基线等价，无新增，三UI test lint0。早期fixture createRoot缺项、异步entry effects及4本地类型错误均修正后重跑，不把中间48/48但exit失败称绿。唯一watch已更新产物，git diff --check通过；标准Vitest仍ERR_PACKAGE_PATH_NOT_EXPORTED ./module-runner启动阻塞，有限scratch不等于标准Vitest。
  - 当前真实微信开发者工具只读复查已见root--wideTabs，bottomTab实测112×1314.5、left0/top61.6（修正前top1200），内容区同步实测920px宽、left112/top61.6，确认左栏与内容并排且未遮挡；未主动刷新、导航或访问私密内容。Windows/Mac真机与frameset拖窗、滚动/键盘/草稿状态仍未验收，不将本次工具几何证据外推为全部PC验收；不改真实数据/草稿、不自动提交推送。

- [x] **T44 · 代码与检查完成｜相关主题首屏直接按右侧布局展示；原生验收待做**
  - 用户2026-11-12追加“相关主题出现在右边有个跳动过程，不能在渲染首屏就展示在右边吗”。已在桌面首帧同步pending，先测所属区域再atomic发布ready/layout；永久正文流及fixed相关主题visibility hidden、pointer-events none，永久absolute loading宿主覆盖实际滚动区且不占高度，pending touch/scroll/refresh有guard。手机同步inline ready；正文/编辑器/相关实例与key保持，不额外请求，不用全屏或最近页猜测。
  - 数据就绪后每次显式测量仅一个300ms有界watchdog，缺ready/nextTick/query回调或失败安全inline；finish先失效代际并清timer，再一次更新ready/layout，超时旧callback不能复活宽布局；hide/unmount/deps清timer，无data/mobile不启动timer。T43的336/356/1156几何与HtmlRender effect-only boolean契约保留。
  - 同UI owner冻结5suite178/178，主独立detail/media/Home9suite212/212、安装版Taro分页31/31、实际产物135/135（含此前123及T44新增）；重叠不相加。UI冻结及主T45最终全TS215→215多重集NEW0；编辑中快照222的7条未完成Home诊断最终全部消除。detail/rail/media lint无新增，visual helper旧导入位置3条由owner整理后lint0。初次生成checker因scratch模板反引号及产物换行匹配失败，仅修checker，未改生产迁就。
  - 有限runner仍非标准Vitest；额外commentScroll套因scratch缺vi.runAllTimers有2项runner失败，不称该套通过，不升级依赖。尚未真实微信验收Skyline/WebView首帧、visibility/pointer、fixed裁剪及拖窗；编译和合成检查不能证明原生无跳动，不自动提交推送。

- [x] **T43 · 代码与检查完成｜右侧相关主题宽度增加20%；原生验收待做**
  - 用户2026-11-12追加“相关主题 在右侧时候 宽度增加 20%”。已仅悬浮列280→336px，正文预留300→356px，保持20px间隔与800px正文最低预算，宽布局阈值1100→1156px；手机/窄窗格文末布局不变。后续首屏跳动另跟踪T44。
  - 同一UI owner4suite130/130含1155/1156边界；主独立detail/rail/media/Home相邻9suite246/246、实际生成123/123（含原116及T42/T43新增），各计数重叠不相加。TS215→215多重集NEW0，hook/test lint0/0，未真实微信验收336px右栏及阈值拖窗，不自动提交推送。

- [x] **T42 · 代码与检查完成｜帖子列表加载下一页后跳到顶部；原生验收待做**
  - 用户2026-11-12反馈“帖子列表向下滚动 加载下一页后 就会跳到顶部”。已在共享TopicList将分页Loading放永久topicListLoadingHost：旧direct-sibling删除会使安装版TaroDOM重新下发包含ScrollView的父cn，新结构loading开始/结束及失败重试仅影响footer子树，空宿主margin/padding/min-height0、flex none。不改scrollTop/阈值/实测高度/列表key/API/cache/主动刷新；首页与节点页共享修复。
  - 主独立真实安装Taro reconciler+DOM合成31/31，覆盖旧payload正向对照、新结构两renderer同scroll/item sid、高400px/100%不变、分页失败同页重试、旧首屏refresh回调不能覆盖分页、空host无gap；fixture第一次缺key/不完整TopicSummary由同UI owner修复，最终无React key警告、TS215→215多重集NEW0。UI4suite109/109、主相邻9suite246/246/实际生成123/123重叠不相加；Home lint8errors/2warnings、List1error/1warning均原基线，新增test0/0，无新增。共享ScrollViewType5/5，模板scratch套因require重复绑定load失败，独立真实Weapp原属性别名6断言通过，不改依赖/生产掩盖runner问题。
  - 有限scratch桥仅在内存编译安装版@tarojs/react ESM→CJS以适配Node导入，未修改依赖；标准Vitest仍module-runner启动阻塞。payload行为证据不等于已证明真实微信跳顶消失，手机/PC实际连续分页滚动位置仍待微信验收。保已有工作区/缓存/草稿，不清数据、不自动提交推送。

- [x] **T41 · 代码与检查完成｜宽帖子区域右侧悬浮相关主题；原生验收待做**
  - 用户2026-11-12要求“当帖子展示区域的宽度过大的时候，把相关主题悬浮展示在右侧”。已按捕获的所属native page测量root与真实滚动viewport交集，PC区域≥1100px时右侧280px独立滚动，正文流预留300px并按交集限制max-width，悬浮上下边界避开导航/动作栏；窄窗格、手机、无owner或非法测量保留原位置。resize/ready/show/hide/数据就绪与过期回调有代际保护，不用全屏宽度或最近打开页，不恢复旧架构。
  - 同一UI owner负责页面/related/hook/UI测试；唯一相关主题与永久ScrollView保留原React位置，正文/评论/编辑器不换key、不新增API请求。主负责已协调的HtmlRender可选imageLayoutKey，仅使body测量effect在缩列提交后重测，不改变presentation memo/HTML/root/parser；双renderer同root宽窄切换、相同key与默认消费者不重复测量、旧scope拒绝覆盖均通过。
  - 主独立冻结6suite215/215（rail/detail/composer/images/video），相邻尺寸/主题/字号/回复7suite64/64；UI4suite129/129与主重叠不相加。实际app/common/home/detail/search WXSS级联及JS绑定116/116（含原98），确认desktop margin0、正文auto/stretch/border-box、独立related高度、单实例与媒体依赖。初次scratch错误断言手机不存在的floating margin，仅修测试适用范围后通过，无生产迁就。
  - 全TS215→215诊断多重集NEW0/removed0；新增hook/related/test lint0/0，新增测试helper命名问题由UI owner修复。媒体生产4条与测试1条lint诊断均与HEAD相同，detail保留17errors/3warnings，无新增，不称全项目绿。标准Vitest仍因ERR_PACKAGE_PATH_NOT_EXPORTED ./module-runner在启动前失败，不升级依赖；有限scratch并非标准Vitest或原生验收。唯一watch已产出当前绑定；未真实微信验收nested ScrollView/PullDownRefresh内fixed裁剪、Skyline独立滚动/inline自动高度、Win frameset收放与图片重测，不浏览器替代、不访问真实数据、不自动提交推送。

- [x] **T40 · 代码与检查完成｜系统性批量治理PC尺寸；原生验收待做**
  - 用户2026-11-12明确“系统性地批量治理一下”。已统一构建期数字rpx长度token（手机原rpx回退、PC375px设计密度），覆盖共享库/CSS Modules/动画与阴影；公共运行时处理自有主题与有限inline尺寸，浮层使用真实desktop宿主。保留已有PC特殊override、百分比/原生实测px、输入叠层一致性与API/cache/草稿，无整体zoom或已撤销架构复活。
  - 主独立公共5suite39/39（含真实资料/私信/公告/GzkUi SCSS回退契约）、UI10suite251/251、相邻私信数据/刷新/评论7suite174/174（重叠不相加）；扩展实际WXSS级联98/98，覆盖手机回退/PC资料/私信列表、气泡、输入按钮、公告与独立portal。初次portal检查遗漏真实search页面CSS导致失败，仅修scratch合并真实样式后通过，无生产迁就。全51SCSS真实Sass+PostCSS逐声明5528项mobile回退等价，1447长度引用，转换增量41274bytes（同源码管线201285→242559，不是生产包或gzip）；实际产物43scope均未被CSS Modules hash、99distinct token，各引用在对应样式均有定义。
  - 主媒体图片/视频83/83，相邻通知/发现/renderer/mentions/nav/主题视觉检查79项78通过1旧失败：未改searchVisualContract仍断言font-size27rpx，而HEAD与当前search/index.scss均14.91PX；已对照确属既有陈旧断言，未改生产或测试掩盖，完整该组不称全绿。
  - 主全TS215→215诊断多重集NEW0/removed0；公共新增实现/测试lint通过，UI本批8production lint111errors/11warnings与同范围原基线等价，config/index既有no-shadow保留，不称全lint绿。标准Vitest依旧ERR_PACKAGE_PATH_NOT_EXPORTED ./module-runner，不升级依赖。唯一watch受控重启bwxklxsmg，首编4849ms成功，新插件与root resizable/frameset已进入产物；未真实微信验收length-var回退、RootPortal尺寸、原生按钮触控或frameset导航/窗口，不自动提交推送。

- [x] **T39 · 代码与检查完成｜首页公告卡片比例与换行；原生验收待做**
  - 用户2026-11-12追加窄首页截图；已将浅色缺失定位的公告decorative blend移出flex流、插画max-width100%与文案flex-basis0，避免挤走图标/文案；公共token统一PC几何，手机语义布局也修正。相关合成与产物验证见T40，不根据vConsole WEBVIEW标签推断PC身份，不复制截图帖子内容作fixture；真实验收待做。

- [x] **T38 · 代码与检查完成｜PC私信会话头像/气泡/输入栏巨型尺寸；原生验收待做**
  - 用户2026-11-12追加会话页截图；标题/消息头像通过共享UserAvatar换算，气泡padding11px12px/圆角12px、发送32px与icon17px、输入max-height110px由公共token自动覆盖，不再新增会话逐页PX patch；同UI owner、合成fixture与产物验证见T40。不读取真实会话，不改变发送/已读/刷新/账号语义或草稿；真实验收待做。

- [x] **T37 · 代码与检查完成｜PC私信列表巨型头像与行距；原生验收待做**
  - 用户2026-11-12追加私信列表截图，头像与列表行距随桌面窗口放大。已由共享UserAvatar size96→PC48px与公共SCSStoken统一gap12px/padding15px、metadata38–80px并保flex-shrink0，不增加逐页PX patch；同UI owner、合成/产物验证见T40。不访问/复制真实联系人与私信正文，不改已读/刷新/API/账号隔离或发送语义；真实验收待做。

- [x] **T36 · 代码与检查完成｜统一PC尺寸策略，修复“我的”页巨型头像与文字挤压；原生验收待做**
  - 用户2026-11-12提供“我的”页截图并询问“这是不是什么通用性问题啊”；已统一构建单位/共享inline策略，UserAvatar所有消费者desktop固定size/2、资料152rpx外框→76px、gap14px，自有theme shadow运行时换算并保持手机原串；资料nameRow保min-width0/可wrap及detailValue剩余行宽。BottomSheet/NodePicker/TopicEditor portal独立scope与inline一致，原生按钮内部desktop布尔适配绕过copy.wxss转换缺口。主公共构建/主题/集成，同UI owner页面/组件；验证见T40，保留手机/原生输入/草稿/API/cache。截图隐私不作fixture、不外传，真实验收待做。

- [x] **T34 · 代码与检查完成｜PC消息页入口/通知卡片尺寸；原生验收待做**
  - 用户2026-11-12追加消息页截图并反馈“尺寸不对”；已补实际notifications局部desktop几何：三入口40px/图标20px、头像35px、卡片圆角14px与紧凑引用padding，ScrollView分配剩余flex高度。生产仅SCSS，不改变手机尺寸、通知读取/路由/API/未读语义，不复制截图真实内容为fixture。
  - 同一UI owner整合12suite201/201；主独立消息/发现/数据7suite45/45；生成完整WXSS与两配置68/68。TS225→215无新增（移除10条旧通知test错误），lint既有95错误/9警告无新增、公共文件独立通过；标准Vitest依旧module-runner阻塞。唯一watch最新1063ms成功；未做真实微信PC消息/头像/滚动验收。
- [x] **T35 · 代码与检查完成｜PC发现页横幅/排行榜尺寸；原生验收待做**
  - 用户2026-11-12追加发现页截图并反馈“尺寸不对”；已补Discovery局部desktop几何：横幅89px、卡片圆角15px/紧凑padding、排行榜行48px/排行栏25px、关注头像36px，滚动区剩余flex高度。手机保持原规则，原底部Tab不移左侧，测试仅合成内容；生产仅新增SCSS，无API/cache/轮播数据逻辑改动。
  - 与T34共同独立45/45合成与生成68/68通过、最新watch1063ms；不以合成Sass或构建代替微信验收，尚未做真实窄/宽PC发现页布局与frameset多页滚动测试。

- [x] **T33 · 配置与构建检查完成｜启用PC原生resizable和frameset；原生验收待做**
  - 用户2026-11-12追加“开始适配 PC 端，启用 resizable 和 frameset”。主agent已在app.config根级启用两项true，types仅补frameset精确boolean声明；不恢复旧整套架构。旧watch未热更新app配置，停止旧进程且核无残留后重启唯一watch biwpos45h，首编4550ms成功，dist/app.json已核两项true。
  - 公共尺寸/配置/主题宿主有限合成18/18、当前完整app/common/home/detail生成CSS契约40/40；标准Vitest仍module-runner启动阻塞，不安装或升级依赖。官方frameset正文明确Windows微信3.3+；Mac可调窗支持不等于原生分栏支持。未进行真实微信双栏/拖窗验收，不自动提交/推送或导航改动用户草稿。

- [x] **T32 · 代码与检查完成｜PC首页/详情尺寸，兼容mobile，保底部Tab；原生验收待做**
  - 用户2026-11-12截图反馈“尺寸都是乱的，优化在PC上的尺寸适配同时兼容mobile端”。当前main为30f3459，代码基于91704b3；不恢复已撤销的bbcfb85整套重构或备份WIP，不新增左全局Tab。截图症状包括详情大卡片/头像/分类/排序按钮/底部评论分享区域与窄首页尺寸不协调。
  - 同一UI owner负责页面/组件/样式/UI测试；主负责最小公共desktop身份/尺寸基础设施、集成与本清单。先核当前rpx与inline转换，PC紧凑PX覆盖仅绑定desktop身份，窄/宽所属页面都适配，mobile基线不变。保既有底部五入口、正文/评论/图片边界、原生滚动与键盘/草稿保护；无需恢复旧缓存/API/pageScope重构。
  - 当前PC根级真实主题宿主限定PX；Home/Topics/TopicList与detail剩余高度flex100%，desktop pill不查询最近打开页，Navbar固定32px/12px边距；头像/tag/footer/评论编辑候选/附件/图片inline几何紧凑，mobile原逻辑保留。未搬旧架构或改变API/cache/parser/image测量。
  - UI冻结8suite171/171；主独立7suite131/131、公共18/18、评论/字号158/158、图片/视频83/83、生成app/common/home/detail完整CSS契约40/40。媒体有限runner原URL提供者fixture失败后只修scratch动态URL桥再全绿。TS冻结复核发现TopicList新测试fixture缺摘要字段后由UI owner补全，最终225→215新增0；完整修改生产文件lint95错误/9警告与HEAD同内容基线一致，新增0；普通lint进程v8-compile-cache/async-function阻塞，DISABLE_V8_COMPILE_CACHE=1同规则公共文件通过；标准Vitest仍module-runner启动阻塞。
  - 唯一watch因T33配置热更新缺口受控重启；不并发build、不安装依赖、不提交推送、不导航/覆盖草稿、不读取截图正文为fixture/访问真实网络。尚未真实微信窗格导航/拖动/滚动/键盘验收，现有图片测量及全局导航的多页归属语义未在本次重构；后续消息/发现两截图另跟踪T34/T35，不当作全PC验收已完成。

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
- 2026-11-12唯一WeChat watch（bwxklxsmg）达到后台运行时限，被系统停止；当前未运行watch，旧日志monitor也已到期。T46–T48冻结后已单次non-watch构建6.34s与最终检查完成，产物已更新（CLI指定production打包模式，实际压缩AST/WXSS检查145/145）；未自动重启watch，未并发向相同dist写入。后续源码改动不会自动构建，需按新请求显式启动。
- 后续需求追加在本清单；主 agent 更新状态后再向用户汇报，不能只说“会改”。
