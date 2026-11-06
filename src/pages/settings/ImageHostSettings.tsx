import { Text, View } from '@tarojs/components';
import { GzkButton as Button, GzkNativeInput as Input } from 'gzk-ui/native-form';
import Taro from '@tarojs/taro';
import { useRef, useState } from 'react';
import { bindImageHostToken, getImageHostSettings, unbindImageHostToken, ImageHostSettingsError, type ImageHostSettings as Settings } from 'guanggu-forum-api';
import { getCachedUsername } from '../../utils/currentUser';
import { isValidImgUrlToken } from '../../utils/imageHostSettings';

export default function ImageHostSettings() {
  const [username, setUsername] = useState(getCachedUsername);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draftToken, setDraftToken] = useState('');
  const [albumId, setAlbumId] = useState('0');
  const [revokeOnPasswordChange, setRevokeOnPasswordChange] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'save' | 'unbind' | null>(null);
  const [loadError, setLoadError] = useState('');
  const scope = useRef({ account: getCachedUsername(), revision: 0, visible: true });
  const operation = useRef(false);

  const current = (account: string, revision: number) => scope.current.visible
    && scope.current.account === account && getCachedUsername() === account && scope.current.revision === revision;

  const applySettings = (next: Settings) => {
    setSettings(next);
    setAlbumId(String(next.album_id));
    setRevokeOnPasswordChange(next.revoke_on_password_change);
    setLoadError('');
  };

  const refresh = async () => {
    if (operation.current || !scope.current.visible) return;
    const account = getCachedUsername();
    if (!account || account !== scope.current.account) return;
    const revision = ++scope.current.revision;
    setLoading(true);
    setLoadError('');
    try {
      const next = await getImageHostSettings();
      if (current(account, revision)) applySettings(next);
    } catch (error) {
      if (current(account, revision)) setLoadError(error instanceof ImageHostSettingsError ? error.message : '图床配置读取失败，请重试');
    } finally {
      if (current(account, revision)) setLoading(false);
    }
  };

  Taro.useDidShow(() => {
    const account = getCachedUsername();
    scope.current = { account, revision: scope.current.revision + 1, visible: true };
    setUsername(account);
    setDraftToken('');
    setSettings(null);
    setLoadError('');
    setLoading(false);
    if (!operation.current) void refresh();
  });
  const hide = () => {
    scope.current.visible = false;
    scope.current.revision++;
    setDraftToken('');
  };
  Taro.useDidHide(hide);
  Taro.useUnload(hide);

  const mutate = async (action: 'save' | 'unbind') => {
    if (operation.current || loading || !settings || loadError) return;
    const account = getCachedUsername();
    if (!account || account !== scope.current.account) {
      Taro.showToast({ title: '账号已变化，请重新进入图床设置', icon: 'none' });
      return;
    }
    const token = draftToken.trim();
    if (action === 'save' && ((token && !isValidImgUrlToken(token)) || (!token && !settings.bound))) {
      Taro.showToast({ title: '请输入有效的 API Token', icon: 'none' });
      return;
    }
    if (action === 'save' && (!/^\d+$/.test(albumId) || !Number.isSafeInteger(Number(albumId)))) {
      Taro.showToast({ title: '请输入有效的相册 ID', icon: 'none' });
      return;
    }
    const revision = ++scope.current.revision;
    operation.current = true;
    setBusy(action);
    try {
      if (action === 'unbind') {
        const { confirm } = await Taro.showModal({
          title: '解除图床绑定', confirmText: '解除绑定',
          content: '解绑只移除论坛的托管凭证，已上传图片和帖子图片链接仍保留。请在 ImgURL 控制台自行撤销不再使用的 Token。',
        });
        if (!confirm || !current(account, revision)) return;
        const next = await unbindImageHostToken(settings.version);
        if (!current(account, revision)) return;
        applySettings(next);
        setDraftToken('');
        Taro.showToast({ title: '已解除绑定', icon: 'success' });
      } else {
        await bindImageHostToken(token, {
          version: settings.version, albumId: Number(albumId), revokeOnPasswordChange,
        });
        if (!current(account, revision)) return;
        setDraftToken('');
        setSettings(null);
        try {
          const next = await getImageHostSettings();
          if (!current(account, revision)) return;
          applySettings(next);
          Taro.showToast({ title: '配置已保存', icon: 'success' });
        } catch {
          if (current(account, revision)) {
            setLoadError('配置已保存，但状态读取失败，请刷新确认');
            Taro.showToast({ title: '已保存，请刷新确认状态', icon: 'none' });
          }
        }
      }
    } catch (error) {
      if (current(account, revision)) {
        setSettings(null);
        setLoadError('操作未确认，请刷新绑定状态后重试');
        Taro.showToast({ title: error instanceof ImageHostSettingsError ? error.message : '图床配置操作失败，请重试', icon: 'none' });
      }
    } finally {
      operation.current = false;
      setBusy(null);
      // Returning from the background invalidates the old operation's UI updates.
      if (scope.current.visible && !current(account, revision)) void refresh();
    }
  };

  const disabled = loading || !!busy || !username || !settings || !!loadError;
  const statusText = !username ? '登录后可查看绑定状态' : loading ? '正在读取绑定状态…'
    : loadError ? loadError : settings?.bound ? `已绑定 · ${settings.mask}`
      : settings ? '尚未绑定 ImgURL Token' : '绑定状态未读取';

  return <View className='settingsGroup imageHostSettings'>
    <View className='imageHostEditor'>
      <Text className='imageHostTitle'>图片托管设置</Text>
      <Text className='imageHostIntro'>绑定你自己的 ImgURL API Token。图片会上传到你的 ImgURL 账号，并通过公开链接展示。</Text>
      <View className={`imageHostStatusPanel${settings?.bound && !loadError ? ' imageHostStatusPanel--bound' : ''}`}>
        <Text className='imageHostStatus'>{statusText}</Text>
        {!!username && <Button className='imageHostRefresh' disabled={loading || !!busy} onClick={refresh}>刷新</Button>}
      </View>
      {settings?.error && <Text className='imageHostError'>{settings.error}</Text>}
      <Text className='imageHostLabel'>ImgURL API Token</Text>
      <Input className='imageHostTokenInput' type='text' password value={draftToken} disabled={disabled} maxlength={4096} confirmType='done'
        placeholder={settings?.bound ? '留空保留当前 Token，输入新 Token 可替换' : '粘贴你的 ImgURL API Token'}
        onInput={event => setDraftToken(event.detail.value)} onConfirm={() => mutate('save')} />
      <View className='imageHostPrivacy'>
        <Text className='imageHostHint'>请勿上传个人隐私资料。图床空间、套餐和额度由 ImgURL 管理。</Text>
        <Text className='imageHostHint'>Token 由论坛保存，不会回显。解绑只移除论坛的托管凭证，已上传图片和帖子图片链接仍保留。请在 ImgURL 控制台自行撤销不再使用的 Token。</Text>
      </View>
      <View className='imageHostActions'>
        <Button className='imageHostSave' disabled={disabled} loading={busy === 'save'} onClick={() => mutate('save')}><Text>验证并保存</Text></Button>
        <Button className='imageHostRemove' disabled={disabled || !settings?.bound} loading={busy === 'unbind'} onClick={() => mutate('unbind')}><Text>解除绑定</Text></Button>
      </View>
    </View>
  </View>;
}
