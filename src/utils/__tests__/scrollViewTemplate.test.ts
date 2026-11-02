import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { Weapp } = require('@tarojs/plugin-platform-weapp');
const { getComponentsAlias } = require('@tarojs/shared');
const applyViteHooks = require('../../../config/viteHooks.js');
const originalEnv = process.env.TARO_ENV;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.TARO_ENV;
  else process.env.TARO_ENV = originalEnv;
});

function setupTemplate(rendererEnv = 'weapp') {
  const platform = new Weapp({ helper: require('@tarojs/helper') }, {}, {});
  platform.modifyTemplate({});
  const template = platform.template;
  const originalComponents = structuredClone(template.internalComponents);
  const originalAliases = getComponentsAlias(originalComponents);
  const viteConfig = {};
  process.env.TARO_ENV = rendererEnv;
  applyViteHooks({
    modifyViteConfig: (hook: Function) => hook({
      viteConfig,
      viteCompilerContext: { taroConfig: { template } },
    }),
  });
  return { template, originalComponents, originalAliases, viteConfig };
}

describe('ScrollView template compatibility', () => {
  it('does not change the component table or runtime attribute aliases', () => {
    const { template, originalComponents, originalAliases } = setupTemplate();
    expect(template.internalComponents).toEqual(originalComponents);
    expect(getComponentsAlias(template.internalComponents)).toEqual(originalAliases);
    expect(originalAliases['scroll-view'].keyboardDismissMode).toBeUndefined();
  });

  it('adds keyboard dismissal only after aliases are generated, including early page emission', () => {
    const { template, originalAliases } = setupTemplate();
    template.buildPageTemplate('./base');
    const scroll = template.miniComponents['scroll-view'];
    const aliases = originalAliases['scroll-view'];
    expect(scroll['scroll-x']).toContain(`i.${aliases.scrollX}`);
    expect(scroll['scroll-y']).toContain(`i.${aliases.scrollY}`);
    expect(scroll.type).toContain(`i.${aliases.type}`);
    expect(scroll['keyboard-dismiss-mode']).toBe("i.keyboardDismissMode||'none'");
    expect(template.miniComponents.view['keyboard-dismiss-mode']).toBeUndefined();
  });

  it('preserves an existing platform property hook and its receiver', () => {
    const platform = new Weapp({ helper: require('@tarojs/helper') }, {}, {});
    platform.modifyTemplate({});
    const template = platform.template;
    template.modifyCompProps = function (name: string, props: object) {
      expect(this).toBe(template);
      return name === 'scroll-view' ? { ...props, bounces: 'false' } : props;
    };
    process.env.TARO_ENV = 'weapp';
    applyViteHooks({
      modifyViteConfig: (hook: Function) => hook({
        viteConfig: {},
        viteCompilerContext: { taroConfig: { template } },
      }),
    });
    expect(template.modifyCompProps('scroll-view', {})).toEqual({
      bounces: 'false',
      'keyboard-dismiss-mode': "'none'",
    });
  });

  it('leaves non-WeChat templates unchanged', () => {
    const { template, viteConfig } = setupTemplate('h5');
    expect(template.modifyCompProps).toBeUndefined();
    expect(viteConfig).toEqual({});
  });
});
