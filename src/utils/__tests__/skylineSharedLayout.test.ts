import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { document, hydrate, options } from "@tarojs/runtime";
import { getComponentsAlias, internalComponents } from "@tarojs/shared";
import Taro from "@tarojs/taro";
import TopicList from "../../pages/home/topics/topicList";
import "../../components/HtmlRender";

const featureGlobals = vi.hoisted(() => {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const flag of ["ENABLE_INNER_HTML", "ENABLE_ADJACENT_HTML", "ENABLE_CLONE_NODE", "ENABLE_CONTAINS", "ENABLE_SIZE_APIS", "ENABLE_TEMPLATE_CONTENT", "ENABLE_MUTATION_OBSERVER"]) {
    previous.set(flag, Object.getOwnPropertyDescriptor(globalThis, flag));
    (globalThis as any)[flag] = flag === "ENABLE_INNER_HTML";
  }
  return previous;
});

vi.mock("@tarojs/taro", async () => {
  const { options: runtimeOptions } = await import("@tarojs/runtime");
  return { default: { options: runtimeOptions, navigateTo: vi.fn(), previewImage: vi.fn() } };
});
vi.mock("@tarojs/components", () => Object.fromEntries(
  ["View", "Span", "Text", "Image", "ScrollView", "ShareElement", "OpenContainer"].map(name => [name, name]),
));
vi.mock("guanggu-forum-api", () => ({ URLS: {} }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../CacheService", () => ({ cacheService: {}, CacheCategory: {} }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../urls", () => ({ urlPathVaiable: () => () => ({ params: { tid: "1" } }) }));
vi.mock("../linkHandler", async (importOriginal) => ({ ...(await importOriginal<typeof import("../linkHandler")>()), isUserMentionLink: (href: string) => href.startsWith("/u/"), linkHandler: vi.fn() }));

const source = (path: string) => readFileSync(`src/${path}`, "utf8");
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function nodes(node: any): any[] {
  return [node, ...node.childNodes.flatMap(nodes)];
}
function parse(html: string) {
  const root = document.createElement("view");
  root.innerHTML = html;
  return root;
}
function listTree() {
  const list = new TopicList({ getTopics: vi.fn() }, {});
  list.state = { topics: [{ link: "/t/1", title: "长标题".repeat(40), category: "长板块", username: "long_user", commentCount: "4" } as any], loadingPage: 1 };
  return list.render();
}

beforeEach(() => vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  for (const [flag, descriptor] of featureGlobals) {
    if (descriptor) Object.defineProperty(globalThis, flag, descriptor);
    else delete (globalThis as any)[flag];
  }
});

const projectRequire = createRequire(`${process.cwd()}/package.json`);
function createWeappTemplate() {
  const { Weapp } = projectRequire("@tarojs/plugin-platform-weapp");
  const helper = projectRequire("@tarojs/helper");
  const platform = new Weapp({ helper, paths: {}, modifyComponentConfig() {} }, { compiler: "vite" }, {});
  // No setup/build: use only the installed template generator in memory.
  platform.modifyTemplate({});
  return platform.template;
}
function applyProjectViteHook(viteConfig: any, template: any) {
  const loadConfig = projectRequire("./config/index.js");
  const initialConfig = loadConfig((_target: any, base: any) => base);
  const register = vi.fn();
  for (const pluginPath of initialConfig.plugins) {
    projectRequire(pluginPath)({ initialConfig, modifyViteConfig: register });
  }
  expect(register).toHaveBeenCalledTimes(1);
  register.mock.calls[0][0]({ viteConfig, data: {}, viteCompilerContext: { taroConfig: { template } } });
}
function generatedTemplates(template: any) {
  const componentConfig = { includes: new Set(["view", "pure-view", "text", "static-text", "span", "image"]), exclude: new Set(), thirdPartyComponents: new Map(), includeAll: false };
  const base = template.buildTemplate(componentConfig);
  const sandbox = { module: { exports: {} as any } };
  runInNewContext(template.buildXScript(), sandbox);
  const names = new Set([...base.matchAll(/<template name="([^"]+)"/g)].map(match => match[1]));
  return { base, names, xs: sandbox.module.exports };
}

describe("WeChat template generation config", () => {
  it("reproduces the default seventh static Text hole and generates the missing floors through the project hook", () => {
    vi.stubEnv("TARO_ENV", "weapp");
    const template = createWeappTemplate();
    const originalNesting = template.nestElements;
    const before = generatedTemplates(template);
    const alias = template.componentsAlias["static-text"]._num;
    const seventh = before.xs.a(7, alias, Array(6).fill(alias).join(","));
    expect(seventh).toBe(`tmpl_6_${alias}`);
    expect(before.names.has(seventh)).toBe(false);

    applyProjectViteHook({}, template);
    expect(template.nestElements).not.toBe(originalNesting);
    expect(originalNesting.get("static-text")).toBe(6);
    expect([...template.nestElements].filter(([name]) => name !== "static-text"))
      .toEqual([...originalNesting].filter(([name]) => name !== "static-text"));
    const after = generatedTemplates(template);
    const regularAlias = template.componentsAlias.text._num;
    for (let level = 0; level < template.baseLevel - 1; level++) {
      const name = `tmpl_${level}_${alias}`;
      expect(after.names.has(name)).toBe(true);
      if (level < 6) {
        const body = (base: string, target: string) => base.match(new RegExp(`<template name="${target}">[\\s\\S]*?<\\/template>`))?.[0];
        expect(body(after.base, name)).toBe(body(before.base, name));
      }
    }
    expect(after.base).toContain('style="{{i.st}}" class="{{i.cl}}"');
    expect(after.base).toContain(`name="tmpl_0_${regularAlias}"`);
    expect(after.base).toContain('bindtap="eh"');
    expect(template.buildBaseComponentTemplate(".wxml")).toContain("l:xs.f('',i.nn)");

    let ancestry = "";
    let depth = 0;
    let fallbacks = 0;
    for (let index = 0; index < 40; index++) {
      let name = after.xs.a(depth, alias, ancestry);
      expect(after.names.has(name)).toBe(true);
      if (name === `tmpl_${template.baseLevel - 1}_container`) {
        fallbacks++;
        // comp.wxml starts a fresh tmpl_0_* and static ancestry for this node.
        name = `tmpl_0_${alias}`;
        ancestry = "";
        depth = 0;
        expect(after.names.has(name)).toBe(true);
      }
      ancestry = after.xs.f(ancestry, alias);
      depth++;
    }
    expect(fallbacks).toBe(2);
  });
  it("dispatches actual six-span HTML text runs without altering their classes or inline styles", () => {
    vi.stubEnv("TARO_ENV", "weapp");
    const template = createWeappTemplate();
    applyProjectViteHook({}, template);
    const generated = generatedTemplates(template);
    const root = parse(`<p>${"<span class='nested' style='color: red'>".repeat(6)}deep${"</span>".repeat(6)}</p>`);
    const textNodes = nodes(root).filter(node => node.nodeName === "text");
    expect(textNodes).toHaveLength(7);
    let ancestry = "";
    const alias = template.componentsAlias["static-text"]._num;
    const hydratedNodes = (node: any): any[] => [node, ...(node.cn || []).flatMap(hydratedNodes)];
    const runtimeAlias = getComponentsAlias(internalComponents)["static-text"]._num;
    const hydratedTextNodes = hydratedNodes(hydrate(root)).filter(node => node.nn === runtimeAlias);
    expect(hydratedTextNodes).toHaveLength(7);
    for (const node of hydratedTextNodes.slice(1)) {
      expect(node.cl).toBe("h5-span nested");
      expect(node.st).toContain("color: red");
    }
    for (const node of textNodes) {
      expect(node.isAnyEventBinded()).toBe(false);
      expect(node.childNodes.every((child: any) => ["text", "#text"].includes(child.nodeName))).toBe(true);
      expect(generated.names.has(generated.xs.a(0, alias, ancestry))).toBe(true);
      ancestry = generated.xs.f(ancestry, alias);
    }
    for (const node of textNodes.slice(1)) {
      expect(node.className).toBe("h5-span nested");
      expect(node.cssText).toContain("color: red");
    }
    expect(root.textContent).toBe("deep");
  });
  it("preserves double-colon CSS without changing JavaScript minification on weapp", () => {
    vi.stubEnv("TARO_ENV", "weapp");
    const template = createWeappTemplate();
    const viteConfig = { build: { minify: "esbuild", cssMinify: "esbuild" } };
    applyProjectViteHook(viteConfig, template);
    expect(viteConfig.build).toEqual({ minify: "esbuild", cssMinify: false });
  });
  it("leaves H5 and other platform templates and CSS minification unchanged", () => {
    for (const env of ["h5", "alipay"]) {
      vi.stubEnv("TARO_ENV", env);
      const nestElements = new Map([["static-text", 6]]);
      const template = { nestElements };
      const viteConfig = { build: { minify: "esbuild", cssMinify: "esbuild" } };
      applyProjectViteHook(viteConfig, template);
      expect(template.nestElements).toBe(nestElements);
      expect(template.nestElements.get("static-text")).toBe(6);
      expect(viteConfig.build).toEqual({ minify: "esbuild", cssMinify: "esbuild" });
    }
  });
});

describe("shared dual-renderer layout", () => {
  it("shares reference card geometry and typography without native viewport expansion", () => {
    const [baseline, rest] = source("pages/home/topics/topicList/index.scss").split(".topicList--skyline");
    const override = rest.split(".topicListEmpty")[0];
    expect(baseline).toContain("margin: 0 22rpx 14rpx;");
    expect(baseline).toContain("padding: 22rpx 26rpx 20rpx;");
    expect(baseline).toContain("font-size: 30rpx;");
    expect(baseline).toContain("flex-wrap: nowrap;");
    expect(override).not.toMatch(/font-size:|padding(?:-[a-z]+)?:|margin(?:-[a-z]+)?:/);
    expect(override).toContain("height: auto;");
    expect(override).toContain("flex: none;");
  });
  it("places native two-line truncation on title Text inside ShareElement", () => {
    const item = elements(listTree()).find(e => typeof e.type === "object" && e.type.type)?.type.type;
    expect(item).toBeTypeOf("function");
    const tree = item({ topic: { title: "长标题", category: "分类", username: "用户", link: "/t/1", commentCount: "4" } });
    const rendered = elements(tree);
    expect(rendered[0].props.className).toBe("topicContainer");
    expect(rendered.find(e => e.props.className === "titleShare").type).toBe("ShareElement");
    expect(rendered.find(e => e.props.className === "title")).toMatchObject({ type: "Text", props: { overflow: "ellipsis", maxLines: 2 } });
    expect(rendered.find(e => e.props.className === "userName").type).toBe("Text");
  });
  it("only selects native wrapper styling for a Skyline page renderer", () => {
    expect(elements(listTree()).find(e => e.type === "ScrollView").props.className).toBe("topicList topicList--skyline");
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(elements(listTree()).find(e => e.type === "ScrollView").props.className).toBe("topicList");
  });
  it("specifies horizontal direction on shared search/filter rows", () => {
    for (const path of ["components/SearchEntry/index.scss", "components/SearchHotTopics/index.scss", "components/NodePicker/index.scss", "pages/node/topicList/index.scss"]) {
      const css = source(path);
      expect(css).not.toMatch(/display: flex;\s*align-items:/);
      expect(css).toContain("flex-direction: row;");
    }
  });
  it("shares discovery single-line overflow with native title limits", () => {
    expect(source("pages/home/discovery/index.tsx")).toMatch(/className='hotTopicTitle' overflow='ellipsis' maxLines=\{1\}/);
    expect(source("pages/home/discovery/index.scss")).toContain("text-overflow: ellipsis;");
    expect(source("components/SearchEntry/index.tsx")).toContain("overflow='ellipsis' maxLines={1}");
    expect(source("pages/home/notifications/index.tsx")).toContain("<Text className='notificationTitle'>");
  });
});

describe("Skyline HTML parser normalization", () => {
  it("preserves block paragraphs and groups styled text, mentions and br into one Text run", () => {
    const root = parse("<p>正文<strong>加粗<span>内联</span></strong><br>换行<a href='/u/alice'>@alice</a></p><p>第二段</p>");
    const paragraph = root.firstChild!;
    expect(root.childNodes.map(n => n.nodeName)).toEqual(["view", "view"]);
    expect(paragraph.childNodes).toHaveLength(1);
    expect(paragraph.firstChild!.nodeName).toBe("text");
    for (const node of nodes(paragraph.firstChild)) expect(["text", "#text"]).toContain(node.nodeName);
    expect(paragraph.textContent).toBe("正文加粗内联\n换行@alice");
    expect(root.lastChild!.textContent).toBe("第二段");
  });
  it("drops server indentation around paragraphs without creating blank native Text lines", () => {
    const root = parse("<div>\n      <p>第一段</p>\n      <p>第二段</p>\n    </div>");
    const block = root.firstChild!;
    expect(block.childNodes.map(node => node.className)).toEqual(["h5-p", "h5-p"]);
    expect(block.textContent).toBe("第一段第二段");
  });
  it("turns the server comment span with block paragraphs into vertical View flow", () => {
    const root = parse("<div><span class='content'>\n  <p>评论一</p>\n  <p>评论二</p>\n</span></div>");
    const block = root.firstChild!.firstChild!;
    expect(block.nodeName).toBe("view");
    expect(block.childNodes.map(node => node.className)).toEqual(["h5-p", "h5-p"]);
    expect(block.textContent).toBe("评论一评论二");
    // Taro can already assign Span when its template includes that component.
    const nativeSpan = document.createElement("span");
    nativeSpan.appendChild(parse("<p>原生段落</p>").firstChild!);
    options.html.transformElement!(nativeSpan, { tagName: "span" } as any);
    expect(nativeSpan.nodeName).toBe("view");
  });
  it("preserves inline spaces, authored br breaks, nonbreaking spaces and code indentation", () => {
    const root = parse("<div>\n<p><strong>Hello</strong> <em>world</em><br>下一行 &nbsp;</p>\n<pre><code>  one\n    two</code></pre>\n</div>");
    expect(root.firstChild!.firstChild!.textContent).toBe("Hello world\n下一行 &nbsp;");
    expect(root.firstChild!.lastChild!.textContent).toBe("  one\n    two");
  });
  it("keeps explicitly authored blank paragraphs and standalone text whitespace", () => {
    const root = parse("<div><p>第一段</p><p><br></p><p>第二段</p></div>");
    expect(root.firstChild!.childNodes).toHaveLength(3);
    expect(root.firstChild!.childNodes[1].textContent).toBe("\n");
    expect(parse("<div>  普通文本\n</div>").firstChild!.textContent).toBe("  普通文本\n");
  });
  it("does not normalize server indentation or comment spans on WebView", () => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    const root = parse("<div>\n  <span class='content'>\n<p>第一段</p>\n<p>第二段</p>\n</span>\n</div>");
    expect(root.firstChild!.firstChild!.nodeName).toBe("#text");
    expect(root.firstChild!.firstChild!.textContent).toBe("\n  ");
    expect(root.textContent).toBe("\n  \n第一段\n第二段\n\n");
  });
  it("uses one native paragraph gap and compact comment typography without changing WebView body spacing", () => {
    const [baseline, native] = source("components/HtmlRender/index.scss").split(".htmlWrap--skyline");
    expect(baseline).toContain("margin: 16rpx 0;");
    expect(native).toContain("margin: 0 0 12rpx;");
    expect(native).toContain("&:last-child { margin-bottom: 0; }");
    const comments = source("pages/topicDetail/index.scss");
    expect(comments).toContain("font-size: inherit;");
    expect(comments).toContain("line-height: inherit;");
    expect(comments).toContain("margin: 0 0 8rpx;");
  });
  it("preserves block image paragraphs and uses span only for mixed inline content", () => {
    const root = parse("<p>前文<strong><a href='https://example.test'><span>图片<img src='sample.png'></span></a></strong>后文</p><div>块内容</div>");
    expect(root.firstChild!.nodeName).toBe("view");
    expect(nodes(root).find(n => n.className === "h5-span").nodeName).toBe("span");
    expect(nodes(root).some(n => n.nodeName === "image")).toBe(true);
    for (const node of nodes(root)) {
      if (node.nodeName === "text") expect(node.childNodes.every((child: any) => ["text", "#text"].includes(child.nodeName))).toBe(true);
      if (node.nodeName === "#text") expect(node.parentNode.nodeName).toBe("text");
    }
    expect(root.textContent).toBe("前文图片后文块内容");
  });
  it("renders text links as one icon + shortened label chip instead of a broken raw URL", () => {
    const root = parse("<p>看这里 <a href='https://github.com/geekeren/GuangGuForum/pull/123/files'>https://github.com/geekeren/GuangGuForum/pull/123/files</a> 谢谢</p>");
    const link = nodes(root).find(n => n.className === "html-link html-link--external");
    expect(link.nodeName).toBe("span");
    expect(link.childNodes).toHaveLength(1);
    const chip = link.firstChild!;
    expect(chip.nodeName).toBe("view");
    expect(chip.className).toBe("html-linkChip");
    expect(chip.childNodes.map((node: any) => node.nodeName)).toEqual(["image", "text"]);
    const icon = nodes(root).find(n => n.className === "html-linkIcon");
    expect(icon?.nodeName).toBe("image");
    expect(String(icon?.props?.src || "")).toContain("link-chip");
    const label = nodes(root).find(n => n.className === "html-linkLabel");
    expect(label?.textContent).toBe("github.com/geekeren/GuangGuForum/…");
    expect(root.textContent).not.toContain("↗");
  });
  it("keeps the authored italic footer around an atomic upright link chip", () => {
    const root = parse("<p><em>本帖发自<a href='https://example.test'><strong>小程序</strong></a></em></p>");
    const link = nodes(root).find(n => n.className === "html-link html-link--external");
    expect(link.nodeName).toBe("span");
    expect(link.firstChild!.className).toBe("html-linkChip");
    expect(link.firstChild!.childNodes.map((node: any) => node.nodeName)).toEqual(["image", "text"]);
    expect(link.firstChild!.lastChild!.textContent).toBe("小程序");
    expect(link.firstChild!.lastChild!.props).toMatchObject({ overflow: "ellipsis", maxLines: 1 });
    expect(root.textContent).toBe("本帖发自小程序");
    const css = source("components/HtmlRender/index.scss");
    const external = css.match(/&--external\s*\{([\s\S]*?)\n    \}/)![1];
    expect(external).not.toMatch(/background:|padding:|border-radius:/);
    expect(css).toMatch(/\.html-linkChip\s*\{[\s\S]*?display: inline-flex;[\s\S]*?font-style: normal;/);
  });
  it("normalizes headings, list text and preformatted line breaks", () => {
    const root = parse("<h2>标题<em>强调</em></h2><ul><li>条目</li></ul><pre><code>one\ntwo</code></pre>");
    expect(root.firstChild!.nodeName).toBe("view");
    expect(root.lastChild!.nodeName).toBe("view");
    expect(root.lastChild!.firstChild!.nodeName).toBe("text");
    expect(root.lastChild!.textContent).toBe("one\ntwo");
    for (const node of nodes(root).filter(n => n.nodeName === "#text")) expect(node.parentNode.nodeName).toBe("text");
  });
  it("renders a plain-text comment through a block parent and a single Text run", () => {
    const root = parse("<div>纯文本评论 English words 保留正常断词</div>");
    const block = root.firstChild!;
    expect(block.nodeName).toBe("view");
    expect(block.firstChild!.nodeName).toBe("text");
    expect(block.textContent).toBe("纯文本评论 English words 保留正常断词");
  });
  it("keeps the original paragraph, image, table and code geometry", () => {
    const css = source("components/HtmlRender/index.scss");
    const [baseline, native] = css.split(".htmlWrap--skyline");
    expect(baseline).toContain(".htmlWrap {\n  width: 100%;\n}");
    expect(baseline).toContain("margin: 16rpx 0;");
    expect(baseline).toContain("overflow-x: auto;");
    expect(baseline).toContain("min-width: 120rpx;");
    expect(native).toContain("word-break: normal;");
    expect(native).not.toContain("word-break: break-all;");
    expect(native).not.toContain("overflow: hidden;");
    expect(native).not.toContain(".h5-td");
    expect(native).not.toContain("display: inline;");
  });
  it("explicitly renders Span so dynamic inline nodes are included in WeChat templates", () => {
    const jsx = source("components/HtmlRender/index.tsx");
    expect(jsx).toContain('import { Span, Text, View } from "@tarojs/components";');
    expect(jsx).toContain("{skyline && <Span style={{ display: 'none' }} />}");
    expect(jsx).toContain("<View\n        ref={htmlEle}");
    expect(jsx).toContain("dangerouslySetInnerHTML={{ __html: renderHtml }}");
    expect(jsx).toContain('const renderHtml = skyline ? `<div>${cleanHtml}</div>` : cleanHtml;');
  });
  it("generates WeChat view/text/span templates with class and style in memory", () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    const { Weapp } = require("@tarojs/plugin-platform-weapp");
    const helper = require("@tarojs/helper");
    const platform = new Weapp({ helper, paths: {}, modifyComponentConfig() {} }, { compiler: "vite" }, {});
    // No platform setup/build: generate only the template string in memory.
    platform.modifyTemplate({});
    const config = { includes: new Set(["view", "text", "image"]), exclude: new Set(), thirdPartyComponents: new Map(), includeAll: false };
    expect(platform.template.buildTemplate(config)).not.toContain("<span ");
    config.includes.add("span");
    const template = platform.template.buildTemplate(config);
    for (const name of ["view", "text", "span"]) {
      const tag = template.match(new RegExp(`<${name} [^>]*>`))?.[0];
      expect(tag).toContain("class=");
      expect(tag).toContain("style=");
    }
    expect(template).toContain("max-lines=");
  });
  it("renders ordered list numbers as real Text, including nested lists", () => {
    const root = parse("<ol start='3'><li>first<ol><li>nested</li></ol></li><li>second</li></ol>");
    expect(nodes(root).filter(n => n.className === "htmlListMarker").map(n => n.textContent)).toEqual(["3.", "1.", "4."]);
    expect(source("components/HtmlRender/index.scss")).toContain('.h5-ol .h5-li::before { content: ""; }');
  });
  it("preserves WebView p/span mapping and has no native normalization", () => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    const root = parse("<p>正文<span><strong>内联</strong></span></p>");
    expect(root.firstChild!.nodeName).toBe("view");
    expect(nodes(root).find(n => n.className === "h5-span").nodeName).toBe("view");
    expect(root.firstChild!.firstChild!.nodeName).toBe("#text");
    expect(Taro.options).toBe(options);
  });
  it("preserves WebView block structure for comments, images, lists and code", () => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    const root = parse("<p>first</p><p>second<img src='sample.png'></p><ol><li>item</li></ol><pre><code>one\ntwo</code></pre>");
    expect(root.childNodes.map(n => n.nodeName)).toEqual(["view", "view", "view", "view"]);
    expect(root.firstChild!.firstChild!.nodeName).toBe("#text");
    expect(nodes(root).find(n => n.className === "h5-img").nodeName).toBe("image");
    expect(nodes(root).some(n => n.className === "htmlListMarker")).toBe(false);
    expect(root.lastChild!.textContent).toBe("one\ntwo");
  });
});
