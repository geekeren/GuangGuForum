import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("src/components/LoginPrompt/index.tsx", "utf8");
// esbuild downlevels the regex literal to new RegExp(...), matching the
// Android appservice stack trace rather than relying on Node's regex support.
const compiled = transformSync(source, {
  loader: "tsx", format: "cjs", target: "es2015", jsx: "automatic",
}).code;

function renderPrompt(props: { icon: string; iconSrc?: string; title: string; desc: string }) {
  const openLoginModal = vi.fn();
  const module = { exports: {} as any };
  function LegacyRegExp(pattern: string, flags?: string) {
    if (String(pattern).includes("\\p{")) throw new SyntaxError("Invalid property name");
    return new RegExp(pattern, flags);
  }
  runInNewContext(compiled, {
    module, exports: module.exports, RegExp: LegacyRegExp,
    require: (id: string) => {
      if (id === "react/jsx-runtime") {
        const jsx = (type: string, nodeProps: any) => ({ type, props: nodeProps });
        return { jsx, jsxs: jsx };
      }
      if (id === "@tarojs/components") return { View: "view", Text: "text", Image: "image" };
      if (id === "../../utils/auth") return { openLoginModal };
      if (id === "./index.scss") return {};
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return { tree: module.exports.default(props), openLoginModal };
}

function find(tree: any, className: string): any {
  if (!tree || typeof tree !== "object") return undefined;
  if (tree.props?.className === className) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = find(child, className);
    if (match) return match;
  }
}

describe("logged-out prompt on Android engines without Unicode property escapes", () => {
  it("does not emit the unsupported Emoji_Presentation property", () => {
    expect(compiled).not.toContain("Emoji_Presentation");
  });
  it.each(["早", "关注", "消息"])("renders the current text badge: %s", (icon) => {
    const { tree } = renderPrompt({ icon, title: "未登录", desc: "请登录" });
    const badge = find(tree, "loginPromptBadge");
    expect(badge.type).toBe("view");
    expect(badge.props.children.type).toBe("text");
    expect(badge.props.children.props.children).toBe(icon);
    expect(find(tree, "loginPromptTitle").props.children).toBe("未登录");
  });
  it("keeps the SVG icon instead of the text badge", () => {
    const { tree } = renderPrompt({ icon: "消息", iconSrc: "notification.svg", title: "未登录", desc: "请登录" });
    const image = find(tree, "loginPromptBadgeIcon");
    expect(image.type).toBe("image");
    expect(image.props.src).toBe("notification.svg");
    expect(image.props.svg).toBe(true);
  });
  it("still opens the login modal when the login button is tapped", () => {
    const { tree, openLoginModal } = renderPrompt({ icon: "早", title: "未登录", desc: "请登录" });
    find(tree, "loginPromptBtn").props.onClick();
    expect(openLoginModal).toHaveBeenCalledOnce();
  });
});
