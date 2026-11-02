import { describe, expect, it } from "vitest";
import postcss from "postcss";
import pxtransform from "postcss-pxtransform";
import fixedReadingFonts from "../../../config/fixedReadingFonts";

async function build(css: string, from = "/app/src/pages/topicDetail/index.scss") {
  return (await postcss([
    pxtransform({ platform: "weapp", designWidth: 750, deviceRatio: { 750: 1 } }),
    fixedReadingFonts({ referenceWidth: 430, designWidth: 750 }),
  ]).process(css, { from })).root;
}

function declarations(root: postcss.Root, prop: string) {
  const values: string[] = [];
  root.walkDecls(prop, (decl) => { values.push(decl.value); });
  return values;
}

describe("fixed reading fonts in the actual PostCSS pipeline", () => {
  it("preserves the measured 430px baseline and remains fixed on narrow devices", async () => {
    const root = await build(`
      .topicDetail .content { font-size: 28rpx; line-height: 1.6; padding: 16rpx; }
      .topicDetail .title { font-size: 34rpx; }
      .topicDetail .author { font-size: 27rpx; }
      .topicDetail .meta { font-size: 21rpx; }
      .topicList .title { font-size: 30rpx; }
      .topicList .meta { font-size: 22rpx; }
    `);
    expect(declarations(root, "font-size")).toEqual(["16px", "19px", "15px", "12px", "17px", "12px"]);
    for (const viewport of [320, 375, 430]) {
      // Native px is independent of viewport; compare against the old 430px view.
      const body = declarations(root, "font-size")[0];
      const effective = body.endsWith("rpx") ? parseFloat(body) * viewport / 750 : parseFloat(body);
      expect(effective).toBe(16);
    }
    expect(declarations(root, "line-height")).toEqual(["1.6"]);
    expect(declarations(root, "padding")).toEqual(["16rpx"]);
  });
  it("runs after pxtransform so fixed output is not converted back to rpx", async () => {
    const root = await build(".html {font-size: 28px; padding: 20px} .html .h5-p {font-size: inherit}");
    expect(declarations(root, "font-size")).toEqual(["16px", "inherit"]);
    expect(declarations(root, "padding")).toEqual(["20rpx"]);
  });
  it("keeps the native editor and its paint layer on exactly the same responsive metrics", async () => {
    const root = await build(`
      .mentionEditor {font-size: 28rpx}
      .mentionEditorMirrorText {font-size: inherit}
      .commentPopup .commentPopupTextarea {font-size: 28rpx}
      .loginPromptIcon {font-size: 72rpx}
    `);
    expect(declarations(root, "font-size")).toEqual(["28rpx", "inherit", "28rpx", "72rpx"]);
  });
  it("covers HTML, Markdown, discovery, notices and related-topic CSS Modules", async () => {
    const root = await build(`
      .html.h5-p {font-size: 28rpx}
      .md-h2 {font-size: 36rpx}
      .discoveryPage .topicTitle {font-size: 30rpx}
      .notificationsPage .reply {font-size: 26rpx}
    `);
    expect(declarations(root, "font-size")).toEqual(["16px", "20px", "17px", "14px"]);
    const related = await build(".index_module__title_abcd {font-size: 26rpx}", "/app/src/pages/topicDetail/relatingTopics/index.module.scss");
    expect(declarations(related, "font-size")).toEqual(["14px"]);
  });
});
