import Taro from '@tarojs/taro';
import type { MessageConversationPage, MessagePeer, MessageSource, MessageThread, PrivateMessage } from 'guanggu-forum-api';

export const PRIVATE_FILE_VERSION = 1;
export const PRIVATE_FILE_TTL = 7 * 24 * 60 * 60 * 1000;
const DIRECTORY = 'guozaoke-private-messages-v1';

export interface PrivateMessageFileSystem {
  mkdirSync(path: string, recursive?: boolean): unknown;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): unknown;
  writeFileSync(path: string, data: string, encoding: 'utf8'): unknown;
  renameSync(oldPath: string, newPath: string): unknown;
  unlinkSync(path: string): unknown;
  statSync(path: string): { size: number; lastModifiedTime?: number };
}
interface Options {
  fileSystem?: () => PrivateMessageFileSystem | undefined;
  root?: () => string | undefined;
  now?: () => number;
  ttl?: number;
  maxThreads?: number;
  maxLists?: number;
  maxBytes?: number;
  maxUsers?: number;
}
interface Entry { scope: string; version: number; expires: number; accessed: number; value: MessageConversationPage | MessageThread; }
interface Snapshot { version: number; uid: number; entries: Entry[]; }

function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid cache shape');
  return value as Record<string, unknown>;
}
function string(value: unknown, limit = 4096): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid cache field');
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error('Invalid cache number');
  return value as number;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid cache flag');
  return value;
}
function array<T>(value: unknown, parse: (input: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('Invalid cache array');
  return value.map(parse);
}
function peer(value: unknown): MessagePeer {
  const p = record(value);
  return { uid: integer(p.uid, 1), username: string(p.username), display_name: string(p.display_name), avatar: string(p.avatar) };
}
function source(value: unknown): MessageSource | null {
  if (value === null) return null;
  const s = record(value);
  return { id: integer(s.id, 1), title: string(s.title), url: string(s.url) };
}
function message(value: unknown): PrivateMessage {
  const m = record(value);
  return { id: integer(m.id, 1), seq: integer(m.seq, 1), mine: boolean(m.mine), text: string(m.text, 16000), state: string(m.state), created: string(m.created) };
}
function validScope(scope: string): boolean { return scope === 'list:0' || scope === 'list:1' || /^thread:[1-9]\d*$/.test(scope) && positive(Number(scope.slice(7))); }

/** Project completed API responses only: never serialize page state, credentials or retry keys. */
function payload(scope: string, input: unknown): MessageConversationPage | MessageThread {
  const value = record(input);
  if (scope.startsWith('list:')) {
    return { items: array(value.items, item => {
      const c = record(item);
      return { id: integer(c.id, 1), peer: peer(c.peer), unread: integer(c.unread), state: string(c.state), updated: string(c.updated), preview: string(c.preview, 16000) };
    }), next_cursor: value.next_cursor === null ? null : string(value.next_cursor) };
  }
  const id = integer(value.id, 1);
  if (`thread:${id}` !== scope) throw new Error('Invalid conversation scope');
  return { id, peer: peer(value.peer), state: string(value.state), incoming_request: boolean(value.incoming_request), can_reopen: boolean(value.can_reopen),
    blocked: boolean(value.blocked), source: source(value.source), messages: array(value.messages, message), has_more: boolean(value.has_more) };
}
function bytes(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 128) result++;
    else if (code < 2048) result += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { result += 4; i++; }
    else result += 3;
  }
  return result;
}
let sequence = 0;

/** UID-isolated local snapshots. Synchronous atomic commits cannot outlive account/generation guards. */
export class PrivateMessageFileCache {
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly maxThreads: number;
  private readonly maxLists: number;
  private readonly maxBytes: number;
  private readonly maxUsers: number;
  private protections = new Map<string, number>();
  constructor(private readonly options: Options = {}) {
    this.now = options.now || Date.now;
    this.ttl = options.ttl ?? PRIVATE_FILE_TTL;
    this.maxThreads = options.maxThreads ?? 10;
    this.maxLists = options.maxLists ?? 4;
    this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
    this.maxUsers = options.maxUsers ?? 20;
  }
  private storage(create = false): { fs: PrivateMessageFileSystem; directory: string } | undefined {
    try {
      const root = this.options.root ? this.options.root() : Taro.env?.USER_DATA_PATH;
      const fs = this.options.fileSystem ? this.options.fileSystem() : Taro.getFileSystemManager?.() as PrivateMessageFileSystem | undefined;
      if (!root || !fs) return undefined;
      const environment = Taro.getAccountInfoSync?.().miniProgram?.envVersion || 'develop';
      if (!/^(develop|trial|release)$/.test(environment)) return undefined;
      const directory = `${root}/${DIRECTORY}-${environment}`;
      if (create) {
        try { fs.mkdirSync(directory, true); } catch {
          // An existing directory is valid; inaccessible directories still fail at the actual I/O.
          fs.readdirSync(directory);
        }
      }
      return { fs, directory };
    } catch { return undefined; }
  }
  private path(directory: string, uid: number) { return `${directory}/u-${uid}.json`; }
  private read(fs: PrivateMessageFileSystem, directory: string, uid: number, forWrite = false): Snapshot | undefined {
    let text: unknown;
    try {
      const path = this.path(directory, uid);
      if (fs.statSync(path).size > this.maxBytes) return undefined;
      text = fs.readFileSync(path, 'utf8');
    } catch (error) {
      // A transient read/stat failure must not let a write replace the last completed snapshot.
      const detail = error as { code?: string; errMsg?: string; message?: string };
      const missing = detail?.code === 'ENOENT' || /ENOENT|no such file|not exist|not found/i.test(detail?.errMsg || detail?.message || '');
      if (forWrite && !missing) throw new Error('Private cache read unavailable');
      return undefined;
    }
    try {
      if (typeof text !== 'string' || bytes(text) > this.maxBytes) return undefined;
      const data = record(JSON.parse(text));
      if (data.version !== PRIVATE_FILE_VERSION || data.uid !== uid || !Array.isArray(data.entries) || data.entries.length > 5000) return undefined;
      const seen = new Set<string>();
      const entries = data.entries.map(input => {
        const e = record(input);
        const scope = string(e.scope);
        if (!validScope(scope) || seen.has(scope)) throw new Error('Invalid cache scope');
        seen.add(scope);
        return { scope, version: integer(e.version, 1), expires: integer(e.expires), accessed: integer(e.accessed), value: payload(scope, e.value) };
      });
      return { version: PRIVATE_FILE_VERSION, uid, entries };
    } catch { return undefined; }
  }
  private protected(uid: number, scope: string) { return this.protections.has(`${uid}:${scope}`); }
  private trim(snapshot: Snapshot) {
    snapshot.entries = snapshot.entries.filter(entry => entry.expires > this.now() && entry.version === PRIVATE_FILE_VERSION).sort((a, b) => a.accessed - b.accessed);
    for (const list of [false, true]) {
      const group = snapshot.entries.filter(entry => entry.scope.startsWith('list:') === list);
      let excess = group.length - (list ? this.maxLists : this.maxThreads);
      for (const entry of group) if (excess > 0 && !this.protected(snapshot.uid, entry.scope)) {
        snapshot.entries = snapshot.entries.filter(candidate => candidate !== entry); excess--;
      }
    }
    while (bytes(JSON.stringify(snapshot)) > this.maxBytes) {
      const oldest = snapshot.entries.find(entry => !this.protected(snapshot.uid, entry.scope));
      if (!oldest) break;
      snapshot.entries = snapshot.entries.filter(entry => entry !== oldest);
    }
  }
  private commit(fs: PrivateMessageFileSystem, directory: string, snapshot: Snapshot, preserveCurrent = true): boolean {
    const serialized = JSON.stringify(snapshot);
    if (bytes(serialized) > this.maxBytes) return false;
    const target = this.path(directory, snapshot.uid);
    const temporary = `${target}.tmp-${++sequence}`;
    try {
      fs.writeFileSync(temporary, serialized, 'utf8');
      fs.renameSync(temporary, target);
      this.trimUsers(fs, directory, preserveCurrent ? snapshot.uid : 0);
      return true;
    } catch { return false; }
    finally { try { fs.unlinkSync(temporary); } catch { /* Already renamed, or unavailable. */ } }
  }
  private trimUsers(fs: PrivateMessageFileSystem, directory: string, currentUid: number) {
    try {
      const users = fs.readdirSync(directory).filter(name => /^u-[1-9]\d*\.json$/.test(name)).map(name => {
        const uid = Number(name.slice(2, -5));
        return { name, uid, modified: fs.statSync(`${directory}/${name}`).lastModifiedTime || 0 };
      }).sort((a, b) => a.modified - b.modified);
      let excess = users.length - this.maxUsers;
      for (const user of users) {
        if (excess <= 0) break;
        if (user.uid === currentUid || [...this.protections.keys()].some(key => key.startsWith(`${user.uid}:`))) continue;
        try { fs.unlinkSync(`${directory}/${user.name}`); excess--; } catch { /* A failed deletion is retried on a later commit. */ }
      }
    } catch { /* Never inspect other users' message bodies during capacity scans. */ }
  }
  get<T>(uid: number, scope: string, version = PRIVATE_FILE_VERSION): T | undefined {
    if (!positive(uid) || !validScope(scope) || version !== PRIVATE_FILE_VERSION) return undefined;
    const storage = this.storage();
    if (!storage) return undefined;
    const snapshot = this.read(storage.fs, storage.directory, uid);
    const entry = snapshot?.entries.find(candidate => candidate.scope === scope && candidate.version === version && candidate.expires > this.now());
    if (!snapshot || !entry) return undefined;
    entry.accessed = Math.max(this.now(), ...snapshot.entries.map(candidate => candidate.accessed + 1));
    this.trim(snapshot);
    this.commit(storage.fs, storage.directory, snapshot);
    // Parsed/projection objects are fresh on every read; callers cannot mutate the file by reference.
    return entry.value as T;
  }
  put<T>(uid: number, scope: string, value: T, version = PRIVATE_FILE_VERSION): boolean {
    if (!positive(uid) || !validScope(scope) || version !== PRIVATE_FILE_VERSION) return false;
    try {
      const projected = payload(scope, value);
      const storage = this.storage(true);
      if (!storage) return false;
      const snapshot = this.read(storage.fs, storage.directory, uid, true) || { version: PRIVATE_FILE_VERSION, uid, entries: [] };
      const accessed = Math.max(this.now(), ...snapshot.entries.map(candidate => candidate.accessed + 1));
      snapshot.entries = snapshot.entries.filter(entry => entry.scope !== scope);
      snapshot.entries.push({ scope, version, expires: this.now() + this.ttl, accessed, value: projected });
      this.trim(snapshot);
      if (!snapshot.entries.some(entry => entry.scope === scope)) return false;
      return this.commit(storage.fs, storage.directory, snapshot);
    } catch { return false; }
  }
  protect(uid: number, scope: string): () => void {
    if (!positive(uid) || !validScope(scope)) return () => {};
    const key = `${uid}:${scope}`;
    this.protections.set(key, (this.protections.get(key) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.protections.get(key) || 1) - 1;
      if (count) this.protections.set(key, count); else this.protections.delete(key);
      const storage = this.storage();
      if (!storage) return;
      const snapshot = this.read(storage.fs, storage.directory, uid);
      if (snapshot) { this.trim(snapshot); this.commit(storage.fs, storage.directory, snapshot, false); }
    };
  }
}

// No filesystem access, account data or background work at module initialization.
export const privateMessageFileCache = new PrivateMessageFileCache();
