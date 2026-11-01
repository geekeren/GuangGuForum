// Apply only the WeChat compatibility fixes, not unrelated top-level config.
module.exports = (ctx) => {
  ctx.modifyViteConfig(({ viteConfig, viteCompilerContext }) => {
    if (process.env.TARO_ENV !== "weapp") return;
    // Skyline requires :: pseudo-elements; CSS minification rewrites them to :.
    viteConfig.build = viteConfig.build || {};
    viteConfig.build.cssMinify = false;
    const template = viteCompilerContext.taroConfig.template;
    // Match regular Text: generate every floor, then use Taro's comp fallback.
    template.nestElements = new Map(template.nestElements);
    template.nestElements.set("static-text", -1);
  });
};
