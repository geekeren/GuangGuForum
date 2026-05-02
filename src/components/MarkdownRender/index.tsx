import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo } from "react";
import { linkHandler } from "../../utils/linkHandler";
import "./index.scss";

interface MarkdownRenderProps {
  content: string;
}

type MdNode =
  | { type: "heading"; level: number; children: MdNode[] }
  | { type: "paragraph"; children: MdNode[] }
  | { type: "text"; value: string }
  | { type: "bold"; children: MdNode[] }
  | { type: "italic"; children: MdNode[] }
  | { type: "strikethrough"; children: MdNode[] }
  | { type: "link"; href: string; children: MdNode[] }
  | { type: "image"; src: string; alt: string }
  | { type: "code"; value: string }
  | { type: "codeBlock"; lang: string; value: string }
  | { type: "list"; ordered: boolean; items: MdNode[][] }
  | { type: "blockquote"; children: MdNode[] }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "linebreak" };

function parseInline(text: string): MdNode[] {
  const nodes: MdNode[] = [];
  let rest = text;

  while (rest) {
    // Linked image [![alt](imgSrc)](href)
    let m = rest.match(/^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/);
    if (m) {
      nodes.push({ type: "link", href: m[3], children: [{ type: "image", alt: m[1], src: m[2] }] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Image ![alt](src)
    m = rest.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (m) {
      nodes.push({ type: "image", alt: m[1], src: m[2] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Link [text](href)
    m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (m) {
      nodes.push({ type: "link", href: m[2], children: parseInline(m[1]) });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Bold **text** or __text__
    m = rest.match(/^(\*\*|__)(.+?)\1/);
    if (m) {
      nodes.push({ type: "bold", children: parseInline(m[2]) });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Italic *text* or _text_
    m = rest.match(/^(\*|_)(.+?)\1/);
    if (m) {
      nodes.push({ type: "italic", children: parseInline(m[2]) });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Strikethrough ~~text~~
    m = rest.match(/^~~(.+?)~~/);
    if (m) {
      nodes.push({ type: "strikethrough", children: parseInline(m[1]) });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Inline code `text`
    m = rest.match(/^`([^`]+)`/);
    if (m) {
      nodes.push({ type: "code", value: m[1] });
      rest = rest.slice(m[0].length);
      continue;
    }

    // Plain text
    const nextSpecial = rest.search(/(!\[|\[|\*\*|__|\*|_|~~|`)/);
    if (nextSpecial === -1) {
      nodes.push({ type: "text", value: rest });
      break;
    }
    if (nextSpecial > 0) {
      nodes.push({ type: "text", value: rest.slice(0, nextSpecial) });
      rest = rest.slice(nextSpecial);
    } else {
      nodes.push({ type: "text", value: rest[0] });
      rest = rest.slice(1);
    }
  }

  return nodes;
}

function parseMarkdown(md: string): MdNode[] {
  const nodes: MdNode[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push({ type: "codeBlock", lang, value: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      nodes.push({
        type: "heading",
        level: headingMatch[1].length,
        children: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      nodes.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      const blockMd = parseMarkdown(quoteLines.join("\n"));
      nodes.push({ type: "blockquote", children: blockMd });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: MdNode[][] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*+]\s+/, "")));
        i++;
      }
      nodes.push({ type: "list", ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: MdNode[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\d+\.\s+/, "")));
        i++;
      }
      nodes.push({ type: "list", ordered: true, items });
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*-+/.test(lines[i + 1])) {
      const headers = line.split("|").map((c) => c.trim()).filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map((c) => c.trim()).filter(Boolean));
        i++;
      }
      nodes.push({ type: "table", headers, rows });
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("# ") &&
      !lines[i].startsWith("> ") &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      nodes.push({ type: "paragraph", children: parseInline(paraLines.join(" ")) });
    }
  }

  return nodes;
}

function RenderInlineNodes({ nodes }: { nodes: MdNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <Text key={i}>{node.value}</Text>;
          case "bold":
            return (
              <Text key={i} className="md-bold">
                <RenderInlineNodes nodes={node.children} />
              </Text>
            );
          case "italic":
            return (
              <Text key={i} className="md-italic">
                <RenderInlineNodes nodes={node.children} />
              </Text>
            );
          case "strikethrough":
            return (
              <Text key={i} className="md-strikethrough">
                <RenderInlineNodes nodes={node.children} />
              </Text>
            );
          case "code":
            return <Text key={i} className="md-inline-code">{node.value}</Text>;
          case "link": {
            const hasImage = node.children.some((c) => c.type === "image");
            if (hasImage) {
              return (
                <View key={i} className="md-linked-image" onClick={() => linkHandler(node.href)}>
                  <RenderInlineNodes nodes={node.children} />
                </View>
              );
            }
            return (
              <Text
                key={i}
                className="md-link"
                onClick={() => linkHandler(node.href)}
              >
                <RenderInlineNodes nodes={node.children} />
              </Text>
            );
          }
          case "image":
            return (
              <Image
                key={i}
                className="md-image"
                src={node.src}
                mode="widthFix"
                onClick={() => Taro.previewImage({ urls: [node.src] })}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function RenderNodes({ nodes }: { nodes: MdNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "heading":
            return (
              <View key={i} className={`md-heading md-h${node.level}`}>
                <RenderInlineNodes nodes={node.children} />
              </View>
            );
          case "paragraph":
            return (
              <View key={i} className="md-paragraph">
                <RenderInlineNodes nodes={node.children} />
              </View>
            );
          case "hr":
            return <View key={i} className="md-hr" />;
          case "blockquote":
            return (
              <View key={i} className="md-blockquote">
                <RenderNodes nodes={node.children} />
              </View>
            );
          case "codeBlock":
            return (
              <View key={i} className="md-code-block">
                <Text className="md-code-text">{node.value}</Text>
              </View>
            );
          case "list":
            return (
              <View key={i} className="md-list">
                {node.items.map((item, j) => (
                  <View key={j} className="md-list-item">
                    <Text className="md-list-bullet">
                      {node.ordered ? `${j + 1}.` : "•"}
                    </Text>
                    <View className="md-list-content">
                      <RenderInlineNodes nodes={item} />
                    </View>
                  </View>
                ))}
              </View>
            );
          case "table":
            return (
              <View key={i} className="md-table">
                <View className="md-table-header">
                  {node.headers.map((h, j) => (
                    <Text key={j} className="md-table-cell md-table-header-cell">{h}</Text>
                  ))}
                </View>
                {node.rows.map((row, j) => (
                  <View key={j} className="md-table-row">
                    {row.map((cell, k) => (
                      <Text key={k} className="md-table-cell">{cell}</Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

const MarkdownRender = ({ content }: MarkdownRenderProps) => {
  const nodes = useMemo(() => parseMarkdown(content), [content]);

  return (
    <View className="markdown-body">
      <RenderNodes nodes={nodes} />
    </View>
  );
};

export default MarkdownRender;
