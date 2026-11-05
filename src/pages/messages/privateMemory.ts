import { subscribeCurrentAccount } from '../../utils/currentUser';
import { privateMessageFileCache, type PrivateMessageFileCache } from '../../utils/privateMessageFileCache';

type FileBackend = Pick<PrivateMessageFileCache, 'get' | 'put' | 'protect'>;

export const PRIVATE_MEMORY_VERSION = 1;
export const PRIVATE_MEMORY_TTL = 5 * 60 * 1000;

interface Entry { uid: number; scope: string; value: unknown; expires: number; version: number; }

/** Bounded UID-scoped responses; optional file access requires fresh identity authorization. */
export class PrivateMemory {
  private entries = new Map<string, Entry>();
  private protectedKeys = new Map<string, number>();
  private bindings = new Map<string, { uid: number; expires: number; valid: boolean }>();
  private protectionGeneration = 0;
  private authorizedUid = 0;
  constructor(private capacity = 10, private now = Date.now, private ttl = PRIVATE_MEMORY_TTL, private backend?: FileBackend) {}
  authorize(uid: number) { this.authorizedUid = Number.isSafeInteger(uid) && uid > 0 ? uid : 0; }
  revokeAuthorization() { this.authorizedUid = 0; }
  private key(uid: number, scope: string) { return `${uid}:${scope}`; }
  bind(account: string, uid: number) {
    this.bindings.set(account, { uid, expires: this.now() + this.ttl, valid: true });
    while (this.bindings.size > 20) {
      const oldest = this.bindings.keys().next().value!;
      const oldUid = this.bindings.get(oldest)!.uid;
      this.bindings.delete(oldest);
      if (![...this.bindings.values()].some(binding => binding.uid === oldUid)) this.clearUid(oldUid);
    }
  }
  uid(account: string) {
    const binding = this.bindings.get(account);
    if (!binding?.valid || binding.expires <= this.now()) return 0;
    return binding.uid;
  }
  invalidateBinding(account: string) {
    const binding = this.bindings.get(account);
    if (binding) binding.valid = false;
    this.revokeAuthorization();
  }
  knownUid(account: string) { return this.bindings.get(account)?.uid || 0; }
  protect(uid: number, scope: string, allowFile = false) {
    const key = this.key(uid, scope);
    const generation = this.protectionGeneration;
    const fileRelease = allowFile && uid === this.authorizedUid ? this.backend?.protect(uid, scope) : undefined;
    let released = false;
    this.protectedKeys.set(key, (this.protectedKeys.get(key) || 0) + 1);
    return () => {
      if (released) return;
      released = true;
      // A logout resets memory generations, but an old file lease must still be released.
      fileRelease?.();
      if (generation !== this.protectionGeneration) return;
      const count = (this.protectedKeys.get(key) || 1) - 1;
      if (count) this.protectedKeys.set(key, count); else this.protectedKeys.delete(key);
      this.trim();
    };
  }
  get<T>(uid: number, scope: string, version = PRIVATE_MEMORY_VERSION, allowFile = false): T | undefined {
    const key = this.key(uid, scope);
    const entry = this.entries.get(key);
    if (entry && entry.version === version && entry.expires > this.now()) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.value as T;
    }
    this.entries.delete(key);
    if (!allowFile || uid !== this.authorizedUid) return undefined;
    const value = this.backend?.get<T>(uid, scope, version);
    if (value !== undefined) this.remember(uid, scope, value, version);
    return value;
  }
  private remember<T>(uid: number, scope: string, value: T, version: number) {
    const key = this.key(uid, scope);
    this.entries.delete(key);
    this.entries.set(key, { uid, scope, value, expires: this.now() + this.ttl, version });
    this.trim();
  }
  put<T>(uid: number, scope: string, value: T, version = PRIVATE_MEMORY_VERSION) {
    if (!Number.isSafeInteger(uid) || uid <= 0) return;
    this.remember(uid, scope, value, version);
    if (uid === this.authorizedUid) this.backend?.put(uid, scope, value, version);
  }
  private trim() {
    const threadKeys = [...this.entries.keys()].filter(key => !this.entries.get(key)!.scope.startsWith('list:'));
    const listKeys = [...this.entries.keys()].filter(key => this.entries.get(key)!.scope.startsWith('list:'));
    for (const [keys, limit] of [[threadKeys, this.capacity], [listKeys, 4]] as const) {
      let excess = keys.length - limit;
      for (const key of keys) {
        if (excess <= 0) break;
        if (this.protectedKeys.has(key)) continue;
        this.entries.delete(key);
        excess--;
      }
    }
  }
  clearUid(uid: number) {
    if (this.authorizedUid === uid) this.revokeAuthorization();
    for (const [key, entry] of this.entries) if (entry.uid === uid) this.entries.delete(key);
    for (const [account, binding] of this.bindings) if (binding.uid === uid) {
      this.bindings.delete(account);
    }
  }
  accountChanged(reason: 'changed' | 'signed-out') {
    this.revokeAuthorization();
    if (reason === 'signed-out') {
      // Logout also runs with no mounted private page; clear bounded private memory, not global storage.
      this.protectionGeneration++;
      this.entries.clear(); this.bindings.clear(); this.protectedKeys.clear();
    } else this.bindings.forEach(binding => { binding.valid = false; });
  }
  size() { return this.entries.size; }
}

export const privateMessageMemory = new PrivateMemory(10, Date.now, PRIVATE_MEMORY_TTL, privateMessageFileCache);
// Module lifetime observer has no content payload and no timers; it protects cache after page unmount.
subscribeCurrentAccount(reason => privateMessageMemory.accountChanged(reason));
