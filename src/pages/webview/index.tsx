import { WebView } from "@tarojs/components";
import { useState, useEffect } from "react";
import { usePageRouter } from "../../hooks/usePageScope";
import "./index.scss";

const WebviewPage = () => {
  const router = usePageRouter();
  const [url, setUrl] = useState("");

  useEffect(() => {
    const encodedUrl = router.params.url;
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
  }, [router.params.url]);

  if (!url) return null;

  return <WebView src={url} />;
};

export default WebviewPage;
