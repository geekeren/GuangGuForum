import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { createRef, useEffect } from "react";
import { TaroElement } from "@tarojs/runtime";
import { linkHandler, isUserMentionLink } from "../../utils/linkHandler";
import "./index.scss";

interface Props {
  html: string;
}

Taro.options.html.transformElement = (
  taroEle: TaroElement,
  htmlEle: HTMLElement,
) => {
  if (htmlEle.tagName === "a") {
    const href = taroEle.props.href || "";

    const isMention = isUserMentionLink(href);

    if (isMention) {
      taroEle.tagName = "TEXT";
      taroEle.nodeName = "text";
    } else {
      taroEle.tagName = "VIEW";
      taroEle.nodeName = "view";
    }
    taroEle.setAttribute(
      "class",
      isMention ? "html-link html-link--mention" : "html-link html-link--external",
    );
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

const HtmlRender = (props: Props) => {
  const { html } = props;
  const htmlEle = createRef<TaroElement>();

  useEffect(() => {
    htmlEle?.current?.addEventListener("tap", () => {}, {});
  }, []);

  return (
    <View
      ref={htmlEle}
      className="taro-html html"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
export default HtmlRender;
