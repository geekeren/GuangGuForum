import Taro from '@tarojs/taro';
import { getImageHostSettings, ImageHostSettingsError } from 'guanggu-forum-api';
import { getCachedUsername } from './currentUser';
import { APP_ROUTES } from './appRoutes';

const IMAGE_SETTINGS_PAGE = APP_ROUTES.imageSettings;
let navigation: Promise<void> | null = null;

export async function openImageHostSettings(): Promise<void> {
  const pages = Taro.getCurrentPages();
  if (pages[pages.length - 1]?.route === IMAGE_SETTINGS_PAGE.slice(1)) return;
  if (navigation) return navigation;
  navigation = (async () => {
    let confirmed = false;
    try {
      const result = await Taro.showModal({
        title: '需要配置图床', content: '上传图片需要绑定你自己的 ImgURL API Token，是否前往图床设置？',
        confirmText: '去配置', cancelText: '取消',
      });
      confirmed = result.confirm;
    } catch { return; }
    if (!confirmed) return;
    try { await Taro.hideKeyboard(); } catch { /* Some runtimes have no active keyboard. */ }
    try { await Taro.navigateTo({ url: IMAGE_SETTINGS_PAGE }); }
    catch { Taro.showToast({ title: '无法打开图床设置，请从设置页进入', icon: 'none' }); }
  })();
  try { await navigation; } finally { navigation = null; }
}

export async function ensureImageHostBound(isCurrent = () => true): Promise<boolean> {
  const account = getCachedUsername();
  if (!isCurrent()) return false;
  if (!account) { await openImageHostSettings(); return false; }
  try {
    const settings = await getImageHostSettings();
    if (!isCurrent() || getCachedUsername() !== account) return false;
    if (!settings.bound || settings.error) { await openImageHostSettings(); return false; }
    return true;
  } catch (error) {
    if (isCurrent() && getCachedUsername() === account) {
      Taro.showToast({ title: error instanceof ImageHostSettingsError ? error.message : '无法检查图床绑定状态，请重试', icon: 'none' });
    }
    return false;
  }
}
