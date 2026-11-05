import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { APP_ROUTES } from '../appRoutes';

function readConfig(file: string) {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: { default?: any } = {};
  new Function('exports', 'defineAppConfig', 'definePageConfig', output)(exports, (value: unknown) => value, (value: unknown) => value);
  return exports.default;
}

describe('two-package page registration', () => {
  it('keeps the first screen and common functions in the main package', () => {
    const config = readConfig('src/app.config.ts');
    expect(config.pages[0]).toBe('pages/home/index');
    for (const page of ['pages/search/index', 'pages/createTopic/index', 'pages/topicDetail/index']) {
      expect(config.pages).toContain(page);
    }
    expect(config.subPackages).toHaveLength(1);
    expect(config.subPackages[0].root).toBe('pages/secondary');
    expect(config.subPackages[0].independent).not.toBe(true);
    expect(config.preloadRule['pages/home/index']).toEqual({ network: 'all', packages: ['secondary'] });
  });

  it('registers private messages and settings only in the preloaded secondary package', () => {
    const config = readConfig('src/app.config.ts');
    const pack = config.subPackages[0];
    const registered = [...config.pages, ...pack.pages.map((page: string) => `${pack.root}/${page}`)];
    expect(new Set(registered).size).toBe(registered.length);
    for (const path of [APP_ROUTES.messages, APP_ROUTES.messageThread, APP_ROUTES.settings, APP_ROUTES.imageSettings, APP_ROUTES.editProfile]) {
      expect(registered).toContain(path.slice(1));
      expect(config.pages).not.toContain(path.slice(1));
      expect(existsSync(resolve(process.cwd(), `src${path}.tsx`))).toBe(true);
      const page = readConfig(`src${path}.config.ts`);
      expect(page.navigationStyle).toBe('custom');
      expect(page.enablePageMeta).toBe(true);
      expect(page.disableScroll).toBe(true);
    }
    expect(registered).not.toContain('pages/messages/index');
    expect(registered).not.toContain('pages/settings/index');
  });

  it('reuses feature implementations instead of moving or duplicating user drafts', () => {
    for (const page of ['messages/index', 'messages/thread', 'settings/index', 'settings/image-setting', 'settings/edit-profile']) {
      const source = readFileSync(resolve(process.cwd(), `src/pages/secondary/${page}.tsx`), 'utf8');
      expect(source).toContain(`export { default } from '../../${page}'`);
      expect(source).not.toMatch(/clearStorage|removeStorage|setStorage|reLaunch/);
      expect(existsSync(resolve(process.cwd(), `src/pages/${page}.tsx`))).toBe(true);
      expect(readConfig(`src/pages/secondary/${page}.config.ts`)).toEqual(readConfig(`src/pages/${page}.config.ts`));
    }
  });
});
