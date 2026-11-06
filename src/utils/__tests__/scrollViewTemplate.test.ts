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

  it('keeps dynamic video templates without changing aliases or the caller include set', () => {
    const { template, originalComponents, originalAliases } = setupTemplate();
    // Match Vite: page emission can initialize aliases before base templates.
    template.buildPageTemplate('./base');
    const componentConfig = {
      includes: new Set(['view', 'text']),
      exclude: new Set(), thirdPartyComponents: new Map(), includeAll: false,
    };
    const output = template.buildTemplate(componentConfig);
    const videoTemplate = output.match(/<video\b[^>]*>/)?.[0] || '';
    expect(videoTemplate).not.toBe('');
    expect(videoTemplate).toContain('binderror="eh"');
    expect(videoTemplate).toContain('bindloadedmetadata="eh"');
    for (const attribute of ['src', 'controls', 'poster']) {
      const expression = videoTemplate.match(new RegExp(`${attribute}="\\{\\{([^\"]+)\\}\\}"`))?.[1];
      expect(expression).toBeDefined();
      expect(expression).toMatch(new RegExp(`\\bi\\.${originalAliases.video[attribute]}\\b`));
    }
    // Boolean attributes retain the platform's default-value wrapper.
    expect(videoTemplate).toContain(`controls="{{xs.b(i.${originalAliases.video.controls},!0)}}"`);
    expect(componentConfig.includes).toEqual(new Set(['view', 'text']));
    expect(template.internalComponents).toEqual(originalComponents);
    expect(getComponentsAlias(template.internalComponents)).toEqual(originalAliases);
  });

  it('preserves empty includes as all components rather than video only', () => {
    const { template } = setupTemplate();
    const output = template.buildTemplate({
      includes: new Set(), exclude: new Set(), thirdPartyComponents: new Map(), includeAll: false,
    });
    expect(output).toContain('<video ');
    expect(output).toContain('<image ');
    expect(output).toContain('<scroll-view ');
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
