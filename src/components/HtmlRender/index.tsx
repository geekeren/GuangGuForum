import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { createRef, useEffect, useMemo } from "react";
import { TaroElement } from "@tarojs/runtime";
import { linkHandler, isUserMentionLink } from "../../utils/linkHandler";
import "./index.scss";

interface TopicMeta {
  type: "repost" | "event" | "dating";
  sourceUrl?: string;
  time?: string;
  location?: string;
  gender?: string;
  age?: string;
}

function parseTopicMeta(html: string): { meta: TopicMeta | null; cleanHtml: string } {
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

Taro.options.html.transformElement = (
  taroEle: TaroElement,
  htmlEle: HTMLElement,
) => {
  console.log('htmlEle', htmlEle.tagName, htmlEle, taroEle.tagName);
  if(htmlEle.tagName === 'p') {
    taroEle.tagName = "TEXT";
    taroEle.nodeName = "text";
  } else if (htmlEle.tagName === "a") {
    const href = taroEle.props.href || "";

    const isMention = isUserMentionLink(href);

    if (isMention) {
      taroEle.tagName = "TEXT";
      taroEle.nodeName = "text";
    } else {
      taroEle.tagName = "TEXT";
      taroEle.nodeName = "text";
    }
    taroEle.setAttribute(
      "class",
      isMention ? "html-link html-link--mention" : "html-link html-link--external",
    );
    if (!isMention) {
      const originalText = taroEle.text || "";
      taroEle.text = "↗ " + originalText;
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
    taroEle.setAttribute("lazyLoad", true);
    taroEle.addEventListener(
      "load",
      (e) => {
        const { width, height } = e?.target;
        if (width < 300) {
          taroEle.setAttribute(
            "style",
            `width: ${width}px; height: ${height}px`,
          );
        } else {
          taroEle.setAttribute(
            "style",
            `width: 300px; height: ${(height / width) * 300}px`,
          );
          taroEle.addEventListener(
            "tap",
            (e) => {
              Taro.previewImage({
                urls: [taroEle.props.src],
              }).then();
              e.stopPropagation();
            },
            {},
          );
        }
      },
      {},
    );
    taroEle.addEventListener(
      "error",
      () => {
        taroEle.setAttribute("style", `width: 20px; height: 20px`);
      },
      {},
    );
  } else if (htmlEle.tagName === "span") {
    if (taroEle.children.length !== 0) {
      taroEle.tagName = "VIEW";
      taroEle.nodeName = "view";
    }
  }
  return taroEle;
};

const MetaCard = ({ meta }: { meta: TopicMeta }) => {
  if (meta.type === "repost") {
    return (
      <View className="metaCard metaCard--repost">
        <Text className="metaCardTag">转载</Text>
        <Text className="metaCardLink" onClick={() => meta.sourceUrl && linkHandler(meta.sourceUrl)}>
          {meta.sourceUrl || "查看原文"}
        </Text>
      </View>
    );
  }
  if (meta.type === "event") {
    return (
      <View className="metaCard metaCard--event">
        <Text className="metaCardTag">活动</Text>
        <View className="metaCardInfo">
          <Text className="metaCardRow">📅 {meta.time}</Text>
          <Text className="metaCardRow">📍 {meta.location}</Text>
        </View>
      </View>
    );
  }
  if (meta.type === "dating") {
    return (
      <View className="metaCard metaCard--dating">
        <Text className="metaCardTag">相亲贴</Text>
        <View className="metaCardInfo">
          <Text className="metaCardRow">👤 {meta.gender}　🎂 {meta.age}</Text>
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

  useEffect(() => {
    htmlEle?.current?.addEventListener("tap", () => {}, {});
  }, []);

  return (
    <View className="htmlWrap">
      {meta && <MetaCard meta={meta} />}
      <View
        ref={htmlEle}
        className="taro-html html"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </View>
  );
};
export default HtmlRender;
