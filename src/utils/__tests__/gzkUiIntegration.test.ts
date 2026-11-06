import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const packageRoot = 'packages/gzk-ui';
const read = (file: string) => readFileSync(file, 'utf8');
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

describe('GzkUi workspace integration boundaries', () => {
  it('links a private source workspace using the installed React and Taro peers', () => {
    const app = JSON.parse(read('package.json'));
    const pkg = JSON.parse(read(`${packageRoot}/package.json`));
    expect(app.workspaces.packages).toContain('packages/*');
    expect(app.dependencies['gzk-ui']).toBe('workspace:^');
    expect(pkg.name).toBe('gzk-ui');
    expect(pkg.private).toBe(true);
    expect(pkg.peerDependencies['@tarojs/components']).toBe(app.dependencies['@tarojs/components']);
    expect(pkg.peerDependencies.react).toBe(app.dependencies.react);
    expect(pkg.dependencies || {}).toEqual({});
    expect(pkg.exports['./theme']).toBe('./src/theme.ts');
    expect(pkg.exports['./svgIcon']).toBe('./src/svgIcon.ts');
    expect(pkg.exports['./loading']).toBe('./src/components/Loading/index.tsx');
    expect(pkg.exports['./tag']).toBe('./src/components/Tag/index.tsx');
    expect(pkg.exports['./icon']).toBe('./src/components/Icon/index.tsx');
    for (const [subpath, target] of Object.entries({
      input: 'components/Input/index.tsx', textarea: 'components/Textarea/index.tsx',
      'native-form': 'components/NativeForm/index.tsx', 'form-field': 'components/FormField/index.tsx',
      select: 'components/Select/index.tsx', icons: 'icons/index.ts', 'icon-urls': 'icons/urls.ts',
    })) {
      expect(pkg.exports[`./${subpath}`]).toBe(`./src/${target}`);
      expect(pkg.typesVersions['*'][subpath]).toEqual([`src/${target}`]);
    }
  });

  it('exports the standard controls at the package boundary without eager static icon URLs', () => {
    const ast = ts.createSourceFile('index.ts', read(`${packageRoot}/src/index.ts`), ts.ScriptTarget.Latest, true);
    const names = new Set(ast.statements.flatMap(node => {
      if (!ts.isExportDeclaration(node) || !node.exportClause || !ts.isNamedExports(node.exportClause)) return [];
      return node.exportClause.elements.map(element => element.name.text);
    }));
    for (const name of ['GzkInput', 'GzkTextarea', 'GzkFormField', 'GzkSelect', 'GzkNativeInput',
      'GzkNativeTextarea', 'GzkPicker', 'GzkButton', 'GzkSwitch', 'GzkRadio', 'GzkRadioGroup']) {
      expect(names.has(name), name).toBe(true);
    }
    for (const file of ['src/index.ts', 'src/icons/index.ts']) {
      expect(read(`${packageRoot}/${file}`)).not.toMatch(/(?:from|import)\s*["'][^"']*(?:icon-urls|icons\/urls|\.\/urls)["']/);
    }
    const urls = read(`${packageRoot}/src/icons/urls.ts`);
    expect(urls).not.toContain('?raw');
    expect(urls).not.toMatch(/components\/|@tarojs\/|svgIconSource/);
  });

  it('routes all ordinary application form controls through the standard UI library', () => {
    const controls = new Set(['Input', 'Textarea', 'Picker', 'Button', 'Switch', 'Radio', 'RadioGroup']);
    for (const file of [...sourceFiles('src/components'), ...sourceFiles('src/pages')]) {
      const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)
          || node.moduleSpecifier.text !== '@tarojs/components') continue;
        const bindings = node.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const binding of bindings.elements) {
          expect(controls.has((binding.propertyName || binding.name).text), `${file}: ${binding.name.text}`).toBe(false);
        }
      }
    }
  });

  it('keeps application-owned illustrations and identity imagery outside the semantic icon library', () => {
    const appAssets = new Set(['discovery-scene.svg', 'home-announcement-scene.svg', 'home-pagoda.svg', 'm_default.svg', 'wechat.svg']);
    for (const file of sourceFiles('src')) {
      const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        const specifier = node.moduleSpecifier;
        if (!specifier || !ts.isStringLiteral(specifier) || !/\.svg(?:\?raw)?$/.test(specifier.text)) continue;
        const asset = specifier.text.split('/').pop()?.replace(/\?raw$/, '') || '';
        expect(appAssets.has(asset), `${file}: ${specifier.text}`).toBe(true);
      }
    }
    for (const asset of appAssets) expect(read(`src/assets/${asset}`).trim()).not.toBe('');
  });

  it('resolves every public source subpath without an application-specific alias', () => {
    const pkg = JSON.parse(read(`${packageRoot}/package.json`));
    for (const subpath of Object.keys(pkg.typesVersions['*'])) {
      const resolved = ts.resolveModuleName(`gzk-ui/${subpath}`, join(process.cwd(), 'src/utils/theme.ts'), {
        moduleResolution: ts.ModuleResolutionKind.Node10,
      }, ts.sys).resolvedModule;
      expect(resolved?.resolvedFileName, subpath).toContain('/packages/gzk-ui/src/');
    }
  });

  it('keeps all production imports inside the UI package or its declared peers', () => {
    const allowed = new Set(['react', 'react/jsx-runtime', '@tarojs/components']);
    for (const file of sourceFiles(`${packageRoot}/src`)) {
      const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        const specifier = node.moduleSpecifier;
        if (!specifier || !ts.isStringLiteral(specifier)) continue;
        if (specifier.text.startsWith('.')) {
          const resolved = join(file, '..', specifier.text);
          expect(resolved.startsWith(`${packageRoot}/src/`), `${file}: ${specifier.text}`).toBe(true);
        } else {
          expect(allowed.has(specifier.text), `${file}: ${specifier.text}`).toBe(true);
        }
      }
    }
  });

  it('owns asset types in the library without duplicating the application declarations', () => {
    const assets = read(`${packageRoot}/src/types/assets.d.ts`);
    const ast = ts.createSourceFile('assets.d.ts', assets, ts.ScriptTarget.Latest, true);
    const modules = new Set(ast.statements.flatMap(node =>
      ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name) ? [node.name.text] : []
    ));
    for (const pattern of ['*.svg', '*.svg?raw', '*.scss', '*.module.scss']) {
      expect(modules.has(pattern), pattern).toBe(true);
    }
    expect(assets).not.toMatch(/@tarojs\/taro|src\/utils|src\/pages/);
    const host = read('types/global.d.ts');
    expect(host).toContain('reference path="../packages/gzk-ui/src/types/assets.d.ts"');
    expect(host).not.toMatch(/declare module ["']\*\.(?:svg(?:\?raw)?|scss|module\.scss)["']/);
    expect(host).toContain('declare namespace JSX');
    expect(host).toContain('declare namespace NodeJS');
    expect(host).toContain('declare module "*.png"');
  });

  it('keeps the Sass compatibility entry and theme/SVG adapters on pure subpaths', () => {
    expect(read('src/vars.scss')).toContain('@import "../packages/gzk-ui/src/styles/tokens";');
    expect(read('src/utils/svgIcon.ts')).toContain('from "gzk-ui/svgIcon"');
    expect(read('src/utils/themePreferences.ts')).toContain('from "gzk-ui/theme"');
    expect(read('src/utils/theme.ts')).toContain('from "gzk-ui/theme"');
    for (const file of ['src/theme.ts', 'src/svgIcon.ts']) {
      expect(read(`${packageRoot}/${file}`)).not.toMatch(/@tarojs\/taro|CacheService|theme_preference|onThemeChange|useTheme/);
    }
    expect(read('src/utils/themePreferences.ts')).toContain('"navigation-surface"');
    expect(read(`${packageRoot}/src/theme.ts`)).not.toMatch(/"(?:navigation-surface|compose-shadow|profile-bg)"/);
  });

  it('checks package sources and tests without changing the native two-package layout', () => {
    expect(read('tsconfig.json')).toContain('"./packages/gzk-ui/src"');
    expect(read('vitest.config.ts')).toContain('packages/gzk-ui/src/**/__tests__/**/*.test.ts');
    const config = read('src/app.config.ts');
    expect(config).toContain('root: "pages/secondary"');
    expect(config).not.toContain('root: "packages/gzk-ui"');
  });
});
