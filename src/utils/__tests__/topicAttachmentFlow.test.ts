import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { createTopic } from 'guanggu-forum-api';
import CreateTopic from '../../pages/createTopic';
import { STICKERS } from '../stickers';
import type { TopicAttachment } from '../../pages/createTopic/TopicEditor';
import type { EditorSnapshot } from '../../pages/createTopic/RichTopicBody';

const h = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], effects: [] as any[], cursor: 0, refCursor: 0, owner: 'tester', storage: new Map<string, any>() }));
vi.mock('react', () => ({
  useState(initial: any) { const i = h.cursor++; if (!(i in h.state)) h.state[i] = typeof initial === 'function' ? initial() : initial; return [h.state[i], (next: any) => { h.state[i] = typeof next === 'function' ? next(h.state[i]) : next; }]; },
  useRef(initial: any) { return h.refs[h.refCursor++] ??= { current: initial }; },
  useEffect(effect: any) { h.effects.push(effect); },
}));
vi.mock('@tarojs/components', () => Object.fromEntries(['View', 'Text', 'Image', 'ScrollView', 'Picker', 'Radio', 'RadioGroup'].map(name => [name, name])));
vi.mock('@tarojs/taro', () => ({ default: { useDidHide: vi.fn(), useUnload: vi.fn(), hideKeyboard: vi.fn().mockResolvedValue(undefined), showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), navigateBack: vi.fn(), eventCenter: { trigger: vi.fn() } }, useRouter: () => ({ params: {} }) }));
vi.mock('guanggu-forum-api', () => ({ createTopic: vi.fn().mockResolvedValue(undefined), fetchLinkSummary: vi.fn() }));
vi.mock('../nodeNavigation', () => ({ getCachedNodeNavigation: () => [], fetchAndCacheNodeNavigation: vi.fn().mockResolvedValue([]) }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => h.owner }));
vi.mock('../auth', () => ({ openLoginModal: vi.fn() }));
vi.mock('../CacheService', () => ({ cacheService: { get: (key: string) => h.storage.get(key), set: (key: string, value: any) => h.storage.set(key, value), remove: (key: string) => h.storage.delete(key) }, CacheCategory: { Topic: 'topic' } }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => 'skyline' }));
vi.mock('../../pages/createTopic/TopicEditor', () => ({ default: 'TopicEditor', restoreTopicAttachments: (value: unknown) => value || [] }));
vi.mock('../../components/ClearableInput', () => ({ ClearableTextarea: 'ClearableTextarea', ClearableInput: 'ClearableInput' }));
vi.mock('../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../components/HtmlRender', () => ({ default: 'HtmlRender' }));
vi.mock('../../components/NodePicker', () => ({ default: 'NodePicker' }));
vi.mock('../../components/LinkPreviewCard', () => ({ default: 'LinkPreviewCard' }));
vi.mock('../../components/LinkPreviewCard/Header', () => ({ LinkPreviewHeader: 'LinkPreviewHeader' }));
function all(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : []; }
function render() { h.cursor = h.refCursor = 0; return all(CreateTopic()); }
function body() { return render().find(node => node.type === 'TopicEditor')!.props; }
function button(className: string) { return render().find(node => node.props?.className === className)!.props; }
function snapshot(value: EditorSnapshot = { markdown: 'synthetic body', errors: [], unsupported: [] }) { body().inputRef.current = { snapshot: vi.fn().mockResolvedValue(value), dismissTools: vi.fn() }; }
const photo = (change: Partial<Extract<TopicAttachment, { kind: 'photo' }>> = {}): TopicAttachment => ({ id: 'photo', kind: 'photo', owner: 'tester', path: 'wxfile://synthetic', phase: 'complete', progress: 100, url: 'https://img.test/photo.jpg', ...change });
beforeEach(() => {
  h.state = []; h.refs = []; h.effects = []; h.storage.clear(); h.owner = 'tester'; vi.clearAllMocks();
  render(); h.effects.find(effect => effect.toString().includes('lastMeta'))!(); render();
  render().find(node => node.props?.onInput && node.props?.onNext)!.props.onInput('Synthetic title'); snapshot();
});
describe('independent topic attachment preview and submission', () => {
  it('publishes independent photo and sticker exactly once with the unchanged preview HTML', async () => {
    body().onAttachmentsChange(() => [photo(), { id: 'sticker', kind: 'sticker', sticker: STICKERS[0] }]);
    await button('previewBtn').onClick();
    const html = render().find(node => node.type === 'HtmlRender')!.props.html;
    expect(html.match(/<img\s/g)).toHaveLength(2);
    expect(html.split('https://img.test/photo.jpg')).toHaveLength(2);
    expect(html.split(STICKERS[0].url)).toHaveLength(2);
    expect(html.indexOf('synthetic body')).toBeLessThan(html.indexOf('https://img.test/photo.jpg'));
    expect(body().attachments).toHaveLength(2); expect(body().document).toBeUndefined();
    await button('topicPreviewPublish').onClick();
    expect(createTopic).toHaveBeenCalledExactlyOnceWith({ node: 'water', title: 'Synthetic title', content: html });
  });
  it('does not append a duplicate independent attachment when its URL is already embedded', async () => {
    body().onAttachmentsChange(() => [photo()]);
    snapshot({ markdown: 'body', document: { version: 1, delta: { ops: [{ insert: 'before' }, { insert: { image: 'https://img.test/photo.jpg' } }, { insert: 'after\n' }] } }, errors: [], unsupported: [] });
    await button('previewBtn').onClick();
    const html = render().find(node => node.type === 'HtmlRender')!.props.html;
    expect(html.match(/<img\s/g)).toHaveLength(1);
    expect(html.indexOf('before')).toBeLessThan(html.indexOf('https://img.test/photo.jpg'));
    expect(html.indexOf('https://img.test/photo.jpg')).toBeLessThan(html.indexOf('after'));
    await button('topicPreviewPublish').onClick(); expect(vi.mocked(createTopic).mock.calls[0][0].content).toBe(html);
  });
  it('restores an old managed Delta and preserves its inline image at the original position', async () => {
    h.state = []; h.refs = []; h.effects = [];
    const document = { version: 1 as const, delta: { ops: [{ insert: 'before' }, { insert: { image: 'https://img.test/photo.jpg' }, attributes: { attachmentId: 'photo' } }, { insert: 'after\n' }] } };
    const attachment = photo({ richManaged: true });
    h.storage.set('topic_draft_last', { topicType: 'normal', nodeSlug: 'water' });
    h.storage.set('topic_draft_normal_water', { title: 'Old title', content: 'legacy source', document, attachments: [attachment] });
    render(); h.effects.find(effect => effect.toString().includes('lastMeta'))!();
    expect(body().document).toBe(document); expect(body().attachments).toEqual([attachment]);
    snapshot({ markdown: 'legacy source', document, errors: [], unsupported: [] });
    await button('previewBtn').onClick();
    const html = render().find(node => node.type === 'HtmlRender')!.props.html;
    expect(html.match(/<img\s/g)).toHaveLength(1);
    expect(html.indexOf('before')).toBeLessThan(html.indexOf('https://img.test/photo.jpg'));
    expect(html.indexOf('https://img.test/photo.jpg')).toBeLessThan(html.indexOf('after'));
  });
  it.each(['foreign', 'failed'])('blocks %s attachments before preview and POST', async boundary => {
    body().onAttachmentsChange(() => [photo(boundary === 'foreign' ? { owner: 'other' } : { phase: 'failed', url: undefined })]);
    await button('previewBtn').onClick();
    expect(render().some(node => node.type === 'HtmlRender')).toBe(false);
    expect(createTopic).not.toHaveBeenCalled();
  });
});
