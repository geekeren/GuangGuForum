import { View } from "@tarojs/components";
import { createRef, useEffect } from "react";
import { TaroElement } from "@tarojs/runtime";
import Taro from "@tarojs/taro";
import './index.scss';

interface Props {
  html: string;
}

Taro.options.html.transformElement = (taroEle: TaroElement, htmlEle: HTMLElement) => {
  if (htmlEle.tagName === 'a') {
    taroEle.tagName = 'VIEW';
    taroEle.nodeName = 'view';
    taroEle.addEventListener('tap', () => {
      if (taroEle.children.length === 0) {
        Taro.setClipboardData({
          data: taroEle.props.href,
          success: () => {
            Taro.showToast({
              title: '链接已复制！',
              icon: 'success',
              duration: 2000
            }).then()
          }
        }).then();
      }
    }, {});
  } else if (htmlEle.tagName === 'img') {
    taroEle.setAttribute('mode', 'widthFix');
    taroEle.addEventListener('tap', () => {
      Taro.previewImage({
        urls: [taroEle.props.src]
      }).then();
    }, {});
  }
  return taroEle
}

const HtmlRender = (props: Props) => {
  const { html } = props;
  const htmlEle = createRef<TaroElement>();

  useEffect(() => {

    htmlEle?.current?.addEventListener('tap', () => {
    }, {})


    // el.addEventListener('tap', testOnTap)
    //
    // return () => {
    //   el.removeEventListener('tap', testOnTap)
    // }
  }, []);

  return <View ref={htmlEle} className='taro-html html' dangerouslySetInnerHTML={{ __html: html }} />;
}
export default HtmlRender;
