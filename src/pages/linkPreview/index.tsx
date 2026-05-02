import { Image, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { fetchLinkSummary, LinkSummary } from "guanggu-forum-api";
import Navbar from "../../components/Navbar";
import Loading from "../../components/Loading";
import { withCache } from "../../utils/cacheRequest";
import { isSkyline } from "../../utils/renderer";
import "./index.scss";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function LinkPreview() {
  const router = useRouter();
  const url = decodeURIComponent(router.params.url || "");
  const [summary, setSummary] = useState<LinkSummary | null>(null);

  useEffect(() => {
    if (!url) return;
    const { cached, refresh } = withCache<LinkSummary>(
      `link_summary_${url}`,
      () => fetchLinkSummary(url),
    );
    if (cached) setSummary(cached);
    refresh.then(setSummary);
  }, [url]);

  const copyLink = () => {
    Taro.setClipboardData({
      data: url,
      success: () =>
        Taro.showToast({ title: "链接已复制，可在浏览器中打开", icon: "none" }),
    });
  };

  const displayTitle = summary?.title || getHostname(url);

  return (
    <View className="linkPreviewPage">
      <Navbar back modal={isSkyline()} title={displayTitle} />
      <View className="linkPreviewContent">
        {summary ? (
          <ScrollView scrollY style={{ height: "100%" }} className="linkPreviewScroll">
            <View className="previewCard">
              {summary.image && (
                <View className="previewBanner">
                  <Image className="previewBannerImg" src={summary.image} mode="aspectFill" />
                </View>
              )}
              <View className="previewBody">
                <View className="previewSite">
                  {summary.favicon ? (
                    <Image className="previewFavicon" src={summary.favicon} />
                  ) : (
                    <View className="previewFaviconPlaceholder">
                      <Text className="previewFaviconText">{(summary.siteName || getHostname(url))[0]}</Text>
                    </View>
                  )}
                  <Text className="previewSiteName">
                    {summary.siteName || getHostname(url)}
                  </Text>
                </View>
                {summary.title && (
                  <Text className="previewTitle" numberOfLines={2}>{summary.title}</Text>
                )}
                {(summary.bodyText || summary.description) && (
                  <Text className="previewBodyText" numberOfLines={5}>{summary.bodyText || summary.description}</Text>
                )}
              </View>
            </View>
          </ScrollView>
        ) : (
          <Loading />
        )}
      </View>
      <View className="copyBtnWrap">
        <View className="sheetTip">
          <Text className="sheetTipText">小程序无法直接打开外部链接，请复制后在浏览器中访问</Text>
        </View>
        <View className="copyBtn" onClick={copyLink}>
          <Text className="copyBtnText">复制链接</Text>
        </View>
      </View>
    </View>
  );
}
