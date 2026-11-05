import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Picker, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import type { OwnProfileFields } from 'guanggu-forum-api';
import ThemePage from '../../components/ThemePage';
import Navbar from '../../components/Navbar';
import { ClearableInput, ClearableTextarea } from '../../components/ClearableInput';
import Loading from '../../components/Loading';
import LoginPrompt from '../../components/LoginPrompt';
import { useCurrentUsername } from '../../hooks/useCurrentUsername';
import { usePageScrollViewType } from '../../hooks/usePageRenderer';
import { useTheme } from '../../hooks/useTheme';
import { THEME_PALETTES } from '../../utils/themePreferences';
import { getCachedUsername, subscribeCurrentAccount } from '../../utils/currentUser';
import { ProfileEditState } from './profileEditState';
import './edit-profile.scss';

const TEXT_FIELDS: { name: keyof OwnProfileFields; label: string }[] = [
  { name: 'nickname', label: '昵称' }, { name: 'signature', label: '签名' }, { name: 'location', label: '城市' },
  { name: 'website', label: '网站' }, { name: 'college', label: '学校' }, { name: 'company', label: '公司' },
];

function ProfileEditor() {
  const scrollType = usePageScrollViewType();
  const { theme } = useTheme();
  const caretColor = THEME_PALETTES[theme]['input-caret'];
  const { username, loading, error, retry } = useCurrentUsername();
  const stateRef = useRef<ProfileEditState>();
  if (!stateRef.current) stateRef.current = new ProfileEditState();
  const store = stateRef.current;
  const data = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const shown = useRef(true);
  const initialize = () => {
    const account = getCachedUsername();
    if (store.snapshot().visible && store.snapshot().account === account) return;
    store.activate(account); void store.load();
  };
  useDidShow(() => { shown.current = true; initialize(); });
  useDidHide(() => { shown.current = false; store.hide(); Taro.disableAlertBeforeUnload?.(); });
  useEffect(() => {
    if (shown.current && username && username === getCachedUsername()) initialize(); else store.hide();
    return store.hide;
  }, [store, username]);
  useEffect(() => subscribeCurrentAccount(() => store.hide()), [store]);
  useEffect(() => () => { shown.current = false; store.hide(); Taro.disableAlertBeforeUnload?.(); }, [store]);
  const sameAccount = data.visible && data.account === getCachedUsername() && data.account === username;
  const dirty = sameAccount && data.dirty;
  useEffect(() => {
    if (dirty) Taro.enableAlertBeforeUnload?.({ message: '资料尚未保存，离开将丢弃修改' });
    else Taro.disableAlertBeforeUnload?.();
    return () => Taro.disableAlertBeforeUnload?.();
  }, [dirty]);
  const reload = async () => {
    if (!store.visible() || store.snapshot().saving || store.snapshot().loading) return;
    const current = store.snapshot();
    if (current.dirty) {
      try {
        const result = await Taro.showModal({ title: '刷新资料', content: '刷新会丢弃当前修改，读取服务器上的资料。是否继续？', confirmText: '刷新', cancelText: '保留修改' });
        if (!result.confirm || !store.visible() || store.snapshot().generation !== current.generation) return;
      } catch { return; }
    }
    void store.load();
  };
  const disabled = data.loading || data.saving;
  const canSave = sameAccount && data.dirty && !disabled && !data.requiresRefresh;
  return <View className='profileEditor'>
    <Navbar back shared={false} title='编辑资料' titleStyle={{ opacity: 1, transform: 'none' }} />
    {!getCachedUsername() ? <View className='profileEditorStatus'>{loading ? <Loading /> : <LoginPrompt icon='资料' title='登录后编辑资料' desc='仅可编辑当前登录账号的个人资料' />}
      {error && <Text className='profileEditorAction' onClick={retry}>登录状态加载失败，点击重试</Text>}</View>
      : !sameAccount ? <View className='profileEditorStatus'><Text className='profileEditorMuted'>请重新校验登录账号后加载资料</Text><Text className='profileEditorAction' onClick={() => { retry(); initialize(); }}>重新加载</Text></View>
      : <>
        <ScrollView type={scrollType} scrollY enhanced className='profileEditorScroll'>
          {data.loading && !data.fields ? <View className='profileEditorStatus'><Loading /></View> : null}
          {data.error && <Text className='profileEditorError' onClick={reload}>{data.error}{data.requiresRefresh ? '，点击刷新检查' : '，点击重试'}</Text>}
          {data.notice && <Text className='profileEditorNotice'>{data.notice}</Text>}
          {data.draft && data.fields && <View className='profileEditorFields'>
            <View className='profileEditorField'><Text className='profileEditorLabel'>用户名</Text><Text className='profileEditorReadonly'>{data.draft.username}</Text></View>
            <View className='profileEditorField'><Text className='profileEditorLabel'>Email</Text><Text className='profileEditorReadonly'>{data.draft.email || '未设置'}</Text></View>
            <Text className='profileEditorMuted'>用户名与 Email 仅供查看，此页不修改头像或账号信息。</Text>
            {TEXT_FIELDS.map(field => <View key={field.name} className='profileEditorField'><Text className='profileEditorLabel'>{field.label}</Text>
              <View className={disabled ? 'profileEditorControl profileEditorControl--disabled' : 'profileEditorControl'}>
                <ClearableInput className='profileEditorInput' value={data.fields![field.name]} maxlength={-1} cursorColor={caretColor} style={{ caretColor }} disabled={disabled} onInput={text => store.change(field.name, text)} />
              </View>
            </View>)}
            {(['gender', 'generation'] as const).map(name => {
              const options = data.draft!.options[name]; const index = options.findIndex(option => option.value === data.fields![name]);
              return <View key={name} className='profileEditorField'><Text className='profileEditorLabel'>{name === 'gender' ? '性别' : '年代'}</Text>
                <Picker mode='selector' disabled={disabled} range={options.map(option => option.label)} value={Math.max(0, index)} onChange={event => {
                  const option = options[Number(event.detail.value)]; if (option) store.change(name, option.value);
                }}><View className='profileEditorPicker'><Text>{options[index]?.label || '请选择'}</Text><Text className='profileEditorAction'>选择</Text></View></Picker>
              </View>;
            })}
            <View className='profileEditorField'><Text className='profileEditorLabel'>个人简介</Text><View className={disabled ? 'profileEditorControl profileEditorControl--disabled' : 'profileEditorControl'}>
              <ClearableTextarea className='profileEditorTextarea' value={data.fields.self_intro} maxlength={-1} autoHeight style={{ caretColor }} disabled={disabled} onInput={text => store.change('self_intro', text)} />
            </View></View>
          </View>}
        </ScrollView>
        <View className='profileEditorDock'><Text className='profileEditorAction' onClick={reload}>刷新资料</Text><View ariaRole='button' ariaLabel='保存个人资料'
          className={`profileEditorSave ${canSave ? '' : 'profileEditorSave--disabled'}`} onClick={() => { if (canSave) void store.save(() => { Taro.eventCenter.trigger('ownProfileSettingsUpdated', data.account); }); }}><Text>{data.saving ? '保存中…' : '保存'}</Text></View></View>
      </>}
  </View>;
}
export default function EditProfilePage() { return <ThemePage><ProfileEditor /></ThemePage>; }
