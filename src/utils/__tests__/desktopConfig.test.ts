import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function appConfig() {
  const source = readFileSync('src/app.config.ts', 'utf8');
  const json = source.replace(/^export default defineAppConfig\(/, '').replace(/\);\s*$/, '');
  // The app configuration is a literal; evaluate only this checked-in local fixture.
  return Function(`return (${json});`)();
}

describe('native desktop app configuration', () => {
  it('enables resize and frameset at the root without replacing the two-package routes', () => {
    const config = appConfig();
    expect(config.resizable).toBe(true);
    expect(config.frameset).toBe(true);
    expect(config.window).not.toHaveProperty('resizable');
    expect(config.window).not.toHaveProperty('frameset');
    expect(config.pages[0]).toBe('pages/home/index');
    expect(config.pages).toContain('pages/topicDetail/index');
    expect(config.subPackages).toHaveLength(1);
    expect(config.subPackages[0].root).toBe('pages/secondary');
    expect(config.preloadRule['pages/home/index']).toEqual({ network: 'all', packages: ['secondary'] });
  });
  it('registers the existing native editor toolbar on Home without changing mobile renderer or routes', () => {
    const home = readFileSync('src/pages/home/index.config.ts', 'utf8');
    expect(home).toMatch(/renderer:\s*["']skyline["']/);
    expect(home).toContain("'topic-format-button': '../../native-components/topic-format-button/index'");
    expect(home).toContain('enableShareAppMessage: true');
    expect(home).toContain('enableShareTimeline: true');
    expect(home).toContain('disableScroll: true');
    expect(home).not.toMatch(/renderer:\s*["']webview["']/);
  });
  it('retains Skyline/glass-easel and the native editor WebView exception', () => {
    const config = appConfig();
    expect(config.renderer).toBe('skyline');
    expect(config.componentFramework).toBe('glass-easel');
    expect(config.lazyCodeLoading).toBe('requiredComponents');
    expect(config.window.navigationStyle).toBe('custom');
    expect(readFileSync('src/pages/createTopic/index.config.ts', 'utf8')).toMatch(/renderer:\s*["']webview["']/);
  });
});
