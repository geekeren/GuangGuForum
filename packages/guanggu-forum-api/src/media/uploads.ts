import Taro from '@tarojs/taro';
import { getCacheService } from '../client';
import { URLS } from '../urls';
import { parseCookie, stringifyCookie, type Cookie } from '../utils/cookie';
import { getImageHostSettings } from './settings';

export interface UploadedImage {
  id: string;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  size: number;
}

export interface ImageUploadProgress {
  progress: number | null;
  phase: 'preparing' | 'uploading' | 'processing' | 'complete';
}

export interface ImageUploadSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export function createImageUploadController() {
  let aborted = false;
  const listeners = new Set<() => void>();
  const signal: ImageUploadSignal = {
    get aborted() { return aborted; },
    addEventListener: (_, listener) => { listeners.add(listener); },
    removeEventListener: (_, listener) => { listeners.delete(listener); },
  };
  return { signal, abort: () => {
    if (aborted) return;
    aborted = true;
    listeners.forEach(listener => listener());
    listeners.clear();
  } };
}

export class ImageUploadError extends Error {
  constructor(message: string, public code = 'upload_failed') { super(message); this.name = 'ImageUploadError'; }
}

function cancelled(): never { throw new ImageUploadError('已取消上传', 'cancelled'); }

function decodeResponse(response: { statusCode: number; data: unknown }): Record<string, unknown> {
  let payload = response.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  const result = payload as { ok?: unknown; error?: unknown; data?: unknown } | null;
  if (response.statusCode < 200 || response.statusCode >= 300 || result?.ok !== true) {
    const code = typeof result?.error === 'string' ? result.error : '';
    if (code === 'not_found') throw new ImageUploadError('上传记录不存在', code);
    if (code === 'not_bound' || code === 'invalid_token') throw new ImageUploadError('请先到图床设置绑定有效的 Token', code);
    if (response.statusCode === 413) throw new ImageUploadError('图片超过图床大小限制', 'too_large');
    if (response.statusCode === 401 || response.statusCode === 403) throw new ImageUploadError('图片上传被拒绝，请检查登录状态和图床配置');
    throw new ImageUploadError('图片上传服务暂不可用，请重试');
  }
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new ImageUploadError('无法确认图片上传结果，请重试');
  return result.data as Record<string, unknown>;
}

function completeImage(data: Record<string, unknown>, id: string): UploadedImage {
  const url = typeof data.url === 'string' ? data.url : '';
  if (data.state !== 'complete' || data.id !== id || data.error || !/^https?:\/\/[^\s<>]+$/i.test(url)
    || !Number.isSafeInteger(data.width) || Number(data.width) <= 0
    || !Number.isSafeInteger(data.height) || Number(data.height) <= 0
    || !Number.isSafeInteger(data.size) || Number(data.size) <= 0) throw new ImageUploadError('无法确认图片上传结果，请重试');
  return { id, url, thumbnail_url: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : '',
    width: Number(data.width), height: Number(data.height), size: Number(data.size) };
}

export async function uploadImage({ filePath, uploadId, onUploadId, onProgress, signal }: {
  filePath: string;
  uploadId?: string;
  onUploadId?: (id: string) => void;
  onProgress?: (progress: ImageUploadProgress) => void;
  signal?: ImageUploadSignal;
}): Promise<UploadedImage> {
  const cs = getCacheService();
  const account = cs.get<string>('current_username');
  if (!account) throw new ImageUploadError('请先登录再上传图片');
  const initialCookies = stringifyCookie(cs.get<Record<string, Cookie | string>>('cookies') ?? {});
  let expectedCookies = initialCookies;
  const assertCurrent = () => {
    if (signal?.aborted) cancelled();
    if (cs.get<string>('current_username') !== account
      || stringifyCookie(cs.get<Record<string, Cookie | string>>('cookies') ?? {}) !== expectedCookies) {
      throw new ImageUploadError('登录状态已变化，请重新上传图片', 'account_changed');
    }
  };
  assertCurrent();
  onProgress?.({ phase: 'preparing', progress: null });
  const settings = await getImageHostSettings();
  // The settings request may refresh the current session cookies.
  if (cs.get<string>('current_username') !== account) throw new ImageUploadError('账号已变化，请重新上传图片', 'account_changed');
  expectedCookies = stringifyCookie(cs.get<Record<string, Cookie | string>>('cookies') ?? {});
  assertCurrent();
  if (!settings.bound || settings.error) throw new ImageUploadError('请先到图床设置绑定有效的 Token', 'not_bound');
  let id = uploadId;
  if (id && !/^[a-f0-9]{32}$/.test(id)) throw new ImageUploadError('上传 ID 无效，请重新选择图片');
  if (!id) {
    const random = await Taro.getRandomValues({ length: 16 });
    id = Array.from(new Uint8Array(random.randomValues)).map(value => value.toString(16).padStart(2, '0')).join('');
    if (!/^[a-f0-9]{32}$/.test(id)) throw new ImageUploadError('无法创建上传 ID，请升级微信后重试');
  }
  assertCurrent();
  const resolvedId = id;
  onUploadId?.(resolvedId);

  const send = (method: 'GET' | 'POST', suffix = '', data?: ArrayBuffer | Record<string, unknown>) => {
    assertCurrent();
    const cookies = cs.get<Record<string, Cookie | string>>('cookies') ?? {};
    const xsrfCookie = cookies._xsrf;
    const xsrf = typeof xsrfCookie === 'string' ? xsrfCookie : xsrfCookie?.value;
    if (method === 'POST' && !xsrf) throw new ImageUploadError('缺少安全校验信息，请刷新后重试');
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const task = Taro.request({
        url: `${URLS.ROOT_URL}api/media/uploads/${resolvedId}${suffix}`, method, data, timeout: 95000,
        header: { cookie: stringifyCookie(cookies), Accept: 'application/json',
          'Content-Type': data instanceof ArrayBuffer ? 'application/octet-stream' : 'application/json',
          ...(xsrf ? { 'X-XSRFToken': xsrf } : {}) },
      });
      const abort = () => { task.abort(); reject(new ImageUploadError('已取消上传', 'cancelled')); };
      signal?.addEventListener('abort', abort);
      if (signal?.aborted) abort();
      task.then(response => {
        assertCurrent();
        if (response.cookies?.length) {
          cs.set('cookies', { ...cookies, ...parseCookie(response.cookies) }, { category: 'system' });
          expectedCookies = stringifyCookie(cs.get<Record<string, Cookie | string>>('cookies') ?? {});
        }
        resolve(decodeResponse(response));
      }).catch(error => reject(error instanceof ImageUploadError ? error : new ImageUploadError('网络中断，请点击重试查询上传结果')))
        .finally(() => signal?.removeEventListener('abort', abort));
    });
  };

  const waitForComplete = async (data: Record<string, unknown>) => {
    const deadline = Date.now() + 120000;
    while (data.state === 'processing' || data.state === 'queued' || data.state === 'uploading') {
      onProgress?.({ phase: 'processing', progress: null });
      if (Date.now() >= deadline) throw new ImageUploadError('图床仍在处理，请稍后重试查询结果');
      await new Promise(resolve => setTimeout(resolve, 1000));
      assertCurrent();
      data = await send('GET');
    }
    const image = completeImage(data, resolvedId);
    assertCurrent();
    onProgress?.({ phase: 'complete', progress: 100 });
    return image;
  };

  if (uploadId) {
    try {
      const old = await send('GET');
      if (['complete', 'processing', 'queued', 'uploading'].includes(String(old.state))) return await waitForComplete(old);
    } catch (error) {
      if (!(error instanceof ImageUploadError) || error.code !== 'not_found') throw error;
    }
  }
  const fs = Taro.getFileSystemManager();
  const size = await new Promise<number>((resolve, reject) => fs.getFileInfo({ filePath, success: result => resolve(result.size), fail: reject }));
  assertCurrent();
  if (size <= 0 || size > settings.max_bytes) throw new ImageUploadError(`单张图片不能超过 ${(settings.max_bytes / 1024 / 1024).toFixed(0)} MB`, 'too_large');
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => fs.readFile({ filePath,
    success: result => result.data instanceof ArrayBuffer ? resolve(result.data) : reject(new ImageUploadError('无法读取图片内容')),
    fail: () => reject(new ImageUploadError('无法读取图片，请重新选择')), }));
  assertCurrent();
  // WeChat RequestTask has no upload byte-progress event for raw binary bodies.
  onProgress?.({ phase: 'uploading', progress: null });
  const result = await send('POST', uploadId ? '?retry=1' : '', bytes);
  return waitForComplete(result);
}
