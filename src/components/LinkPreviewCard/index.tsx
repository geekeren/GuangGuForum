import { View } from "@tarojs/components";
import { useMemo } from "react";
import type { LinkSummary } from "guanggu-forum-api";
import MarkdownRender from "../MarkdownRender";
import { htmlToMarkdown } from "../../utils/htmlToMarkdown";
import { LinkPreviewHeader } from "./Header";

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

interface LinkPreviewCardProps {
  summary: LinkSummary;
  url?: string;
}

const LinkPreviewCard = ({ summary, url }: LinkPreviewCardProps) => {
  const markdown = useMemo(() => {
    let md = "";
    if (summary.bodyHtml) md = htmlToMarkdown(summary.bodyHtml);
    else if (summary.bodyText) md = summary.bodyText;
    else md = summary.description || "";
    return dedupMarkdown(md, summary.title, summary.image);
  }, [summary.bodyHtml, summary.bodyText, summary.description, summary.title, summary.image]);

  return (
    <View>
      <LinkPreviewHeader summary={summary} url={url} />
      {markdown && <MarkdownRender content={markdown} />}
    </View>
  );
};

export default LinkPreviewCard;
