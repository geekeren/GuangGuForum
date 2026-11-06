import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as Icons from '../icons';
import * as Urls from '../icons/urls';
import { svgIconSource } from '../svgIcon';
import { BASE_THEME_PALETTES } from '../theme';

const read = (file: string) => readFileSync(resolve(file), 'utf8');
const assets = 'packages/gzk-ui/src/icons/assets';
const rawEntry = () => read('packages/gzk-ui/src/icons/index.ts');
const decode = (value: string) => decodeURIComponent(value.slice('data:image/svg+xml,'.length));

describe('canonical semantic SVG inventory', () => {
  it('exports every local vector in both raw and static entries with no duplicate documents', () => {
    const files = readdirSync(assets).filter(file => file.endsWith('.svg')).sort();
    const rawImports = [...rawEntry().matchAll(/import (\w+) from "\.\/assets\/([^"?]+)\?raw"/g)];
    expect(rawImports.map(match => match[2]).sort()).toEqual(files);
    expect(Object.keys(Icons.ICONS)).toHaveLength(files.length);
    expect(Object.keys(Urls)).toHaveLength(files.length);
    const documents = files.map(file => read(`${assets}/${file}`));
    expect(new Set(documents).size).toBe(files.length);
    for (const [, name, filename] of rawImports) {
      const document = Icons[name as keyof typeof Icons];
      expect(document).toBe(read(`${assets}/${filename}`));
      expect(Urls[`${name}Url` as keyof typeof Urls]).toBeDefined();
      expect(document).toMatch(/<svg\b[^>]*\bviewBox=/);
      expect(document).not.toMatch(/<image\b|<foreignObject\b|base64|data:image/i);
    }
  });
  it('maps compatibility aliases to canonical constants rather than copied SVGs', () => {
    expect(Icons.LEGACY_ICON_ALIASES['home']).toBe(Icons.Home);
    expect(Icons.LEGACY_ICON_ALIASES['nav-home']).toBe(Icons.Home);
    expect(readdirSync(assets)).not.toContain('nav-home.svg');
    expect(Icons.LEGACY_ICON_ALIASES['arrow-right']).toBe(Icons.ChevronRight);
    expect(Icons.LEGACY_ICON_ALIASES['private-message-envelope']).toBe(Icons.Envelope);
    for (const document of Object.values(Icons.LEGACY_ICON_ALIASES)) expect(Object.values(Icons.ICONS)).toContain(document);
  });
  it('retains distinct outline, active, colored, heart/star and complete boundary variants', () => {
    expect(Icons.AnnouncementFilled).not.toBe(Icons.AnnouncementOutline);
    expect(Icons.Bell).not.toBe(Icons.BellActive);
    expect(Icons.Heart).not.toBe(Icons.Star);
    expect(Icons.DiscoveryHeart).not.toBe(Icons.Heart);
    expect(Icons.Plus).not.toMatch(/<circle|<rect/);
    expect(Icons.PlusCircle).toContain('<circle'); expect(Icons.PlusSquare).toContain('<rect');
    expect(Icons.LEGACY_ICON_ALIASES['composer-add']).toBe(Icons.PlusCircle);
    expect(Icons.LEGACY_ICON_ALIASES['editor-add']).toBe(Icons.PlusSquare);
  });
  it('keeps pure raw/static entry boundaries and excludes application artwork and state', () => {
    const raw = rawEntry(); const urls = read('packages/gzk-ui/src/icons/urls.ts');
    expect(raw).not.toMatch(/@tarojs|react|cache|auth|routes|themePreferences|\.\.\/components/);
    expect(urls).not.toContain('?raw'); expect(urls).not.toMatch(/@tarojs|react|from "\.\/index"/);
    for (const name of ['discovery-scene.svg', 'home-announcement-scene.svg', 'home-pagoda.svg', 'm_default.svg', 'wechat.svg']) {
      expect(readdirSync(assets)).not.toContain(name); expect(read(`src/assets/${name}`).trim()).not.toBe('');
    }
  });
  it.each(['light', 'dark'] as const)('resolves shared Plus and Envelope vector paints in %s without rasterization', theme => {
    const color = BASE_THEME_PALETTES[theme]['text-secondary'];
    for (const svg of [Icons.Plus, Icons.Envelope]) {
      const source = decode(svgIconSource(svg, color));
      expect(source).toContain(color); expect(source).not.toContain('currentColor');
    }
    expect(decode(svgIconSource(Icons.Plus, '#fff'))).toContain('stroke="#fff"');
  });
});

describe('application icon semantics and preserved plus controls', () => {
  it('uses Envelope for all private entrypoints and Bell variants only for notification tabs', () => {
    for (const file of ['src/pages/messages/index.tsx', 'src/pages/messages/PrivateMessageEntry.tsx', 'src/pages/home/notifications/index.tsx']) {
      expect(read(file)).toMatch(/import \{ Envelope as \w+ \} from "gzk-ui\/icons"/);
    }
    const home = read('src/pages/home/index.tsx');
    expect(home).toContain('Bell as NotificationIcon'); expect(home).toContain('BellActive as NotificationActiveIcon');
  });
  it('shares line-only Plus with consumer boundaries and uses canonical topic Collapse', () => {
    const comment = read('src/pages/topicDetail/CommentComposer.tsx');
    expect(comment).toContain('Plus as AddIcon'); expect(comment).not.toContain('PlusCircle as AddIcon');
    const commentCss = read('src/pages/topicDetail/index.scss');
    expect(commentCss).toContain('.commentPopupMore:not(.commentPopupTool--active) .commentPopupToolIcon');
    expect(commentCss).toContain('border: 2rpx solid $text-sub;'); expect(commentCss).toContain('border-radius: 50%;');
    const home = read('src/pages/home/index.tsx');
    expect(home).toContain('Plus as ComposePlusIcon'); expect(home).toContain("<ThemedIcon src={ComposePlusIcon} color='#fff'");
    expect(read('src/pages/home/index.scss')).toMatch(/\.addIcon\s*\{[^}]*border-radius: 50%/);
    const topic = read('src/pages/createTopic/TopicEditor.tsx');
    expect(topic).toContain('Collapse as CollapseIcon'); expect(topic).not.toContain('PlusSquare as AddIcon'); expect(topic).toContain('<topic-format-button');
    expect(Icons.EditorHeading2).not.toBe(Icons.EditorHeading3); expect(Icons.EditorHeading2).not.toBe(Icons.EditorHeading);
  });
});
