/* eslint-disable import/no-commonjs -- Taro loads local PostCSS plugins via require(). */
const postcss = require("postcss");
const valueParser = require("postcss-value-parser");

const SCOPE = ".themePageHost--desktop";
const PREFIX = "--gzk-rpx-";
const DIMENSION = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))rpx$/i;
function tokenName(number) {
  return PREFIX + String(number).replace(/-/g, "n").replace(/\./g, "d");
}

// Runs after pxtransform and fixedReadingFonts. Only length tokens change;
// selector specificity, declaration order and mobile fallback stay intact.
module.exports = function desktopLengths() {
  return {
    postcssPlugin: "guanggu-desktop-lengths",
    OnceExit(root) {
      const tokens = new Map();
      root.walkDecls(decl => {
        if (decl.prop.startsWith(PREFIX) || !/rpx/i.test(decl.value)) return;
        const value = valueParser(decl.value);
        let changed = false;
        value.walk(node => {
          if (node.type === "function") {
            if (node.value.toLowerCase() === "url") return false;
            // Already generated references must not recursively wrap fallbacks.
            if (node.value.toLowerCase() === "var" && node.nodes[0]?.value?.startsWith(PREFIX)) {
              const fallback = node.nodes.find(part => part.type === "word" && DIMENSION.test(part.value));
              if (fallback) {
                const number = Number(fallback.value.match(DIMENSION)[1]);
                tokens.set(tokenName(number), `${number / 2}px`);
              }
              return false;
            }
            return;
          }
          if (node.type !== "word") return;
          const match = node.value.match(DIMENSION);
          if (!match) return;
          const number = Number(match[1]);
          if (!Number.isFinite(number)) return;
          const name = tokenName(number);
          tokens.set(name, `${number / 2}px`);
          node.value = `var(${name}, ${node.value})`;
          changed = true;
        });
        if (changed) decl.value = value.toString();
      });
      if (!tokens.size) return;
      // Each stylesheet contributes its tokens. The same N always has the same
      // value, so common/page/subpackage CSS may load in any order.
      let scope;
      root.each(node => {
        if (node.type === "rule" && node.selector === SCOPE && node.nodes.every(d => d.type === "decl" && d.prop.startsWith(PREFIX))) scope = node;
      });
      if (!scope) {
        scope = postcss.rule({ selector: SCOPE });
        root.append(scope);
      }
      const existing = new Set(scope.nodes.map(d => d.prop));
      for (const [prop, value] of tokens) {
        if (!existing.has(prop)) scope.append(postcss.decl({ prop, value }));
      }
    },
  };
};
