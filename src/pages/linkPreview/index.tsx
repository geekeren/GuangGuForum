import { View, ScrollView, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { fetchLinkSummary } from "guanggu-forum-api";
import type { LinkSummary } from "guanggu-forum-api";
import Navbar from "../../components/Navbar";
import Loading from "../../components/Loading";
import LinkPreviewCard from "../../components/LinkPreviewCard";
import { withCache } from "../../utils/cacheRequest";
import { isSkyline } from "../../utils/renderer";
import "./index.scss";

export default function LinkPreview() {
  const router = useRouter();
  const url = decodeURIComponent(router.params.url || "");
  const [summary, setSummary] = useState<LinkSummary | null>(null);
  const [scrollHeight, setScrollHeight] = useState("auto");

  useEffect(() => {
    const sys = Taro.getSystemInfoSync();
    const statusBarH = sys.statusBarHeight || 0;
    const navH = 44 + statusBarH;
    const safeBottom = sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0;
    const btnWrapH = 16 + 20 + 16 + 40 + 20 + safeBottom;
    const available = sys.windowHeight - navH - btnWrapH;
    setScrollHeight(`${available}px`);
  }, []);

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

  const displayTitle = summary?.title || (() => { try { return new URL(url).hostname; } catch { return url; } })();

  return (
    <View className="linkPreviewPage">
      <Navbar back modal={isSkyline()} title="链接预览" />
      <ScrollView scrollY style={{ height: scrollHeight }} className="linkPreviewContent">
        {summary ? (
          <LinkPreviewCard summary={summary} url={url} />
        ) : (
          <Loading />
        )}
      </ScrollView>
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
