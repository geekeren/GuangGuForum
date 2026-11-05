import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_CACHE_VERSIONS, createApiCacheEntry, readApiCacheEntry } from '../../../packages/guanggu-forum-api/src/cacheVersions';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('own profile settings public integration', () => {
  it('registers both APIs without invalidating unrelated profile and messaging versions', () => {
    expect(API_CACHE_VERSIONS.getOwnProfileSettings).toBe(1);
    expect(API_CACHE_VERSIONS.saveOwnProfileSettings).toBe(1);
    expect(API_CACHE_VERSIONS.getUserProfile).toBe(2);
    expect(API_CACHE_VERSIONS.getMessageCompose).toBe(2);
    const entry = createApiCacheEntry('getOwnProfileSettings', 'synthetic version fixture');
    expect(readApiCacheEntry('getOwnProfileSettings', entry)).toBe('synthetic version fixture');
    expect(readApiCacheEntry('getOwnProfileSettings', { ...entry, apiVersions: { getOwnProfileSettings: 0 } })).toBeNull();
    expect(readApiCacheEntry('saveOwnProfileSettings', entry)).toBeNull();
  });

  it('exports the settings module and registers an existing settings subpackage page', () => {
    expect(source('packages/guanggu-forum-api/src/index.ts')).toContain('export * from "./user/profileSettings";');
    expect(source('src/app.config.ts')).toMatch(/root:\s*"pages\/settings",\s*name:\s*"settings",\s*pages:\s*\["index", "image-setting", "edit-profile"\]/);
    for (const extension of ['tsx', 'scss', 'config.ts']) {
      expect(existsSync(resolve(process.cwd(), `src/pages/settings/edit-profile.${extension}`))).toBe(true);
    }
  });

  it('does not enroll sensitive settings APIs in the shared HTML reading cache', () => {
    const client = source('packages/guanggu-forum-api/src/client.ts');
    const readingApis = client.match(/const READING_CACHE_APIS = new Set<CacheApi>\(\[([\s\S]*?)\]\)/)?.[1];
    expect(readingApis).toBeDefined();
    expect(readingApis).not.toContain('getOwnProfileSettings');
    expect(readingApis).not.toContain('saveOwnProfileSettings');
  });
});
