# GzkUi

`gzk-ui` 是本 monorepo 的 Taro / React UI 基础包，提供标准表单、加载提示、标签、原生 SVG 图标与深浅色视觉 tokens。组件仅负责展示，不依赖应用 API、缓存、登录、路由或主题偏好存储。

## 使用

建议按组件入口导入，避免加载无关组件与样式。统一入口 `gzk-ui` 也导出所有组件、类型和纯工具。

```tsx
import { GzkLoading } from "gzk-ui/loading";
import { GzkTag } from "gzk-ui/tag";
import { GzkIcon } from "gzk-ui/icon";
import type { ColorTheme } from "gzk-ui/theme";
import { ChevronRight as vector } from "gzk-ui/icons";

function Example({ theme }: { theme: ColorTheme }) {
  return (
    <>
      <GzkLoading size={32} />
      <GzkTag onClick={() => { /* host interaction */ }}>标签</GzkTag>
      <GzkIcon src={vector} theme={theme} tone="accent" style={{ width: "24rpx", height: "24rpx" }} />
    </>
  );
}
```

- `GzkLoading`：`size` 单位为 px，默认 32；`fullscreen` 默认 false，使用绝对定位覆盖包含块。`className` 与 `labelClassName` 允许宿主追加样式，不改变加载文案。
- `GzkTag`：保留 `children`、可选 `onClick`，支持 `className`；背景继承 `--theme-brand-soft`，文字继承 `--theme-accent-text`，深色下保持清晰。
- `GzkIcon`：`src` 必须为原始 SVG 文档而非 URL，`theme` 必填；支持原生 Image 属性及字符串/对象样式。`tone` 为 `primary`、`secondary`（默认）、`muted`、`accent`、`accent-text`。颜色优先级为 `color` > 浅色下非空 `lightColor` > tone；SVG 中每个 `currentColor` 在原生 Image 边界被替换，原有其他颜色保留，旧 CSS filter 被禁用。

## 语义图标

- `gzk-ui/icons` 导出原始 SVG 常量（如 `Home`、`Bell`、`Envelope`、`ChevronRight`）、`ICONS`/`IconName` 与常量兼容映射 `LEGACY_ICON_ALIASES`。与 `GzkIcon` 配合使用；纯入口不加载 Taro、组件、主题监听或存储。
- `gzk-ui/icon-urls` 仅导出静态资源 URL（如 `DiscoveryTrendUrl`），供原生 Image 使用，不导入 raw SVG。静态 URL 中的 currentColor 不能继承宿主颜色；需改色的线性图标使用 raw + GzkIcon。
- `home`/`nav-home` 共用一份 Home；私信入口使用 Envelope，通知 tab 保留 Bell/BellActive。filled/outline、彩色分类、Heart/Star 和真实边界变体不无差别合并。普通加号用 Plus，按钮边界由消费容器表达；PlusCircle/PlusSquare 保留原有圆/方边界供需要完整文档的消费者（如原生 format-button）。
- 场景插画、默认头像、微信 logo、业务贴图及编辑附件仍由应用持有，不纳入图标库。

## 标准表单

- `gzk-ui/input` 的 `GzkInput` 与 `gzk-ui/textarea` 的 `GzkTextarea` 使用受控 `value: string`、`onInput(value: string)`，保留清除、原生 ref、disabled、caret CSS、keyboard/focus/confirm 属性及可选空值删除检测。默认不强制聚焦；只有启用空值删除检测且聚焦空值时才使用零宽空格。Textarea 的 `cursorColor` 只保留旧调用兼容，微信光标颜色应通过 style/CSS 设置。
- `gzk-ui/native-form` 导出 `GzkNativeInput`、`GzkNativeTextarea`、`GzkPicker`、`GzkButton`、`GzkSwitch`、`GzkRadio`、`GzkRadioGroup`，它们是对应 Taro 原生组件的**透明别名**，不新增包装 View、不转换事件、不拦截 refs/openType/分享/loading/disabled。原生事件仍接收 `event.detail`，不能与上述字符串回调混用。该入口统一依赖边界而不强加按钮外观。
- `gzk-ui/form-field` 的 `GzkFormField` 把 label/control 放在同一行，标签宽 128rpx，控件可收缩；`multiline` 顶部对齐。支持根/label/control 样式钩子。
- `gzk-ui/select` 的 `GzkSelect` 接收只读 `{value,label}` 选项、字符串 value、`onChange(value)`、显式 theme。内部使用原生 selector range/index，拒绝越界/非整数事件，disabled 不更新，完整显示选中 label 与库自带 muted 右箭头。无选项/未知值显示 placeholder；不持久化业务数据。

```tsx
import { GzkInput } from 'gzk-ui/input';
import { GzkFormField } from 'gzk-ui/form-field';
import { GzkSelect } from 'gzk-ui/select';
import { GzkButton } from 'gzk-ui/native-form';

const input = <GzkFormField label='昵称'><GzkInput value={name} onInput={setName} /></GzkFormField>;
const select = <GzkSelect options={options} value={value} onChange={setValue} theme={theme} />;
const share = <GzkButton openType='share'>分享</GzkButton>;
```

## 主题职责

纯入口 `gzk-ui/theme` 导出 `ColorTheme`、`ThemePalette`、`BASE_THEME_PALETTES`、`themeVariables` 与 `themePageStyle`，不加载组件或 Taro。纯入口 `gzk-ui/svgIcon` 导出 `svgIconSource`。

```tsx
import { View } from "@tarojs/components";
import { BASE_THEME_PALETTES, themeVariables, themePageStyle } from "gzk-ui/theme";

const theme = "dark";
const palette = { ...BASE_THEME_PALETTES[theme], "navigation-surface": "#171719" };
const pageStyle = themePageStyle(theme, palette); // 可交给宿主 PageMeta
const content = <View style={themeVariables(theme, palette)}>内容</View>;
```

第二参数是**已选定当前主题的扁平 palette**，用于宿主合成应用扩展；省略时采用 `BASE_THEME_PALETTES[theme]`。保留原有 `--theme-*` 名称。Skyline 必须在真实 View 上建立变量作用域，仅设置 PageMeta 不足；宿主自行管理页面尺寸，并为独立 portal 建立变量作用域。

应用保留主题偏好持久化、系统监听、PageMeta/NavigationBar、页面布局以及 navigation/profile/compose 扩展。基础包没有自动主题监听或全局页面样式。

Sass tokens 从 `gzk-ui/styles/tokens.scss` 导入；工作区内现有应用通过 `src/vars.scss` 转接。品牌基础色保持 Sass color 类型，兼容 `rgba($color-brand, ...)`；语义色使用 CSS variables 并保留原浅色 fallback。宿主构建需处理 TSX、SVG raw/静态资源、Sass/CSS Modules 与现有 `PX` 固定字体规则，并提供 ES2019 typings/runtime（较旧运行环境需宿主 polyfill，例如 Object.fromEntries）。

## 应用迁移与验证

现有 `Loading`、`Tag`、`ThemedIcon` 导入路径保留。ThemedIcon 适配应用 `useTheme`；Loading 适配既有 `.loading .tip` 样式选择器，库自身样式与动画使用 `gzk` 前缀。ClearableInput/ClearableTextarea 路径作为 GzkInput/GzkTextarea 兼容转接，清除按钮原选择器保留。现有页面原生表单依赖改用 native-form 透明别名；资料编辑使用 FormField/Select。Native Editor、MentionTextarea 的业务交互、BottomSheet 与业务列表不整体迁入基础包。

包内 `.test.ts` 覆盖组件属性、SVG 颜色优先级、主题转换、Sass 编译及深色 Tag 对比度，由工作区测试配置统一运行。微信构建与真实 Skyline/WebView 深浅色、动画和交互验收由宿主执行；单元测试或浏览器预览不能替代微信开发者工具/真机验证。
