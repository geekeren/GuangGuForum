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
    taroEle.setAttribute('mode', 'aspectFit');
    taroEle.addEventListener('tap', () => {
      Taro.setClipboardData({
        data: taroEle.props.href,
        success: function (res) {
          Taro.showToast({
            title: '链接已复制！',
            icon: 'success',
            duration: 2000
          }).then()
        }
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
