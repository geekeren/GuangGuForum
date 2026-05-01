import { WebView } from "@tarojs/components";
import { useEffect, useState } from "react";
import "./index.scss";

const WebviewPage = () => {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedUrl = params.get("url");
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
