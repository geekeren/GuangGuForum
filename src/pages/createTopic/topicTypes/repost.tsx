import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { fetchLinkSummary } from "guanggu-forum-api";
import type { LinkSummary } from "guanggu-forum-api";
import { ClearableInput, ClearableTextarea } from "../../../components/ClearableInput";
import LinkPreviewCard from "../../../components/LinkPreviewCard";
import MarkdownRender from "../../../components/MarkdownRender";
import { htmlToMarkdown } from "../../../utils/htmlToMarkdown";
import { extractSummaryUrl } from "../../../utils/linkHandler";
import { BRAND_COLOR } from "../../../utils/theme";
import type { TopicTypeDefinition, RenderFormContext, OnActivateContext } from "./registry";

// 去掉 markdown 中的空链接标记 [](url)
function stripEmptyLinks(md: string): string {
  return md.replace(/\[([^\]]*)\]\([^)]+\)/g, (_match, text) => {
    return text.trim() ? text : "";
  });
}

function buildSummaryPreview(info: LinkSummary): string {
  if (info.bodyText || info.description) {
    return stripEmptyLinks((info.bodyText || info.description)).slice(0, 400);
  }
  return "";
}

const repostDef: TopicTypeDefinition = {
  key: "repost",
  label: "转载",
  node: "water",

  initialFields: {
    sourceUrl: "",
    sourceTitle: "",
    summary: "",
    thumbnail: "",
    fullRepost: true,
    clipLoading: false,
    repostPreview: null as LinkSummary | null,
    repostClosing: false,
  },

  buildContent(fields, { content, fromMini }) {
    const { sourceUrl, sourceTitle, summary, thumbnail, fullRepost } = fields;
    const thumbPart = thumbnail ? `![缩略图](${thumbnail})\n\n` : "";
    const linkText = sourceTitle || sourceUrl;
    if (fullRepost && summary) {
      return `${thumbPart}> 转载自 [${linkText}](${sourceUrl})\n\n${summary}\n\n${content}${fromMini}`;
    }
    const summaryPart = summary ? `\n\n**下面是摘要：**\n\n${summary}` : "";
    return `${thumbPart}> 转载自 [${linkText}](${sourceUrl})${summaryPart}\n\n${content}${fromMini}`;
  },

  validate(fields) {
    if (!fields.sourceUrl?.trim()) {
      return "请填写原文链接";
    }
    return null;
  },

  renderForm(ctx: RenderFormContext) {
    const { fields, setField, title, setTitle, content, setContent, getRef, focusRef, handleTitleInput } = ctx;
    const sourceUrlRef = getRef("sourceUrl");
    const titleRef = getRef("title");
    const contentRef = getRef("content");

    const handleSourceUrlBlur = () => {
      const url = extractSummaryUrl(fields.sourceUrl) || (fields.sourceUrl.trim().startsWith("http") ? fields.sourceUrl.trim() : "");
      if (!url || fields.repostPreview) return;
      setField("clipLoading", true);
      fetchLinkSummary(url).then((info: LinkSummary) => {
        setField("clipLoading", false);
        setField("repostPreview", { ...info, url });
      }).catch(() => {
        setField("clipLoading", false);
      });
    };

    const confirmRepost = () => {
      const info = fields.repostPreview;
      if (!info) return;
      setField("sourceUrl", info.url);
      const parts = [info.siteName, info.title].filter(Boolean);
      if (parts.length) setField("sourceTitle", parts.join(" - "));
      if (info.title) setTitle(info.title);
      if (info.image) setField("thumbnail", info.image);
      if (info.bodyHtml) {
        const md = stripEmptyLinks(htmlToMarkdown(info.bodyHtml));
        if (fields.fullRepost) {
          setField("summary", md);
        } else {
          const noImages = md.replace(/!\[[^\]]*\]\([^)]+\)\s*/g, "");
          const lines = noImages.split("\n").filter((l: string) => l.trim());
          setField("summary", lines.slice(0, 10).join("\n") + (lines.length > 10 ? "\n......" : ""));
        }
      } else if (info.bodyText || info.description) {
        setField("summary", (info.bodyText || info.description).slice(0, 400));
      }
      setContent("大家怎么看");
      setField("repostPreview", null);
      setTimeout(() => {
        contentRef?.current?.focus?.();
      }, 100);
    };

    const cancelRepost = () => {
      setField("repostClosing", true);
      setTimeout(() => {
        setField("repostPreview", null);
        setField("repostClosing", false);
      }, 250);
    };

    return (
      <View className="editorSection">
        {!fields.sourceUrl && (
          <View className="repostTip">
            <Text className="repostTipText">自动读取剪贴板链接用于转载，也可手动输入</Text>
          </View>
        )}
        <View className="fieldGroup">
          <Text className="fieldLabel">原文链接</Text>
          <ClearableInput
            ref={sourceUrlRef}
            className="fieldInput"
            placeholder="粘贴原文链接"
            placeholderClass="fieldPlaceholder"
            cursorColor={BRAND_COLOR}
            value={fields.sourceUrl}
            onInput={(v) => setField("sourceUrl", v)}
            onDeleteWhenEmpty={() => focusRef(titleRef)}
            onBlur={handleSourceUrlBlur}
          />
        </View>
        <ClearableTextarea
          ref={titleRef}
          className="titleInput"
          placeholder="标题"
          placeholderClass="titlePlaceholder"
          cursorColor={BRAND_COLOR}
          maxlength={120}
          value={title}
          onInput={handleTitleInput}
          autoHeight
          confirmType="next"
          onConfirm={() => focusRef(sourceUrlRef)}
          onDeleteWhenEmpty={() => focusRef(sourceUrlRef)}
        />
        {fields.sourceUrl ? (
          <View className="fieldGroup">
            <Text className="fieldLabel">摘要</Text>
            <ClearableTextarea
              className="fieldTextarea"
              placeholder="文章摘要（可选）..."
              placeholderClass="fieldPlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={-1}
              value={fields.summary}
              onInput={(v) => setField("summary", v)}
              onDeleteWhenEmpty={() => focusRef(titleRef)}
            />
          </View>
        ) : null}
        {fields.thumbnail ? (
          <View className="fieldGroup">
            <Text className="fieldLabel">缩略图</Text>
            <View className="thumbnailRow">
              <Image className="thumbnailPreview" src={fields.thumbnail} mode="aspectFill" />
              <View className="thumbnailRemove" onClick={() => setField("thumbnail", "")}>
                <Text className="thumbnailRemoveText">✕</Text>
              </View>
            </View>
          </View>
        ) : null}
        <ClearableTextarea
          ref={contentRef}
          className="contentInput"
          placeholder="补充说明（可选）..."
          placeholderClass="contentPlaceholder"
          cursorColor={BRAND_COLOR}
          value={content}
          onInput={(v) => setContent(v)}
          autoHeight
          cursorSpacing={100}
          adjustPosition
          onDeleteWhenEmpty={() => focusRef(titleRef)}
        />

        {fields.repostPreview && (
          <View className={`repostMask${fields.repostClosing ? " repostMask--closing" : ""}`} onClick={cancelRepost}>
            <View className={`repostSheet${fields.repostClosing ? " repostSheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
              <View className="repostSheetHeader">
                <Text className="repostSheetTitle">转载确认</Text>
                <View className="repostSheetClose" onClick={cancelRepost}>
                  <Text className="repostSheetCloseText">✕</Text>
                </View>
              </View>
              <Text className="repostSheetHint">已读取剪贴板中的链接</Text>
              <View className="repostSheetOptions">
                <View className="repostCheckbox" onClick={() => setField("fullRepost", !fields.fullRepost)}>
                  <View className={`repostCheckboxBox${fields.fullRepost ? " repostCheckboxBox--checked" : ""}`}>
                    {fields.fullRepost && <Text className="repostCheckboxTick">✓</Text>}
                  </View>
                  <Text className="repostCheckboxLabel">原文转载</Text>
                </View>
                <Text className="repostCheckboxDesc">{fields.fullRepost ? "转载完整正文内容" : "仅转载文章摘要"}</Text>
              </View>
              <ScrollView scrollY className="repostSheetScroll">
                {fields.fullRepost ? (
                  <LinkPreviewCard summary={fields.repostPreview} url={fields.sourceUrl} />
                ) : (
                  <View className="repostPreviewContent">
                    <LinkPreviewCard summary={fields.repostPreview} url={fields.sourceUrl} />
                    {fields.repostPreview && (
                      <View className="repostSummaryPreview">
                        <Text className="repostSummaryLabel">摘要预览</Text>
                        <MarkdownRender content={buildSummaryPreview(fields.repostPreview)} />
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
              <View className="repostSheetActions">
                <View className="repostSheetCancel" onClick={cancelRepost}>
                  <Text className="repostSheetCancelText">取消</Text>
                </View>
                <View className="repostSheetConfirm" onClick={confirmRepost}>
                  <Text className="repostSheetConfirmText">{fields.fullRepost ? "原文转载" : "转载摘要"}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  },

  onActivate(ctx: OnActivateContext) {
    const { fields, setField, getRef } = ctx;
    const sourceUrlRef = getRef("sourceUrl");
    if (!fields.sourceUrl) {
      Taro.getClipboardData({
        success: (res) => {
          const url = extractSummaryUrl((res.data || "").trim());
          if (url) {
            setField("clipLoading", true);
            fetchLinkSummary(url).then((info: LinkSummary) => {
              setField("clipLoading", false);
              setField("repostPreview", { ...info, url });
            }).catch(() => {
              setField("clipLoading", false);
            });
          }
        },
      });
    }
    // Return first focus ref for the caller to use
    return sourceUrlRef;
  },
};

export default repostDef;
