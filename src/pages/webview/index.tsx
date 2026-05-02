import { WebView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState, useEffect } from "react";
import "./index.scss";

const WebviewPage = () => {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const instance = Taro.getCurrentInstance();
    const encodedUrl = instance?.router?.params?.url;
    if (encodedUrl) {
      try {
        const decodedUrl = decodeURIComponent(encodedUrl);
        if (decodedUrl.startsWith("http://") || decodedUrl.startsWith("https://")) {
          setUrl(decodedUrl);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  if (!url) return null;

  return <WebView src={url} />;
};

export default WebviewPage;
