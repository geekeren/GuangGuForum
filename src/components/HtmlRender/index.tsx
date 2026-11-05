import { Span, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useRef } from "react";
import { TaroElement } from "@tarojs/runtime";
import { isUserMentionLink, linkChipLabel, linkHandler } from "../../utils/linkHandler";
import "./index.scss";
import { URLS } from "guanggu-forum-api";
import { isSkyline } from "../../utils/renderer";
import { usePageRenderer } from "../../hooks/usePageRenderer";
import LinkChipIcon from "../../assets/link-chip.svg";
import { isCustomStickerUrl } from "../../utils/stickers";

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
  variant?: 'body';
  fullBleedImages?: boolean;
}

function setNodeName(element: TaroElement, name: "text" | "view" | "span") {
  element.tagName = name.toUpperCase();
  element.nodeName = name;
}

// The runtime HTML parser assigns h5tagName; public TaroElement types omit it.
type ParsedHtmlElement = TaroElement & { h5tagName?: string };

const blockTags = new Set(["div", "p", "ul", "ol", "li", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "hr"]);

type BodyImageScope = { active: boolean; fullBleed: boolean };
type ImageState = { src: string; width?: number; height?: number; revision: number };
const bodyImageRoots = new WeakMap<TaroElement, BodyImageScope>();
const imageStates = new WeakMap<TaroElement, ImageState>();
const containedImageTags = new Set(['ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'td', 'th']);

function bodyImageOwner(image: TaroElement) {
  for (let root = image.parentElement; root; root = root.parentElement) {
    const scope = bodyImageRoots.get(root);
    if (scope?.active) return { root, scope };
  }
}

function sizeBodyImage(image: TaroElement) {
  const owner = bodyImageOwner(image);
  const state = imageStates.get(image);
  if (!owner || !state || state.src !== image.props.src) return;
  image.setAttribute('mode', 'aspectFit');
  if (!image.className.split(' ').includes('htmlBodyImage')) image.className += ' htmlBodyImage';
  if (!state.width || !state.height) {
    image.setAttribute('style', 'display: block; width: 100%; height: 180px; max-width: 100%; margin: 12rpx auto');
    return;
  }
  const { root, scope } = owner;
  let parent = image.parentElement;
  while (parent && parent !== root && parent.nodeName !== 'view') parent = parent.parentElement;
  if (!parent) return;
  let contained = false;
  for (let ancestor = image.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
    if (containedImageTags.has((ancestor as ParsedHtmlElement).h5tagName || '')
      || ancestor.style.getPropertyValue('width') || ancestor.style.getPropertyValue('max-width')
      || ['hidden', 'auto'].includes(ancestor.style.getPropertyValue('overflow'))
      || ['hidden', 'auto'].includes(ancestor.style.getPropertyValue('overflow-x'))) contained = true;
  }
  const revision = ++state.revision;
  // Native templates use id=uid||sid. Keep authored ids, with a class fallback for unsafe selectors.
  const measureId = parent.uid || parent.sid;
  let selector = `#${measureId}`;
  if (!/^[A-Za-z_][\w-]*$/.test(measureId)) {
    const measureClass = `htmlImageMeasure-${parent.sid}`;
    if (!parent.className.split(' ').includes(measureClass)) parent.className += ` ${measureClass}`;
    selector = `.${measureClass}`;
  }
  const measuredParent = parent;
  Taro.nextTick(() => {
    if (!scope.active || state.revision !== revision || image.props.src !== state.src
      || bodyImageOwner(image)?.scope !== scope) return;
    const query = Taro.createSelectorQuery();
    query.select(selector).fields({
      rect: true, size: true,
      computedStyle: ['padding-left', 'padding-right', 'border-left-width', 'border-right-width'],
    }, rect => {
      if (!scope.active || state.revision !== revision || image.props.src !== state.src
        || bodyImageOwner(image)?.scope !== scope) return;
      const inset = (key: string) => Math.max(0, parseFloat(rect?.[key]) || 0);
      const leftInset = inset('padding-left') + inset('border-left-width');
      const parentWidth = Number(rect?.width) - leftInset - inset('padding-right') - inset('border-right-width');
      const parentLeft = Number(rect?.left) + leftInset;
      if (!Number.isFinite(parentWidth) || parentWidth <= 0 || !Number.isFinite(parentLeft)) return;
      const window = Taro.getWindowInfo();
      const viewportWidth = Number(window.windowWidth);
      const maxHeight = Number(window.windowHeight) * 0.6;
      if (!Number.isFinite(viewportWidth) || viewportWidth <= 0 || !Number.isFinite(maxHeight) || maxHeight <= 0) return;
      const width = state.width!;
      const height = state.height!;
      const fullBleed = scope.fullBleed && !contained && width >= height && width >= viewportWidth
        && height * viewportWidth / width <= maxHeight;
      const targetWidth = fullBleed ? viewportWidth : parentWidth;
      const scale = Math.min(1, targetWidth / width, maxHeight / height);
      const displayWidth = width * scale;
      const displayHeight = height * scale;
      const marginLeft = fullBleed ? -parentLeft : (parentWidth - displayWidth) / 2;
      // Explicit matching dimensions + aspectFit show the entire image, including tall screenshots.
      image.setAttribute('style', `display: block; width: ${displayWidth}px; height: ${displayHeight}px; max-width: ${fullBleed ? 'none' : '100%'}; margin: 12rpx 0; margin-left: ${marginLeft}px; border-radius: ${fullBleed ? '0' : '8rpx'}`);
      // A linked image must not be clipped by an inline Span/chip formatting context.
      if (fullBleed) {
        for (let ancestor = image.parentElement; ancestor && ancestor !== measuredParent; ancestor = ancestor.parentElement) {
          ancestor.style.setProperty('display', 'block');
        }
      }
    }).exec();
  });
}

function visitBodyImages(root: TaroElement) {
  for (const child of root.children) {
    if (imageStates.has(child)) sizeBodyImage(child);
    visitBodyImages(child);
  }
}

// The HTML parser calls this bottom-up, after attaching transformed children.
function normalizeSkylineElement(element: TaroElement, tagName: string) {
  // Span is an inline text-flow container, not a flex box. A link/mention
  // occupies one inline slot; its single View child owns the chip box styles.
  const classes = element.className.split(" ");
  if (classes.includes("html-link--external") || classes.includes("html-mentionHost")) return;
  const originalChildren = [...element.childNodes];
  type HtmlChild = (typeof originalChildren)[number];
  const isBlock = (child: HtmlChild) => child.nodeName === "view" || blockTags.has((child as ParsedHtmlElement).h5tagName || "");
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
    // View siblings have independent block layout in Skyline. A chip and its
    // surrounding text must share one Span formatting context, not just put a
    // Span around the chip itself. Real blocks/images still end the inline run.
    let fragments: HtmlChild[] = [];
    const flush = () => {
      if (!fragments.length) return;
      const mixed = fragments.some(child => child.nodeName === "span");
      const run = element.ownerDocument.createElement(mixed ? "span" : "text");
      if (mixed) run.className = "htmlInlineFlow";
      element.insertBefore(run, fragments[0]);
      let textRun: TaroElement | null = null;
      for (const child of fragments) {
        if (!mixed || child.nodeName === "span") {
          run.appendChild(child);
          textRun = null;
        } else {
          if (!textRun) {
            textRun = element.ownerDocument.createElement("text");
            run.appendChild(textRun);
          }
          textRun.appendChild(child);
        }
      }
      fragments = [];
    };
    for (const child of children) {
      if (["text", "#text", "span"].includes(child.nodeName) && !isBlock(child)) {
        fragments.push(child);
      } else {
        flush();
      }
    }
    flush();
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
      if (skyline) {
        // Nested Text paints a text-run background, not a rounded/padded box.
        // Use one inline Span slot with a View chip, as with external links.
        const label = taroEle.textContent || "";
        setNodeName(taroEle, "span");
        taroEle.setAttribute("class", "html-mentionHost");
        while (taroEle.firstChild) taroEle.removeChild(taroEle.firstChild);
        const chip = taroEle.ownerDocument.createElement("view");
        chip.setAttribute("class", "html-link html-link--mention");
        const text = taroEle.ownerDocument.createElement("text");
        text.setAttribute("class", "html-mentionLabel");
        text.appendChild(taroEle.ownerDocument.createTextNode(label));
        chip.appendChild(text);
        taroEle.appendChild(chip);
      } else {
        setNodeName(taroEle, "text");
        taroEle.setAttribute("class", "html-link html-link--mention");
      }
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
    const sticker = isCustomStickerUrl(taroEle.props.src || src);
    if (!sticker) imageStates.set(taroEle, { src: taroEle.props.src, revision: 0 });
    taroEle.setAttribute("mode", "widthFix");
    // Skyline images are lazy by default. display:none removes the viewport
    // footprint and can prevent load from ever firing to reveal the image.
    // Keep a real box while loading; widthFix handles narrower parent widths.
    taroEle.setAttribute("lazyLoad", !isSkyline());
    taroEle.setAttribute("style", sticker
      ? "display: inline-block; width: 100px; height: 100px; max-width: 100%"
      : "display: block; width: 300px; height: 180px; max-width: 100%");
    taroEle.addEventListener(
      "load",
      (loadEvent) => {
        // Native image dimensions live in detail; older Taro also mirrors them
        // onto target. Never replace a usable loading box with NaN/zero sizes.
        const width = Number(loadEvent?.detail?.width ?? loadEvent?.target?.width);
        const height = Number(loadEvent?.detail?.height ?? loadEvent?.target?.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        const state = imageStates.get(taroEle);
        if (state) {
          // Native loads may finish before the root effect, or repeat after a cached reload.
          const loadedSrc = loadEvent?.detail?.src;
          if (state.src !== taroEle.props.src || (loadedSrc && loadedSrc !== state.src)) return;
          state.width = width;
          state.height = height;
          if (bodyImageOwner(taroEle)) {
            sizeBodyImage(taroEle);
            return;
          }
        }
        const displayWidth = Math.min(width, 300) / (sticker ? 2 : 1);
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
  if (isSkyline()) {
    normalizeSkylineElement(taroEle, htmlEle.tagName);
  } else if (taroEle.nodeName === "text") {
    // WebView Text cannot render a View link chip. The parser runs bottom-up,
    // so convert only its inline Text ancestors, keeping authored emphasis.
    const containsLinkChip = (element: TaroElement): boolean =>
      element.className.split(" ").includes("html-linkChip") || element.children.some(containsLinkChip);
    if (taroEle.children.some(containsLinkChip)) {
      setNodeName(taroEle, "view");
      taroEle.className += " htmlInlineLinkHost";
    }
  }
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
  const skyline = usePageRenderer() === "skyline";
  const { html } = props;
  const htmlEle = useRef<TaroElement>(null);

  const { meta, cleanHtml } = useMemo(() => parseTopicMeta(html), [html]);
  // Root text has no parser parent; put it in a neutral block for normalization.
  const renderHtml = skyline ? `<div>${cleanHtml}</div>` : cleanHtml;

  useEffect(() => {
    const root = htmlEle.current;
    if (!root || props.variant !== 'body') return;
    const scope = { active: true, fullBleed: !!props.fullBleedImages };
    bodyImageRoots.set(root, scope);
    visitBodyImages(root);
    return () => {
      scope.active = false;
      if (bodyImageRoots.get(root) === scope) bodyImageRoots.delete(root);
    };
  }, [renderHtml, props.variant, props.fullBleedImages]);

  return (
    <View className={`htmlWrap${skyline ? ' htmlWrap--skyline' : ''}${props.variant === 'body' ? ' htmlWrap--body' : ''}`}>
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
