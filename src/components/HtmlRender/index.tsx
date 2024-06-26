import { View } from "@tarojs/components";
import { createRef, useEffect } from "react";
import { TaroElement } from "@tarojs/runtime";
import Taro from "@tarojs/taro";
import "./index.scss";

interface Props {
  html: string;
}

Taro.options.html.transformElement = (
  taroEle: TaroElement,
  htmlEle: HTMLElement,
) => {
  if (htmlEle.tagName === "a") {
    taroEle.tagName = "VIEW";
    taroEle.nodeName = "view";
    taroEle.addEventListener(
      "tap",
      (e) => {
        // if (e.target !== this) {
        //   return;
        // }
        if (taroEle.children.length === 0) {
          Taro.setClipboardData({
            data: taroEle.props.href,
            success: () => {
              Taro.showToast({
                title: "链接已复制！",
                icon: "success",
                duration: 2000,
              }).then();
            },
          }).then();
        }
      },
      {},
    );
  } else if (htmlEle.tagName === "img") {
    // taroEle.setAttribute('mode', 'widthFix');
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

    // el.addEventListener('tap', testOnTap)
    //
    // return () => {
    //   el.removeEventListener('tap', testOnTap)
    // }
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
