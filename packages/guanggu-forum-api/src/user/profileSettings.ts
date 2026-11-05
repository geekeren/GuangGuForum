import type { HTMLElement } from 'node-html-parser';
import { getCacheService, request } from '../client';
import type { ICacheService } from '../types';
import { stringifyCookie, type Cookie } from '../utils/cookie';

export interface OwnProfileFields {
  nickname: string;
  gender: string;
  generation: string;
  signature: string;
  location: string;
  website: string;
  college: string;
  company: string;
  self_intro: string;
}
export interface OwnProfileSelectOption { readonly value: string; readonly label: string }
/** Keep this original object in memory; copies are not valid save authorizations. */
export interface OwnProfileSettings {
  readonly username: string;
  readonly email: string;
  readonly fields: Readonly<OwnProfileFields>;
  readonly options: {
    readonly gender: readonly OwnProfileSelectOption[];
    readonly generation: readonly OwnProfileSelectOption[];
  };
}
export type ProfileSettingsErrorCode =
  | 'AUTH_REQUIRED' | 'ACCOUNT_CHANGED' | 'INVALID_RESPONSE' | 'INVALID_ARGUMENT'
  | 'STALE_DRAFT' | 'BUSY' | 'NETWORK' | 'HTTP' | 'VERIFICATION';
export class ProfileSettingsError extends Error {
  constructor(public readonly code: ProfileSettingsErrorCode, message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ProfileSettingsError';
  }
}

const PATH = '/setting';
const FIELD_NAMES = ['nickname', 'gender', 'generation', 'signature', 'location', 'website', 'college', 'company', 'self_intro'] as const;
const invalidResponse = () => new ProfileSettingsError('INVALID_RESPONSE', '无法读取个人资料设置，请刷新后重试');
const staleDraft = () => new ProfileSettingsError('STALE_DRAFT', '资料表单已失效，请刷新后再保存');
const verificationError = () => new ProfileSettingsError('VERIFICATION', '提交结果未确认，请刷新检查后再操作');
interface AccountState { revision: number; saving: boolean }
interface Scope { service: ICacheService; username: string; cookies: string; state: AccountState; revision: number }
interface ParsedSettings { settings: OwnProfileSettings; xsrf: string }
interface Draft extends Scope { xsrf: string; settings: OwnProfileSettings; consumed: boolean }
// CSRF and session values never appear in the public result or any persisted cache.
const states = new WeakMap<ICacheService, AccountState>();
const drafts = new WeakMap<OwnProfileSettings, Draft>();

function accountState(service: ICacheService): AccountState {
  let state = states.get(service);
  if (!state) { state = { revision: 0, saving: false }; states.set(service, state); }
  return state;
}
function cookieScope(service: ICacheService): string {
  return stringifyCookie(service.get<Record<string, Cookie | string>>('cookies') || {});
}
function captureScope(service: ICacheService, state: AccountState): Scope {
  const username = service.get<string>('current_username');
  if (!username) throw new ProfileSettingsError('AUTH_REQUIRED', '请先登录');
  return { service, username, cookies: cookieScope(service), state, revision: state.revision };
}
function assertIdentity(scope: Scope): void {
  if (getCacheService() !== scope.service || scope.service.get<string>('current_username') !== scope.username) {
    throw new ProfileSettingsError('ACCOUNT_CHANGED', '登录状态已变化，请重新打开个人资料设置');
  }
}
function assertDraftScope(scope: Scope): void {
  assertIdentity(scope);
  if (cookieScope(scope.service) !== scope.cookies) {
    throw new ProfileSettingsError('ACCOUNT_CHANGED', '登录状态已变化，请重新打开个人资料设置');
  }
  if (scope.state.revision !== scope.revision) throw staleDraft();
}
function matchesUsername(formUsername: string, stored: string): boolean {
  let decoded = stored;
  try { decoded = decodeURIComponent(stored); } catch { /* Preserve the stored identity. */ }
  return formUsername === stored || formUsername === decoded;
}

async function scopedRequest(scope: Scope, data?: Record<string, unknown>): Promise<Awaited<ReturnType<typeof request>>> {
  assertDraftScope(scope);
  let response: Awaited<ReturnType<typeof request>>;
  try {
    response = await request(PATH, {
      method: data === undefined ? 'GET' : 'POST', cache: false,
      header: { 'Cache-Control': 'no-store', ...(data === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
      ...(data === undefined ? {} : { data }),
    });
  } catch (error) {
    assertIdentity(scope);
    if (error instanceof Error && error.message === '账号已切换，请重试') {
      throw new ProfileSettingsError('ACCOUNT_CHANGED', '登录状态已变化，请重新打开个人资料设置');
    }
    if (error instanceof Error && error.name === 'LoginRequiredError') throw new ProfileSettingsError('AUTH_REQUIRED', '请先登录');
    // A failed POST may already have reached the server. Do not imply it was not saved.
    if (data !== undefined) throw verificationError();
    throw new ProfileSettingsError('NETWORK', '个人资料读取失败，请检查网络后重试');
  }
  assertIdentity(scope);
  if (scope.state.revision !== scope.revision) throw staleDraft();
  // The shared client rejects changed sessions but permits response Set-Cookie rotation.
  const status = response.rawRes?.statusCode;
  if (status === 401 || response.body?.querySelector('input[name="password"]')) {
    throw new ProfileSettingsError('AUTH_REQUIRED', '登录已失效，请重新登录', status);
  }
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new ProfileSettingsError('HTTP', '个人资料请求未完成，请刷新后重试', status);
  }
  return response;
}

function control(form: HTMLElement, name: string, tag: string, readonly = false): HTMLElement {
  const elements = form.querySelectorAll(`[name="${name}"]`);
  if (elements.length !== 1) throw invalidResponse();
  const element = elements[0];
  if (element.tagName !== tag || element.hasAttribute('disabled') || element.hasAttribute('readonly') !== readonly) throw invalidResponse();
  return element;
}
function readSelect(element: HTMLElement): { value: string; options: readonly OwnProfileSelectOption[] } {
  if (element.hasAttribute('multiple')) throw invalidResponse();
  const elements = element.querySelectorAll('option');
  if (!elements.length) throw invalidResponse();
  const selected = elements.filter(option => option.hasAttribute('selected'));
  if (selected.length > 1) throw invalidResponse();
  const choice = selected[0] || elements[0];
  const enabled = elements.filter(option => !option.hasAttribute('disabled') && !option.parentNode?.hasAttribute('disabled'));
  const options = enabled.map(option => Object.freeze({ value: option.getAttribute('value') ?? option.textContent, label: option.textContent.trim() }));
  if (!enabled.includes(choice) || new Set(options.map(option => option.value)).size !== options.length) throw invalidResponse();
  return { value: choice.getAttribute('value') ?? choice.textContent, options: Object.freeze(options) };
}
function parseSettings(response: Awaited<ReturnType<typeof request>>, scope: Scope): ParsedSettings {
  const forms = response.body?.querySelectorAll('form.setting') || [];
  if (forms.length !== 1) throw invalidResponse();
  const form = forms[0];
  const action = form.getAttribute('action');
  const enctype = form.getAttribute('enctype');
  if ((action !== '' && action !== PATH) || form.getAttribute('method')?.toUpperCase() !== 'POST'
    || (enctype && enctype.toLowerCase() !== 'application/x-www-form-urlencoded') || form.hasAttribute('onsubmit')) throw invalidResponse();
  const allowed = new Set<string>([...FIELD_NAMES, 'username', 'email', '_xsrf']);
  if (form.querySelectorAll('[name]').some(element => !allowed.has(element.getAttribute('name') || ''))) throw invalidResponse();
  const usernameInput = control(form, 'username', 'INPUT', true);
  const emailInput = control(form, 'email', 'INPUT', true);
  if (usernameInput.getAttribute('type') !== 'text' || emailInput.getAttribute('type') !== 'text') throw invalidResponse();
  const username = usernameInput.getAttribute('value') || '';
  if (!matchesUsername(username, scope.username)) throw new ProfileSettingsError('ACCOUNT_CHANGED', '登录状态已变化，请重新打开个人资料设置');
  const xsrfInput = control(form, '_xsrf', 'INPUT');
  const xsrf = xsrfInput.getAttribute('value') || '';
  if (xsrfInput.getAttribute('type') !== 'hidden' || !xsrf.trim()) throw invalidResponse();
  const fields = {} as OwnProfileFields;
  const gender = readSelect(control(form, 'gender', 'SELECT'));
  const generation = readSelect(control(form, 'generation', 'SELECT'));
  for (const name of FIELD_NAMES) {
    if (name === 'gender') fields[name] = gender.value;
    else if (name === 'generation') fields[name] = generation.value;
    else if (name === 'self_intro') fields[name] = control(form, name, 'TEXTAREA').textContent;
    else {
      const input = control(form, name, 'INPUT');
      if (input.getAttribute('type') !== 'text') throw invalidResponse();
      fields[name] = input.getAttribute('value') || '';
    }
  }
  const settings: OwnProfileSettings = Object.freeze({
    username, email: emailInput.getAttribute('value') || '', fields: Object.freeze(fields),
    options: Object.freeze({ gender: gender.options, generation: generation.options }),
  });
  return { settings, xsrf };
}
function publishDraft(parsed: ParsedSettings, scope: Scope): OwnProfileSettings {
  drafts.set(parsed.settings, { ...scope, cookies: cookieScope(scope.service), xsrf: parsed.xsrf, settings: parsed.settings, consumed: false });
  return parsed.settings;
}
function submittedFields(fields: OwnProfileFields, draft: Draft): OwnProfileFields {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length !== FIELD_NAMES.length
    || Object.keys(fields).some(name => !FIELD_NAMES.includes(name as typeof FIELD_NAMES[number]))) {
    throw new ProfileSettingsError('INVALID_ARGUMENT', '个人资料字段无效，请刷新后重试');
  }
  const result = {} as OwnProfileFields;
  for (const name of FIELD_NAMES) {
    if (typeof fields[name] !== 'string') throw new ProfileSettingsError('INVALID_ARGUMENT', '个人资料字段无效，请刷新后重试');
    result[name] = fields[name];
  }
  for (const name of ['gender', 'generation'] as const) {
    if (!draft.settings.options[name].some(option => option.value === result[name])) {
      throw new ProfileSettingsError('INVALID_ARGUMENT', '请选择有效的性别和出生年代选项');
    }
  }
  return result;
}

/** Read sensitive form values directly; never use the profile/HTML reading cache. */
export async function getOwnProfileSettings(): Promise<OwnProfileSettings> {
  const service = getCacheService();
  const state = accountState(service);
  if (state.saving) throw new ProfileSettingsError('BUSY', '正在保存个人资料，请稍候');
  state.revision++;
  const scope = captureScope(service, state);
  return publishDraft(parseSettings(await scopedRequest(scope), scope), scope);
}

/** Explicit save, followed by one uncached read to verify every submitted field. No POST retry. */
export async function saveOwnProfileSettings(settings: OwnProfileSettings, fields: OwnProfileFields): Promise<OwnProfileSettings> {
  const draft = settings && drafts.get(settings);
  if (!draft) throw staleDraft();
  assertDraftScope(draft);
  if (draft.state.saving) throw new ProfileSettingsError('BUSY', '正在保存个人资料，请稍候');
  if (draft.consumed) throw staleDraft();
  const submitted = submittedFields(fields, draft);
  draft.state.saving = true;
  draft.consumed = true;
  try {
    await scopedRequest(draft, { username: draft.settings.username, email: draft.settings.email, ...submitted, _xsrf: draft.xsrf });
    const scope = captureScope(draft.service, draft.state);
    let parsed: ParsedSettings;
    try {
      parsed = parseSettings(await scopedRequest(scope), scope);
    } catch (error) {
      if (error instanceof ProfileSettingsError && (error.code === 'ACCOUNT_CHANGED' || error.code === 'AUTH_REQUIRED')) throw error;
      throw verificationError();
    }
    if (parsed.settings.username !== draft.settings.username || parsed.settings.email !== draft.settings.email
      || FIELD_NAMES.some(name => parsed.settings.fields[name] !== submitted[name])) throw verificationError();
    return publishDraft(parsed, scope);
  } finally { draft.state.saving = false; }
}
