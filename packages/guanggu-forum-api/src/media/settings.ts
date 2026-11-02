import { getCacheService, request } from '../client';
import type { Cookie } from '../utils/cookie';

export class ImageHostSettingsError extends Error {
  constructor(message: string) { super(message); this.name = 'ImageHostSettingsError'; }
}

export interface BindImageHostTokenOptions {
  version?: string;
  albumId?: number;
  revokeOnPasswordChange?: boolean;
}

export interface ImageHostSettings {
  bound: boolean;
  mask: string;
  version: string;
  album_id: number;
  revoke_on_password_change: boolean;
  error: string;
  max_bytes: number;
  batch_limit: number;
}

function parseSettings(response: Awaited<ReturnType<typeof request>>): ImageHostSettings {
  const status = response.rawRes?.statusCode;
  if (status === 401 || status === 403) throw new ImageHostSettingsError('请检查登录状态和安全校验信息');
  if (status === 409) throw new ImageHostSettingsError('配置已变化，请刷新后重试');
  let payload: unknown = response.data ?? response.rawRes?.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  const result = payload as { ok?: unknown; data?: Partial<ImageHostSettings> } | null;
  const data = result?.data;
  if (status !== 200 || result?.ok !== true || !data || typeof data !== 'object'
    || typeof data.bound !== 'boolean' || typeof data.mask !== 'string'
    || typeof data.version !== 'string' || (data.bound && !data.version)
    || !Number.isSafeInteger(data.album_id) || (data.album_id ?? -1) < 0
    || typeof data.revoke_on_password_change !== 'boolean' || typeof data.error !== 'string'
    || !Number.isSafeInteger(data.max_bytes) || (data.max_bytes ?? 0) <= 0
    || !Number.isSafeInteger(data.batch_limit) || (data.batch_limit ?? 0) <= 0) {
    throw new ImageHostSettingsError('无法读取图床配置，请刷新后重试');
  }
  // Only return the documented fields; never pass through credentials or raw errors.
  return {
    bound: data.bound, mask: data.mask, version: data.version,
    album_id: data.album_id!, revoke_on_password_change: data.revoke_on_password_change,
    error: data.error ? '图床配置异常，请重新验证 Token' : '',
    max_bytes: data.max_bytes!, batch_limit: data.batch_limit!,
  };
}

function currentXsrf(): string {
  const cs = getCacheService();
  if (!cs.get<string>('current_username')) throw new ImageHostSettingsError('请先登录再配置图片托管');
  const cookie = cs.get<Record<string, Cookie | string>>('cookies')?._xsrf;
  const xsrf = typeof cookie === 'string' ? cookie : cookie?.value;
  if (!xsrf) throw new ImageHostSettingsError('缺少安全校验信息，请刷新后重试');
  return xsrf;
}

export async function getImageHostSettings(): Promise<ImageHostSettings> {
  if (!getCacheService().get<string>('current_username')) throw new ImageHostSettingsError('请先登录再配置图片托管');
  let response: Awaited<ReturnType<typeof request>>;
  try {
    response = await request('/api/media/settings', {
      method: 'GET', cache: false,
      header: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
  } catch {
    throw new ImageHostSettingsError('图床配置读取失败，请检查登录状态和网络');
  }
  return parseSettings(response);
}

export async function unbindImageHostToken(version: string): Promise<ImageHostSettings> {
  if (!version.trim()) throw new ImageHostSettingsError('请先刷新图床绑定状态');
  const xsrf = currentXsrf();
  let response: Awaited<ReturnType<typeof request>>;
  try {
    response = await request('/api/media/settings', {
      method: 'POST', cache: false, data: { action: 'unbind', version },
      header: { 'Content-Type': 'application/json', 'X-XSRFToken': xsrf, Accept: 'application/json' },
    });
  } catch {
    throw new ImageHostSettingsError('解绑失败，请检查登录状态和网络');
  }
  const settings = parseSettings(response);
  if (settings.bound || settings.error) throw new ImageHostSettingsError('无法确认解绑结果，请刷新后重试');
  return settings;
}

export async function bindImageHostToken(token: string, options: BindImageHostTokenOptions = {}): Promise<void> {
  const normalized = token.trim();
  if ((!normalized && !options.version) || normalized.length > 4096 || /\s/.test(normalized)) {
    throw new ImageHostSettingsError('请输入有效的 API Token');
  }
  const xsrf = currentXsrf();
  const albumId = options.albumId ?? 0;
  if (!Number.isSafeInteger(albumId) || albumId < 0) throw new ImageHostSettingsError('相册配置无效');
  let response: Awaited<ReturnType<typeof request>>;
  try {
    response = await request('/api/media/settings', {
      method: 'POST', cache: false,
      data: {
        action: 'bind', token: normalized, version: options.version ?? '',
        album_id: albumId, revoke_on_password_change: options.revokeOnPasswordChange ?? true,
      },
      header: { 'Content-Type': 'application/json', 'X-XSRFToken': xsrf, Accept: 'application/json' },
    });
  } catch {
    throw new ImageHostSettingsError('图片托管绑定失败，请检查登录状态和网络');
  }
  const status = response.rawRes?.statusCode;
  if (status === 409) throw new ImageHostSettingsError('配置已变化，请刷新后重试');
  if (status === 401 || status === 403) throw new ImageHostSettingsError('绑定被拒绝，请检查登录状态和安全校验信息');
  let data: unknown = response.data ?? response.rawRes?.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (status !== 200 || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ImageHostSettingsError('无法确认绑定结果，请到网站检查');
  }
  const result = data as Record<string, unknown>;
  const settings = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null;
  const failed = result.success === false || result.ok === false || !!result.error
    || settings?.bound === false || !!settings?.error
    || result.status === 'error' || result.status === 'fail'
    || (typeof result.code === 'number' && result.code !== 0 && result.code !== 200);
  const confirmed = result.success === true || result.ok === true || result.code === 0 || result.code === 200
    || result.status === 'ok' || result.status === 'success';
  // Never echo a server error payload, which may contain the submitted token.
  if (failed) throw new ImageHostSettingsError('绑定失败，请检查 API Token 是否有效');
  if (!confirmed) throw new ImageHostSettingsError('无法确认绑定结果，请到网站检查');
}
