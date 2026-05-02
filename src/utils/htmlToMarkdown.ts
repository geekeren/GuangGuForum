import { parse, HTMLElement, TextNode, NodeType } from "node-html-parser";

const SKIP_TAGS = new Set([
  "script", "style", "noscript", "nav", "footer", "aside",
  "iframe", "svg", "form", "button", "input", "select", "textarea",
]);

function convertNode(node: HTMLElement | TextNode, listDepth = 0): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = (node as TextNode).text;
    return text.replace(/\s+/g, " ");
  }

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();

  const children = () =>
    el.childNodes.map((c) => convertNode(c as HTMLElement | TextNode, listDepth)).join("");

  if (SKIP_TAGS.has(tag)) return "";
  if (!tag) return children();

  switch (tag) {
    case "h1": return `\n\n# ${children().trim()}\n\n`;
    case "h2": return `\n\n## ${children().trim()}\n\n`;
    case "h3": return `\n\n### ${children().trim()}\n\n`;
    case "h4": return `\n\n#### ${children().trim()}\n\n`;
    case "h5": return `\n\n##### ${children().trim()}\n\n`;
    case "h6": return `\n\n###### ${children().trim()}\n\n`;

    case "p": return `\n\n${children().trim()}\n\n`;
    case "br": return "\n";
    case "hr": return "\n\n---\n\n";

    case "strong":
    case "b": return `**${children()}**`;
    case "em":
    case "i": return `*${children()}*`;
    case "del":
    case "s":
    case "strike": return `~~${children()}~~`;

    case "a": {
      const href = el.getAttribute("href") || "";
      const text = children().trim();
      if (!href || href.startsWith("#")) return text;
      return `[${text}](${href})`;
    }

    case "img": {
      const src = el.getAttribute("src") || el.getAttribute("data-src") || "";
      const alt = el.getAttribute("alt") || "";
      if (!src) return "";
      return `![${alt}](${src})`;
    }

    case "ul":
    case "ol": {
      const items = el.childNodes
        .filter((c) => (c as HTMLElement).tagName?.toLowerCase() === "li")
        .map((c, i) => {
          const prefix = tag === "ol" ? `${i + 1}. ` : "- ";
          const content = convertNode(c as HTMLElement, listDepth + 1).trim();
          const indented = content
            .split("\n")
            .map((line, j) => (j === 0 ? line : "  " + line))
            .join("\n");
          return prefix + indented;
        });
      return `\n\n${items.join("\n")}\n\n`;
    }

    case "li": return children();

    case "blockquote": {
      const content = children().trim();
      return `\n\n${content.split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
    }

    case "code": {
      if (el.parentNode && (el.parentNode as HTMLElement).tagName?.toLowerCase() === "pre") {
        return children();
      }
      return `\`${children()}\``;
    }

    case "pre": {
      const lang = el.querySelector("code")?.getAttribute("class")?.replace("language-", "") || "";
      const code = children().trim();
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case "table": {
      return convertTable(el);
    }

    case "section":
    case "article":
    case "main":
      return `\n\n${children().trim()}\n\n`;

    case "div":
    case "header":
    case "span":
    case "figure":
    case "figcaption":
    case "details":
    case "summary":
    case "time":
    case "small":
    case "mark":
    case "abbr":
    case "cite":
    case "dfn":
    case "var":
    case "kbd":
    case "samp":
    case "sub":
    case "sup":
    case "u":
    case "ins":
      return children();

    default:
      return children();
  }
}

function convertTable(table: HTMLElement): string {
  const rows = table.querySelectorAll("tr");
  if (rows.length === 0) return "";

  const result: string[][] = [];
  for (const row of rows) {
    const cells = row.querySelectorAll("th, td");
    result.push(cells.map((c) => convertNode(c).trim().replace(/\|/g, "\\|").replace(/\n/g, " ")));
  }

  if (result.length === 0) return "";

  const colCount = Math.max(...result.map((r) => r.length));
  for (const row of result) {
    while (row.length < colCount) row.push("");
  }

  const header = `| ${result[0].join(" | ")} |`;
  const separator = `| ${result[0].map(() => "---").join(" | ")} |`;
  const body = result
    .slice(1)
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");

  return `\n\n${header}\n${separator}\n${body}\n\n`;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return "";

  const root = parse(html);
  let md = convertNode(root);

  const lines = md.split("\n");

  // 剔除纯符号行（没有字母/数字/CJK字符的行）
  const filtered = lines.filter((line) => /[\p{L}\p{N}]/u.test(line));

  // 从尾部剔除连续的短行（≤15字），这些通常是署名/来源/版权声明
  while (filtered.length > 0) {
    const last = filtered[filtered.length - 1].trim();
    if (last.length <= 15) {
      filtered.pop();
    } else {
      break;
    }
  }

  md = filtered.join("\n\n");
  // collapse multiple blank lines
  md = md.replace(/\n{3,}/g, "\n\n");
  // trim leading/trailing whitespace
  md = md.trim();

  return md;
}
