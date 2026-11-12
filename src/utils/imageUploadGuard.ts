import Taro from '@tarojs/taro';
import { getImageHostSettings, ImageHostSettingsError } from 'guanggu-forum-api';
import { getCachedUsername } from './currentUser';
import { APP_ROUTES } from './appRoutes';
import { createPageNavigation, type PageOwner } from "./pageScope";

const IMAGE_SETTINGS_PAGE = APP_ROUTES.imageSettings;
let legacyNavigation: Promise<void> | null = null;
const pendingNavigations = new WeakMap<PageOwner, Promise<void>>();

export async function openImageHostSettings(owner?: PageOwner, isCurrent = () => true): Promise<void> {
  if (!isCurrent() || owner?.route === IMAGE_SETTINGS_PAGE.slice(1)) return;
  const existing = owner ? pendingNavigations.get(owner) : legacyNavigation;
  if (existing) return existing;
  const navigation = (async () => {
    let confirmed = false;
    try {
      const result = await Taro.showModal({
        title: '需要配置图床', content: '上传图片需要绑定你自己的 ImgURL API Token，是否前往图床设置？',
        confirmText: '去配置', cancelText: '取消',
      });
      confirmed = result.confirm;
    } catch { return; }
    if (!confirmed || !isCurrent()) return;
    try { await Taro.hideKeyboard(); } catch { /* Some runtimes have no active keyboard. */ }
    if (!isCurrent()) return;
    try { await createPageNavigation(owner).navigateTo({ url: IMAGE_SETTINGS_PAGE }); }
    catch { if (isCurrent()) Taro.showToast({ title: '无法打开图床设置，请从设置页进入', icon: 'none' }); }
  })();
  if (owner) pendingNavigations.set(owner, navigation); else legacyNavigation = navigation;
  try { await navigation; } finally {
    if (owner) pendingNavigations.delete(owner); else legacyNavigation = null;
  }
}

export async function ensureImageHostBound(isCurrent = () => true, owner?: PageOwner): Promise<boolean> {
  const account = getCachedUsername();
  if (!isCurrent()) return false;
  if (!account) { await openImageHostSettings(owner, isCurrent); return false; }
  try {
    const settings = await getImageHostSettings();
    if (!isCurrent() || getCachedUsername() !== account) return false;
    if (!settings.bound || settings.error) { await openImageHostSettings(owner, isCurrent); return false; }
    return true;
  } catch (error) {
    if (isCurrent() && getCachedUsername() === account) {
      Taro.showToast({ title: error instanceof ImageHostSettingsError ? error.message : '无法检查图床绑定状态，请重试', icon: 'none' });
    }
    return false;
  }
}
