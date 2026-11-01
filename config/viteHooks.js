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
    // Taro 4.1's Vite emitter omits page config when calling this method.
    // Pass enablePageMeta explicitly so native page styles reach Skyline/WebView.
    const buildPageTemplate = template.buildPageTemplate.bind(template);
    template.buildPageTemplate = (basePath, page) => {
      // Vite emits pages before base.wxml initializes component attributes.
      // Use the same initialization as Taro's buildTemplate, without emitting it.
      if (!template.miniComponents) {
        const { getComponentsAlias } = require("@tarojs/shared");
        template.componentsAlias = getComponentsAlias(template.internalComponents);
        template.miniComponents = template.createMiniComponents(template.internalComponents);
      }
      return buildPageTemplate(basePath, page || { content: { enablePageMeta: true } });
    };
  });
};
