// Freeze reading typography at the existing iPhone 15 Pro Max (430 logical px)
// appearance. Run after Taro's unit conversion, leaving layout units untouched.
const READING_SELECTOR = /\.(?:topicDetail|topicList|homeAnnouncement|html|markdown-body|md-|topicTag|notificationsPage|discoveryPage|searchPage|userProfileDetail|hotRank|searchHot)[\w-]*(?=[\s.#:[>+~]|$)/;

module.exports = function fixedReadingFonts({ referenceWidth = 430, designWidth = 750 } = {}) {
  if (!(referenceWidth > 0 && designWidth > 0)) throw new Error("Reading font widths must be positive");
  return {
    postcssPlugin: "guanggu-fixed-reading-fonts",
    OnceExit(root) {
      root.walkDecls("font-size", (decl) => {
        const rule = decl.parent;
        if (rule.type !== "rule") return;
        // The related-topic component uses CSS Modules instead of a page prefix.
        const source = (decl.source?.input.file || "").replace(/\\/g, "/");
        if (!READING_SELECTOR.test(rule.selector) && !source.includes("/pages/topicDetail/relatingTopics/")) return;
        decl.value = decl.value.replace(/(^|[^\w.-])(\d+(?:\.\d+)?)rpx\b/g, (_, boundary, number) => {
          const size = Number(number);
          // Match WeChat's existing whole-pixel rpx conversion on the reference
          // viewport, including subpixel hairlines. Do not enlarge the baseline.
          const pixels = Math.floor(size * referenceWidth / designWidth + 0.0001);
          return `${boundary}${size > 0 && pixels === 0 ? 0.5 : pixels}px`;
        });
      });
    },
  };
};
