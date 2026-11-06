// Apply only the WeChat compatibility fixes, not unrelated top-level config.
module.exports = (ctx) => {
  ctx.modifyViteConfig(({ viteConfig, viteCompilerContext }) => {
    if (process.env.TARO_ENV !== "weapp") return;
    // Skyline requires :: pseudo-elements; CSS minification rewrites them to :.
    viteConfig.build = viteConfig.build || {};
    viteConfig.build.cssMinify = false;
    const template = viteCompilerContext.taroConfig.template;
    // Parsed HTML creates Video nodes dynamically. Rollup cannot discover them
    // from rendered component exports; keep their template without mounting an
    // empty player or changing the runtime component/attribute alias table.
    const buildTemplate = template.buildTemplate.bind(template);
    template.buildTemplate = (componentConfig) => {
      if (!componentConfig.includeAll && componentConfig.includes.size) {
        return buildTemplate({
          ...componentConfig,
          includes: new Set([...componentConfig.includes, "video"]),
        });
      }
      // An empty include set already means all components, not video only.
      return buildTemplate(componentConfig);
    };
    // Add unsupported attributes after alias generation. Changing the component
    // table only here shifts pN bindings away from the runtime's scroll aliases.
    const modifyCompProps = template.modifyCompProps?.bind(template);
    template.modifyCompProps = (name, props) => {
      const result = modifyCompProps ? modifyCompProps(name, props) : props;
      return name === "scroll-view" ? { ...result, "keyboard-dismiss-mode": "'none'" } : result;
    };
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
