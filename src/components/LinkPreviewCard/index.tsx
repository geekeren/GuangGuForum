import { View, Text, Image } from "@tarojs/components";
import { useMemo } from "react";
import type { LinkSummary } from "guanggu-forum-api";
import MarkdownRender from "../MarkdownRender";
import { htmlToMarkdown } from "../../utils/htmlToMarkdown";
import "./index.scss";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface LinkPreviewCardProps {
  summary: LinkSummary;
  url?: string;
}

function dedupMarkdown(md: string, title?: string, image?: string): string {
  let result = md;
  if (title) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`^\\s*#{1,6}\\s+${escaped}\\s*\\n?`), "");
  }
  if (image) {
    const escaped = image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)\\s*`), "");
  }
  return result.trim();
}

const LinkPreviewCard = ({ summary, url }: LinkPreviewCardProps) => {
  const displayUrl = url || summary.url;

  const markdown = useMemo(() => {
    let md = "";
    if (summary.bodyHtml) md = htmlToMarkdown(summary.bodyHtml);
    else if (summary.bodyText) md = summary.bodyText;
    else md = summary.description || "";
    return dedupMarkdown(md, summary.title, summary.image);
  }, [summary.bodyHtml, summary.bodyText, summary.description, summary.title, summary.image]);

  return (
    <View className="linkPreviewCard">
      {summary.image ? (
        <View className="previewBanner">
          <Image className="previewBannerImg" src={summary.image} mode="aspectFill" />
          <View className="previewBannerOverlay">
            <View className="previewSite">
              {summary.favicon ? (
                <Image className="previewFavicon" src={summary.favicon} />
              ) : (
                <View className="previewFaviconPlaceholder">
                  <Text className="previewFaviconText">{(summary.siteName || getHostname(displayUrl))[0]}</Text>
                </View>
              )}
              <Text className="previewSiteName">
                {summary.siteName || getHostname(displayUrl)}
              </Text>
            </View>
            {summary.title && (
              <Text className="previewTitle">{summary.title}</Text>
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
                <Text className="previewFaviconText">{(summary.siteName || getHostname(displayUrl))[0]}</Text>
              </View>
            )}
            <Text className="previewSiteName">
              {summary.siteName || getHostname(displayUrl)}
            </Text>
          </View>
          {summary.title && (
            <Text className="previewTitle">{summary.title}</Text>
          )}
        </View>
      )}
      {markdown && <MarkdownRender content={markdown} />}
    </View>
  );
};

export default LinkPreviewCard;
