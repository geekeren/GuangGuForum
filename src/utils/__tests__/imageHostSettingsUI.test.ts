import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { readFileSync } from 'node:fs';
import ImageHostSettings from '../../pages/settings/ImageHostSettings';
import { bindImageHostToken, ImageHostSettingsError } from 'guanggu-forum-api';
import { clearImgUrlToken, getImgUrlToken, isValidImgUrlToken, saveImgUrlToken } from '../imageHostSettings';

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, username: 'account-a' }));
vi.mock('react', () => ({
  useState: (initial: any) => {
    const i = harness.cursor++;
    if (!(i in harness.state)) harness.state[i] = typeof initial === 'function' ? initial() : initial;
    return [harness.state[i], (next: any) => { harness.state[i] = next; }];
  },
  useRef: (initial: any) => {
    const i = harness.refCursor++;
    if (!(i in harness.refs)) harness.refs[i] = { current: initial };
    return harness.refs[i];
  },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Input: 'Input', Button: 'Button' }));
vi.mock('@tarojs/taro', () => ({ default: { useDidShow: vi.fn(), useDidHide: vi.fn(), showToast: vi.fn(), showModal: vi.fn() } }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => harness.username }));
vi.mock('guanggu-forum-api', () => ({ bindImageHostToken: vi.fn(), ImageHostSettingsError: class extends Error {} }));
vi.mock('../imageHostSettings', () => ({ getImgUrlToken: vi.fn(), saveImgUrlToken: vi.fn(), clearImgUrlToken: vi.fn(), isValidImgUrlToken: vi.fn() }));

function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...all(tree.props?.children)];
}
function render() { harness.cursor = 0; harness.refCursor = 0; return ImageHostSettings(); }
function find(tree: any, name: string) { return all(tree).find(e => e.type === name || e.props?.className?.split(' ').includes(name))?.props; }
function open() { find(render(), 'settingsItem').onClick(); return render(); }
beforeEach(() => {
  harness.state = []; harness.refs = []; harness.username = 'account-a';
  vi.resetAllMocks();
  vi.mocked(getImgUrlToken).mockReturnValue('');
  vi.mocked(saveImgUrlToken).mockReturnValue(true);
  vi.mocked(bindImageHostToken).mockResolvedValue(undefined);
  vi.mocked(clearImgUrlToken).mockReturnValue(true);
  vi.mocked(isValidImgUrlToken).mockImplementation(token => !!token && !/\s/.test(token));
  vi.mocked(Taro.showModal).mockResolvedValue({ confirm: true, cancel: false } as any);
});

describe('image host settings editor', () => {
  it('is included in settings and never pre-fills the saved secret', () => {
    expect(readFileSync('src/pages/settings/index.tsx', 'utf8')).toContain('<ImageHostSettings />');
    vi.mocked(getImgUrlToken).mockReturnValue('sample-existing-secret');
    const tree = open();
    expect(find(tree, 'Input').value).toBe('');
    expect(find(tree, 'Input').password).toBe(true);
    expect(JSON.stringify(tree)).not.toContain('sample-existing-secret');
  });
  it('binds a replacement before saving locally and keeps failed input editable', async () => {
    find(open(), 'Input').onInput({ detail: { value: 'sample-new-token' } });
    await find(render(), 'imageHostSave').onClick();
    expect(bindImageHostToken).toHaveBeenCalledWith('sample-new-token');
    expect(saveImgUrlToken).toHaveBeenCalledWith('sample-new-token', 'account-a');
    expect(find(render(), 'Input').value).toBe('');
    find(render(), 'Input').onInput({ detail: { value: 'bad token' } });
    await find(render(), 'imageHostSave').onClick();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '请输入有效的 API Token', icon: 'none' });
    find(render(), 'Input').onInput({ detail: { value: 'sample-retry-token' } });
    vi.mocked(saveImgUrlToken).mockReturnValue(false);
    await find(render(), 'imageHostSave').onClick();
    expect(find(render(), 'Input').value).toBe('sample-retry-token');
  });
  it('does not allow guests to edit and rejects a save after account switching', async () => {
    harness.username = '';
    expect(find(open(), 'Input')).toBeUndefined();
    harness.username = 'account-a';
    find(open(), 'Input').onInput({ detail: { value: 'sample-new-token' } });
    harness.username = 'account-b';
    await find(render(), 'imageHostSave').onClick();
    expect(saveImgUrlToken).not.toHaveBeenCalled();
    expect(find(render(), 'Input')).toBeUndefined();
  });
  it('does not save a token after failed binding and blocks duplicate submissions', async () => {
    find(open(), 'Input').onInput({ detail: { value: 'sample-new-token' } });
    let reject: (error: Error) => void = () => {};
    vi.mocked(bindImageHostToken).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const save = find(render(), 'imageHostSave').onClick;
    const pending = save();
    await save();
    expect(find(render(), 'Input').disabled).toBe(true);
    reject(new ImageHostSettingsError('绑定失败，请检查 API Token 是否有效'));
    await pending;
    expect(bindImageHostToken).toHaveBeenCalledOnce();
    expect(saveImgUrlToken).not.toHaveBeenCalled();
    expect(find(render(), 'Input').value).toBe('sample-new-token');
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '绑定失败，请检查 API Token 是否有效', icon: 'none' });
  });
  it('deletes only after confirmation and clears drafts on page hide', async () => {
    vi.mocked(getImgUrlToken).mockReturnValue('sample-existing-token');
    open();
    vi.mocked(Taro.showModal).mockResolvedValueOnce({ confirm: false } as any);
    await find(render(), 'imageHostRemove').onClick();
    expect(clearImgUrlToken).not.toHaveBeenCalled();
    await find(render(), 'imageHostRemove').onClick();
    expect(clearImgUrlToken).toHaveBeenCalledWith('account-a');
    find(render(), 'Input').onInput({ detail: { value: 'sample-draft' } });
    vi.mocked(Taro.useDidHide).mock.calls.at(-1)![0]();
    expect(find(render(), 'Input')).toBeUndefined();
    expect(find(open(), 'Input').value).toBe('');
  });
});
