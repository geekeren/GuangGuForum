import { Span, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { createRef, useEffect, useMemo } from "react";
import { TaroElement } from "@tarojs/runtime";
import { isUserMentionLink, linkChipLabel, linkHandler } from "../../utils/linkHandler";
import "./index.scss";
import { URLS } from "guanggu-forum-api";
import { isSkyline } from "../../utils/renderer";
import LinkChipIcon from "../../assets/link-chip.svg";

interface TopicMeta {
  type: "repost" | "event" | "dating";
  sourceUrl?: string;
  time?: string;
  location?: string;
  gender?: string;
  age?: string;
}

function parseTopicMeta(html: string): {
  meta: TopicMeta | null;
  cleanHtml: string;
} {
  const match = html.match(/<!--gg:(.+?)-->/);
  if (!match) return { meta: null, cleanHtml: html };
  try {
    const meta = JSON.parse(match[1]) as TopicMeta;
    const cleanHtml = html.replace(match[0], "");
    return { meta, cleanHtml };
  } catch {
    return { meta: null, cleanHtml: html };
  }
}

interface Props {
  html: string;
}

function setNodeName(element: TaroElement, name: "text" | "view" | "span") {
  element.tagName = name.toUpperCase();
  element.nodeName = name;
}

// The runtime HTML parser assigns h5tagName; public TaroElement types omit it.
type ParsedHtmlElement = TaroElement & { h5tagName?: string };

const blockTags = new Set(["div", "p", "ul", "ol", "li", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "hr"]);

// The HTML parser calls this bottom-up, after attaching transformed children.
function normalizeSkylineElement(element: TaroElement, tagName: string) {
  // Span is an inline text-flow container, not a flex box. A link occupies one
  // inline slot; its single View child owns the flex layout and chip background.
  if (element.className.split(" ").includes("html-link--external")) return;
  const originalChildren = [...element.childNodes];
  const isBlock = (child: TaroElement) => child.nodeName === "view" || blockTags.has((child as ParsedHtmlElement).h5tagName || "");
  const hasBlocks = originalChildren.some(isBlock);
  if (hasBlocks && tagName !== "pre" && tagName !== "code") {
    // HTML indentation between blocks is not an authored blank line. A native
    // Text would give it a line box; keep spaces between inline words intact.
    const isWhitespace = (child: TaroElement) => child.nodeName === "#text" && /^[\t\n\r\f ]*$/.test(child.textContent || "");
    originalChildren.forEach((child, index) => {
      if (!isWhitespace(child)) return;
      const previous = originalChildren.slice(0, index).reverse().find(node => !isWhitespace(node));
      const next = originalChildren.slice(index + 1).find(node => !isWhitespace(node));
      if (!previous || !next || isBlock(previous) || isBlock(next)) element.removeChild(child);
    });
  }
  const children = [...element.childNodes];
  const textOnly = children.every((child) => child.nodeName === "text" || child.nodeName === "#text");
  if (tagName === "br") {
    setNodeName(element, "text");
    element.appendChild(element.ownerDocument.createTextNode("\n"));
  } else if ((element.nodeName === "text" || element.nodeName === "span") && !textOnly) {
    // A server wrapper span can contain whole paragraphs. Only genuinely inline
    // mixed media belongs in Span; block children need normal vertical flow.
    setNodeName(element, hasBlocks ? "view" : "span");
  }

  const list = element.parentElement as ParsedHtmlElement | null;
  if (tagName === "li" && list?.h5tagName === "ol") {
    const start = Number(list.props.start) || 1;
    const index = list.children.filter((child) => (child as ParsedHtmlElement).h5tagName === "li").indexOf(element);
    const marker = element.ownerDocument.createElement("text");
    marker.className = "htmlListMarker";
    marker.appendChild(element.ownerDocument.createTextNode(`${start + index}.`));
    element.insertBefore(marker, element.firstChild);
  }

  if (element.nodeName === "view") {
    // Keep each contiguous text run together so strong/mention/br remain inline,
    // without converting the block itself to Text or placing raw text in View.
    let run: TaroElement | null = null;
    for (const child of children) {
      if (child.nodeName !== "text" && child.nodeName !== "#text") {
        run = null;
        continue;
      }
      if (!run) {
        run = element.ownerDocument.createElement("text");
        element.insertBefore(run, child);
      }
      run.appendChild(child);
    }
  } else if (element.nodeName === "span") {
    for (const child of children) {
      if (child.nodeName !== "#text") continue;
      const text = element.ownerDocument.createElement("text");
      element.insertBefore(text, child);
      text.appendChild(child);
    }
  }
}

Taro.options.html.transformElement = (
  taroEle: TaroElement,
  htmlEle,
) => {
  if (htmlEle.tagName === "a") {
    const href = taroEle.props.href || "";
    const isMention = isUserMentionLink(href);
    const skyline = isSkyline();
    const hasImage = (element: TaroElement): boolean =>
      element.nodeName === "image" || element.children.some(hasImage);
    const hasImg = hasImage(taroEle);

    if (isMention) {
      taroEle.tagName = "TEXT";
      taroEle.nodeName = "text";
      taroEle.setAttribute("class", "html-link html-link--mention");
    } else if (hasImg) {
      // 图片链接本身就是“内容”，不加图标也不改文案。
      setNodeName(taroEle, skyline ? "span" : "view");
      taroEle.setAttribute("class", "html-link html-link--external");
    } else {
      // 统一的“域名胶囊”：链接图标 + 单行精简文案，避免长 URL 逐字符折行。
      const label = linkChipLabel(href, taroEle.textContent || "");
      setNodeName(taroEle, skyline ? "span" : "view");
      taroEle.setAttribute("class", "html-link html-link--external");
      while (taroEle.firstChild) taroEle.removeChild(taroEle.firstChild);
      const chip = skyline ? taroEle.ownerDocument.createElement("view") as TaroElement : taroEle;
      chip.setAttribute("class", skyline ? "html-linkChip" : "html-link html-link--external html-linkChip");
      const icon = taroEle.ownerDocument.createElement("image") as TaroElement;
      icon.setAttribute("class", "html-linkIcon");
      icon.setAttribute("src", LinkChipIcon);
      icon.setAttribute("svg", true);
      const text = taroEle.ownerDocument.createElement("text") as TaroElement;
      text.setAttribute("class", "html-linkLabel");
      if (skyline) {
        text.setAttribute("overflow", "ellipsis");
        text.setAttribute("maxLines", 1);
      }
      text.appendChild(taroEle.ownerDocument.createTextNode(label));
      chip.appendChild(icon);
      chip.appendChild(text);
      if (skyline) taroEle.appendChild(chip);
    }
    taroEle.addEventListener(
      "tap",
      (e) => {
        e.stopPropagation();
        linkHandler(href);
      },
      {},
    );
  } else if (htmlEle.tagName === "img") {
    const src = taroEle.props.src || taroEle.props["data-src"] || "";
    if (src) {
      // Server HTML may use root-relative/protocol-relative image URLs. Resolve
      // against the forum rather than letting WeChat treat them as local assets.
      try {
        taroEle.setAttribute("src", new URL(src, URLS.ROOT_URL).href);
      } catch {
        taroEle.setAttribute("src", src);
      }
    }
    taroEle.setAttribute("mode", "widthFix");
    // Skyline images are lazy by default. display:none removes the viewport
    // footprint and can prevent load from ever firing to reveal the image.
    // Keep a real box while loading; widthFix handles narrower parent widths.
    taroEle.setAttribute("lazyLoad", !isSkyline());
    taroEle.setAttribute("style", "display: block; width: 300px; height: 180px; max-width: 100%");
    taroEle.addEventListener(
      "load",
      (loadEvent) => {
        // Native image dimensions live in detail; older Taro also mirrors them
        // onto target. Never replace a usable loading box with NaN/zero sizes.
        const width = Number(loadEvent?.detail?.width ?? loadEvent?.target?.width);
        const height = Number(loadEvent?.detail?.height ?? loadEvent?.target?.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        const displayWidth = Math.min(width, 300);
        taroEle.setAttribute(
          "style",
          `display: ${width < 300 ? "inline-block" : "block"}; width: ${displayWidth}px; height: ${(height / width) * displayWidth}px; max-width: 100%`,
        );
      },
      {},
    );
    // Register once, not every load: cached reloads must not open two previews.
    taroEle.addEventListener(
      "tap",
      (e) => {
        e.stopPropagation();
        const imageUrl = taroEle.props.src;
        if (imageUrl) void Taro.previewImage({ urls: [imageUrl] }).catch(() => {});
      },
      {},
    );
  } else if (htmlEle.tagName === "span" && !isSkyline()) {
    if (taroEle.children.length !== 0) {
      taroEle.tagName = "VIEW";
      taroEle.nodeName = "view";
    }
  }
  if (isSkyline()) normalizeSkylineElement(taroEle, htmlEle.tagName);
  return taroEle;
};

const MetaCard = ({ meta }: { meta: TopicMeta }) => {
  if (meta.type === "repost") {
    return (
      <View className='metaCard metaCard--repost'>
        <Text className='metaCardTag'>转载</Text>
        <Text className='metaCardLink' onClick={() => meta.sourceUrl && linkHandler(meta.sourceUrl)}>
          {meta.sourceUrl || "查看原文"}
        </Text>
      </View>
    );
  }
  if (meta.type === "event") {
    return (
      <View className='metaCard metaCard--event'>
        <Text className='metaCardTag'>活动</Text>
        <View className='metaCardInfo'>
          <Text className='metaCardRow'>📅 {meta.time}</Text>
          <Text className='metaCardRow'>📍 {meta.location}</Text>
        </View>
      </View>
    );
  }
  if (meta.type === "dating") {
    return (
      <View className='metaCard metaCard--dating'>
        <Text className='metaCardTag'>相亲贴</Text>
        <View className='metaCardInfo'>
          <Text className='metaCardRow'>👤 {meta.gender}　🎂 {meta.age}</Text>
        </View>
      </View>
    );
  }
  return null;
};

const HtmlRender = (props: Props) => {
  const { html } = props;
  const htmlEle = createRef<TaroElement>();

  const { meta, cleanHtml } = useMemo(() => parseTopicMeta(html), [html]);
  const skyline = isSkyline();
  // Root text has no parser parent; put it in a neutral block for normalization.
  const renderHtml = skyline ? `<div>${cleanHtml}</div>` : cleanHtml;

  useEffect(() => {
    htmlEle?.current?.addEventListener("tap", () => {}, {});
  }, []);

  return (
    <View className={skyline ? "htmlWrap htmlWrap--skyline" : "htmlWrap"}>
      {meta && <MetaCard meta={meta} />}
      {/* Keep Span reachable for dynamic inline HTML templates, not as a block host. */}
      {skyline && <Span style={{ display: 'none' }} />}
      <View
        ref={htmlEle}
        className='taro-html html'
        dangerouslySetInnerHTML={{ __html: renderHtml }}
      />
    </View>
  );
};
export default HtmlRender;
