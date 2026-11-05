import { View, Text, Image } from "@tarojs/components";
import type { LinkSummary } from "guanggu-forum-api";
import { usePageRenderer } from "../../hooks/usePageRenderer";
import "./index.scss";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface LinkPreviewHeaderProps {
  summary: LinkSummary;
  url?: string;
}

export const LinkPreviewHeader = ({ summary, url }: LinkPreviewHeaderProps) => {
  const skyline = usePageRenderer() === "skyline";
  const displayUrl = url || summary.url;

  return (
    <View className={`linkPreviewCard${skyline ? " linkPreviewCard--skyline" : ""}`}>
      {summary.image ? (
        <View className="previewBanner">
          <Image className="previewBannerImg" src={summary.image} mode="aspectFill" />
          <View className="previewBannerOverlay">
            <View className="previewSite">
              {summary.favicon ? (
                <Image className="previewFavicon" src={summary.favicon} />
              ) : (
                <View className="previewFaviconPlaceholder">
                  <Text className="previewFaviconText">{(summary.siteName || getHostname(displayUrl))[0]?.toUpperCase()}</Text>
                </View>
              )}
              <Text className="previewSiteName">
                {summary.siteName || getHostname(displayUrl)}
              </Text>
            </View>
            {summary.title && (
              <Text className="previewTitle" {...(skyline ? { overflow: "ellipsis", maxLines: 2 } as const : {})}>{summary.title}</Text>
            )}
          </View>
        </View>
      ) : (
        <View className="previewBody">
          <View className="previewSite">
            {summary.favicon ? (
              <Image className="previewFavicon" src={summary.favicon} />
            ) : (
              <View className="previewFaviconPlaceholder">
                <Text className="previewFaviconText">{(summary.siteName || getHostname(displayUrl))[0]?.toUpperCase()}</Text>
              </View>
            )}
            <Text className="previewSiteName">
              {summary.siteName || getHostname(displayUrl)}
            </Text>
          </View>
          {summary.title && (
            <Text className="previewTitle" {...(skyline ? { overflow: "ellipsis", maxLines: 2 } as const : {})}>{summary.title}</Text>
          )}
        </View>
      )}
    </View>
  );
};
