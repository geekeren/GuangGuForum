import { getCachedUsername } from '../../utils/currentUser';
import { getOwnProfileSettings, saveOwnProfileSettings, type OwnProfileFields, type OwnProfileSettings } from 'guanggu-forum-api';

export const PROFILE_FIELD_NAMES = ['nickname', 'gender', 'generation', 'signature', 'location', 'website', 'college', 'company', 'self_intro'] as const;
export interface ProfileEditSnapshot {
  account: string;
  visible: boolean;
  generation: number;
  draft: OwnProfileSettings | null;
  fields: OwnProfileFields | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  requiresRefresh: boolean;
  error: string;
  notice: string;
}
const empty = (generation = 0): ProfileEditSnapshot => ({ account: '', visible: false, generation, draft: null, fields: null,
  loading: false, saving: false, dirty: false, requiresRefresh: false, error: '', notice: '' });

function matchesAccount(username: string, account: string): boolean {
  let decoded = account;
  try { decoded = decodeURIComponent(account); } catch { /* Preserve legacy account encoding. */ }
  return username === account || username === decoded;
}

function errorText(error: unknown, saving: boolean): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'VERIFICATION': return '提交结果未确认，请刷新检查后再操作';
    case 'AUTH_REQUIRED': return '登录已失效，请重新登录';
    case 'ACCOUNT_CHANGED': return '账号已切换，请重新打开资料编辑';
    case 'STALE_DRAFT': return '资料已失效，请刷新后再保存';
    case 'BUSY': return '正在提交资料，请稍后检查';
    case 'INVALID_RESPONSE': return '无法读取资料，请刷新检查';
    case 'INVALID_ARGUMENT': return '资料格式有误，请检查后刷新';
    default: return saving ? '提交未完成，请刷新检查后再操作' : '资料加载失败，请检查网络后重试';
  }
}

/** Page-local form only; the original opaque API draft is held without cloning or serialization. */
export class ProfileEditState {
  private value = empty();
  private listeners = new Set<() => void>();
  private revision = 0;
  constructor(private account = getCachedUsername,
    private get = getOwnProfileSettings, private post = saveOwnProfileSettings) {}
  snapshot = () => this.value;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(value: ProfileEditSnapshot) { this.value = value; this.listeners.forEach(fn => fn()); }
  hide = () => { this.revision++; this.publish(empty(this.value.generation + 1)); };
  visible = () => {
    if (this.value.account !== this.account()) { this.hide(); return false; }
    return this.value.visible && Boolean(this.value.account);
  };
  activate = (account: string) => { this.hide(); if (account && account === this.account()) this.publish({ ...this.value, account, visible: true }); };
  async load() {
    if (!this.visible() || this.value.loading || this.value.saving) return;
    const generation = this.value.generation, account = this.value.account, revision = ++this.revision;
    const current = () => this.visible() && this.value.generation === generation && this.value.account === account && this.revision === revision;
    this.publish({ ...this.value, loading: true, requiresRefresh: true, error: '', notice: '' });
    try {
      const draft = await this.get();
      if (!current()) return;
      if (!matchesAccount(draft.username, account)) { this.publish({ ...this.value, loading: false, requiresRefresh: true, error: '账号已切换，请重新打开资料编辑' }); return; }
      this.publish({ ...this.value, draft, fields: { ...draft.fields }, loading: false, dirty: false, requiresRefresh: false, error: '' });
    } catch (error) { if (current()) this.publish({ ...this.value, loading: false, error: errorText(error, false) }); }
  }
  change(name: keyof OwnProfileFields, text: string) {
    if (!this.visible() || this.value.saving || this.value.loading || !this.value.fields || !this.value.draft || !PROFILE_FIELD_NAMES.includes(name)) return;
    const fields = { ...this.value.fields, [name]: text };
    this.publish({ ...this.value, fields, dirty: PROFILE_FIELD_NAMES.some(key => fields[key] !== this.value.draft!.fields[key]), error: '', notice: '' });
  }
  async save(success: () => void) {
    if (!this.visible() || !this.value.draft || !this.value.fields || !this.value.dirty || this.value.saving || this.value.loading || this.value.requiresRefresh) return;
    const generation = this.value.generation, account = this.value.account, revision = ++this.revision;
    const draft = this.value.draft, fields = { ...this.value.fields };
    const current = () => this.visible() && this.value.generation === generation && this.value.account === account && this.revision === revision;
    // Synchronous before awaiting the API: repeated taps cannot issue a second POST.
    this.publish({ ...this.value, saving: true, error: '', notice: '' });
    try {
      const verified = await this.post(draft, fields);
      if (!current()) return;
      if (!matchesAccount(verified.username, account)) throw { code: 'VERIFICATION' };
      this.publish({ ...this.value, draft: verified, fields: { ...verified.fields }, saving: false, dirty: false, requiresRefresh: false, notice: '资料已保存', error: '' });
      success();
    } catch (error) { if (current()) this.publish({ ...this.value, saving: false, requiresRefresh: true, error: errorText(error, true) }); }
  }
}
