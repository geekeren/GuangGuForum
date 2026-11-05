import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateMessageFileCache, PRIVATE_FILE_TTL, type PrivateMessageFileSystem } from '../privateMessageFileCache';

vi.mock('@tarojs/taro', () => ({ default: {} }));
const peer = { uid: 2, username: 'fixture-peer', display_name: '合成用户', avatar: '/static/avatar/2.png' };
const thread = (id = 1, text = '合成正文') => ({ id, peer, state: 'active', incoming_request: false, can_reopen: false, blocked: false, source: null,
  messages: [{ id: 1, seq: 1, mine: false, text, state: 'approved', created: 'fixture' }], has_more: false });
const list = () => ({ items: [{ id: 1, peer, state: 'active', unread: 1, updated: 'fixture', preview: '合成预览' }], next_cursor: null });
let clock: number;
function fileSystem() {
  const files = new Map<string, { text: string; modified: number }>();
  const reads: string[] = [];
  const fs: PrivateMessageFileSystem = {
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(path => [...files.keys()].filter(key => key.startsWith(`${path}/`)).map(key => key.slice(path.length + 1))),
    readFileSync: vi.fn(path => { reads.push(path); const file = files.get(path); if (!file) throw new Error('ENOENT'); return file.text; }),
    writeFileSync: vi.fn((path, text) => { files.set(path, { text, modified: clock }); }),
    renameSync: vi.fn((from, to) => { const file = files.get(from); if (!file) throw new Error('ENOENT'); files.set(to, file); files.delete(from); }),
    unlinkSync: vi.fn(path => { if (!files.delete(path)) throw new Error('ENOENT'); }),
    statSync: vi.fn(path => { const file = files.get(path); if (!file) throw new Error('ENOENT'); return { size: Buffer.byteLength(file.text, 'utf8'), lastModifiedTime: file.modified }; }),
  };
  const cache = (options = {}) => new PrivateMessageFileCache({ fileSystem: () => fs, root: () => '/fixture', now: () => clock, ...options });
  const path = (uid: number) => `/fixture/guozaoke-private-messages-v1-develop/u-${uid}.json`;
  return { fs, files, reads, cache, path };
}
beforeEach(() => { clock = 1000; });

describe('private completed-response file cache', () => {
  it('persists completed thread/list across a fresh instance with exact UID scope', () => {
    const disk = fileSystem(); const first = disk.cache();
    expect(first.put(7, 'thread:1', thread())).toBe(true); expect(first.put(7, 'list:0', list())).toBe(true);
    const second = disk.cache(); expect(second.get(7, 'thread:1')).toEqual(thread()); expect(second.get(7, 'list:0')).toEqual(list());
    expect(second.get(8, 'thread:1')).toBeUndefined(); expect(disk.files.size).toBe(1);
  });
  it('does not read other users message bodies during capacity scans or own-UID hydration', () => {
    const disk = fileSystem(); const cache = disk.cache(); cache.put(7, 'thread:1', thread()); cache.put(8, 'thread:1', thread(1, 'other fixture'));
    disk.reads.length = 0; cache.get(7, 'thread:1');
    expect(disk.reads).toEqual([disk.path(7)]);
  });
  it('rejects path traversal, malformed scope, unsafe UID and mismatched thread IDs', () => {
    const disk = fileSystem(); const cache = disk.cache();
    for (const scope of ['../thread:1', 'thread:01', 'thread:0', 'list:2', 'compose:1', 'thread:9007199254740992']) expect(cache.put(7, scope, thread())).toBe(false);
    for (const uid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(cache.put(uid, 'thread:1', thread())).toBe(false);
    expect(cache.put(7, 'thread:2', thread(1))).toBe(false); expect(disk.files.size).toBe(0);
  });
  it('whitelists completed response fields and never persists page drafts, cookies, credentials or retry keys', () => {
    const disk = fileSystem(); const value = { ...thread(), draft: 'SECRET_DRAFT', cookies: 'SECRET_COOKIE', clientKey: 'SECRET_KEY',
      peer: { ...peer, credential: 'SECRET_PEER' }, messages: [{ ...thread().messages[0], token: 'SECRET_TOKEN' }] };
    expect(disk.cache().put(7, 'thread:1', value)).toBe(true);
    const raw = disk.files.get(disk.path(7))!.text; expect(raw).not.toContain('SECRET_'); expect(disk.cache().get(7, 'thread:1')).toEqual(thread());
    expect(disk.cache().put(7, 'list:0', { ...list(), draft: 'SECRET_DRAFT' })).toBe(true); expect(disk.files.get(disk.path(7))!.text).not.toContain('SECRET_');
  });
  it('expires at exactly seven days without timers or advancing expiry on reads', () => {
    const disk = fileSystem(); const cache = disk.cache(); cache.put(7, 'thread:1', thread()); clock += PRIVATE_FILE_TTL - 1;
    expect(cache.get(7, 'thread:1')).toEqual(thread()); clock++;
    expect(cache.get(7, 'thread:1')).toBeUndefined();
  });
  it('rejects version mismatch and corrupt or foreign-UID files without returning their payload', () => {
    const disk = fileSystem(); const cache = disk.cache(); cache.put(7, 'thread:1', thread());
    expect(cache.get(7, 'thread:1', 2)).toBeUndefined(); expect(cache.put(7, 'thread:1', thread(), 2)).toBe(false);
    for (const raw of ['not json', JSON.stringify({ version: 2, uid: 7, entries: [] }), JSON.stringify({ version: 1, uid: 8, entries: [] })]) {
      disk.files.set(disk.path(7), { text: raw, modified: clock }); expect(cache.get(7, 'thread:1')).toBeUndefined();
    }
  });
  it('enforces thread capacity and access-order LRU without dropping the separate list scope', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxThreads: 2 });
    cache.put(7, 'thread:1', thread(1)); cache.put(7, 'thread:2', thread(2)); cache.put(7, 'list:0', list()); cache.get(7, 'thread:1'); cache.put(7, 'thread:3', thread(3));
    expect(cache.get(7, 'thread:2')).toBeUndefined(); expect(cache.get(7, 'thread:1')).toBeDefined(); expect(cache.get(7, 'thread:3')).toBeDefined(); expect(cache.get(7, 'list:0')).toBeDefined();
  });
  it('enforces a separate list capacity', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxLists: 1 }); cache.put(7, 'thread:1', thread()); cache.put(7, 'list:0', list()); cache.put(7, 'list:1', list());
    expect(cache.get(7, 'list:0')).toBeUndefined(); expect(cache.get(7, 'list:1')).toBeDefined(); expect(cache.get(7, 'thread:1')).toBeDefined();
  });
  it('preserves protected threads and trims temporary excess on idempotent release', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxThreads: 1 }); const one = cache.protect(7, 'thread:1'); const two = cache.protect(7, 'thread:2');
    cache.put(7, 'thread:1', thread(1)); cache.put(7, 'thread:2', thread(2)); expect(cache.get(7, 'thread:1')).toBeDefined(); expect(cache.get(7, 'thread:2')).toBeDefined();
    one(); one(); expect(cache.get(7, 'thread:1')).toBeUndefined(); expect(cache.get(7, 'thread:2')).toBeDefined(); two();
  });
  it('refcounts duplicate protections across page instances', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxThreads: 1 }); const first = cache.protect(7, 'thread:1'); const second = cache.protect(7, 'thread:1');
    cache.put(7, 'thread:1', thread()); first(); expect(cache.put(7, 'thread:2', thread(2))).toBe(false); expect(cache.get(7, 'thread:1')).toBeDefined();
    second(); expect(cache.put(7, 'thread:2', thread(2))).toBe(true); expect(cache.get(7, 'thread:1')).toBeUndefined();
  });
  it('preserves the last completed file on write/rename failure and naturally retries later', () => {
    const disk = fileSystem(); const cache = disk.cache(); cache.put(7, 'thread:1', thread());
    vi.mocked(disk.fs.renameSync).mockImplementationOnce(() => { throw new Error('rename failed'); });
    expect(cache.put(7, 'thread:1', thread(1, 'new fixture'))).toBe(false); expect(cache.get(7, 'thread:1')).toEqual(thread());
    vi.mocked(disk.fs.writeFileSync).mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(cache.put(7, 'thread:1', thread(1, 'new fixture'))).toBe(false); expect(cache.get(7, 'thread:1')).toEqual(thread());
    expect(cache.put(7, 'thread:1', thread(1, 'new fixture'))).toBe(true); expect(cache.get(7, 'thread:1')).toEqual(thread(1, 'new fixture'));
    expect([...disk.files.keys()].some(path => path.includes('.tmp-'))).toBe(false);
  });
  it('replaces a corrupt cache with a fresh completed response so later retries can recover', () => {
    const disk = fileSystem(); disk.files.set(disk.path(7), { text: 'invalid JSON', modified: clock });
    const cache = disk.cache(); expect(cache.put(7, 'thread:1', thread())).toBe(true); expect(cache.get(7, 'thread:1')).toEqual(thread());
  });
  it('does not overwrite completed scopes when reading the existing file fails transiently', () => {
    const disk = fileSystem(); const cache = disk.cache(); cache.put(7, 'thread:1', thread());
    vi.mocked(disk.fs.readFileSync).mockImplementationOnce(() => { throw new Error('permission denied'); });
    expect(cache.put(7, 'thread:2', thread(2))).toBe(false);
    expect(cache.get(7, 'thread:1')).toEqual(thread());
    expect(cache.put(7, 'thread:2', thread(2))).toBe(true);
    expect(cache.get(7, 'thread:1')).toEqual(thread()); expect(cache.get(7, 'thread:2')).toEqual(thread(2));
  });
  it('fresh instances merge the latest same-UID snapshot instead of overwriting other completed scopes', () => {
    const disk = fileSystem(); const first = disk.cache(); const second = disk.cache(); first.put(7, 'thread:1', thread(1)); second.put(7, 'thread:2', thread(2)); first.put(7, 'list:0', list());
    expect(second.get(7, 'thread:1')).toBeDefined(); expect(second.get(7, 'thread:2')).toBeDefined(); expect(second.get(7, 'list:0')).toBeDefined();
  });
  it('keeps byte usage bounded, rejects oversized entries and retains an earlier protected response', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxBytes: 500 }); const release = cache.protect(7, 'thread:1');
    expect(cache.put(7, 'thread:1', thread())).toBe(true); expect(cache.put(7, 'thread:2', thread(2, '文'.repeat(1000)))).toBe(false);
    expect(cache.get(7, 'thread:1')).toEqual(thread()); expect(disk.fs.statSync(disk.path(7)).size).toBeLessThanOrEqual(500); release();
  });
  it('bounds retained UID files while never evicting active protected users', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxUsers: 2 }); const release = cache.protect(7, 'thread:1'); cache.put(7, 'thread:1', thread()); clock++;
    cache.put(8, 'thread:1', thread()); clock++; cache.put(9, 'thread:1', thread());
    expect(disk.files.has(disk.path(7))).toBe(true); expect(disk.files.has(disk.path(8))).toBe(false); expect(disk.files.has(disk.path(9))).toBe(true); release();
  });
  it('defers user-capacity trimming until protected users release', () => {
    const disk = fileSystem(); const cache = disk.cache({ maxUsers: 1 }); const release7 = cache.protect(7, 'thread:1'); const release8 = cache.protect(8, 'thread:1');
    cache.put(7, 'thread:1', thread()); clock++; cache.put(8, 'thread:1', thread()); expect(disk.files.size).toBe(2); release7(); expect(disk.files.size).toBe(1); release8();
  });
  it('is non-intrusive when filesystem is absent and recovers when it becomes available', () => {
    const disk = fileSystem(); let available = false;
    const cache = new PrivateMessageFileCache({ root: () => '/fixture', fileSystem: () => available ? disk.fs : undefined, now: () => clock });
    expect(cache.put(7, 'thread:1', thread())).toBe(false); expect(cache.get(7, 'thread:1')).toBeUndefined(); available = true;
    expect(cache.put(7, 'thread:1', thread())).toBe(true); expect(cache.get(7, 'thread:1')).toEqual(thread());
  });
});
