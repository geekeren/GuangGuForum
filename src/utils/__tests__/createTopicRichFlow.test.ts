import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { createTopic } from 'guanggu-forum-api';
import CreateTopic from '../../pages/createTopic';
import TopicTitle from '../../pages/createTopic/TopicTitle';
import { TOPIC_TYPE_REGISTRY } from '../../pages/createTopic/topicTypes/registry';
import { serializeTopicDocumentHtml, topicMarkdownToSafeHtml, importTopicMarkdown } from '../topicDocument';

const h = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], effects: [] as any[], cursor: 0, refCursor: 0, owner: 'tester', storage: new Map<string, any>() }));
vi.mock('react', () => ({
  useState(initial: any) { const i = h.cursor++; if (!(i in h.state)) h.state[i] = typeof initial === 'function' ? initial() : initial; return [h.state[i], (v: any) => { h.state[i] = typeof v === 'function' ? v(h.state[i]) : v; }]; },
  useRef(initial: any) { return h.refs[h.refCursor++] ??= { current: initial }; },
  useEffect(effect: any) { h.effects.push(effect); },
}));
vi.mock('@tarojs/components', () => Object.fromEntries(['View', 'Text', 'Image', 'ScrollView', 'Picker', 'Radio', 'RadioGroup'].map(name => [name, name])));
vi.mock('@tarojs/taro', () => ({ default: { useDidHide: vi.fn(), useUnload: vi.fn(), showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), navigateBack: vi.fn(), eventCenter: { trigger: vi.fn() } }, useRouter: () => ({ params: {} }) }));
vi.mock('guanggu-forum-api', () => ({ createTopic: vi.fn(), fetchLinkSummary: vi.fn() }));
vi.mock('../nodeNavigation', () => ({ getCachedNodeNavigation: () => [], fetchAndCacheNodeNavigation: vi.fn().mockResolvedValue([]) }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => h.owner }));
vi.mock('../auth', () => ({ openLoginModal: vi.fn() }));
vi.mock('../CacheService', () => ({ cacheService: { get: (key: string) => h.storage.get(key), set: (key: string, value: any) => h.storage.set(key, value), remove: (key: string) => h.storage.delete(key) }, CacheCategory: { Topic: 'topic' } }));
vi.mock('../renderer', () => ({ isSkyline: () => true, getScrollViewType: () => 'list' }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => 'skyline', usePageScrollViewType: () => 'custom' }));
vi.mock('../../pages/createTopic/TopicEditor', () => ({ default: 'TopicEditor', restoreTopicAttachments: (value: any) => value || [] }));
vi.mock('../../components/ClearableInput', () => ({ ClearableTextarea: 'ClearableTextarea', ClearableInput: 'ClearableInput' }));
vi.mock('../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../components/HtmlRender', () => ({ default: 'HtmlRender' }));
vi.mock('../../components/NodePicker', () => ({ default: 'NodePicker' }));
vi.mock('../../components/LinkPreviewCard', () => ({ default: 'LinkPreviewCard' }));
vi.mock('../../components/LinkPreviewCard/Header', () => ({ LinkPreviewHeader: 'LinkPreviewHeader' }));
function elements(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }
function render() { h.cursor = 0; h.refCursor = 0; return elements(CreateTopic()); }
function body() { return render().find(e => e.type === 'TopicEditor')!.props; }
function find(name: string) { return render().find(e => e.props?.className === name)!; }
function setSnapshot(markdown: string, document?: any) {
  const snapshot = vi.fn().mockResolvedValue({ markdown, document, errors: [], unsupported: [] });
  body().inputRef.current = { snapshot }; return snapshot;
}
// Drive the real page-to-title contract without executing TopicTitle's isolated hooks.
function title(value = '标题') { render().find(e => e.type === TopicTitle)!.props.onInput(value); }
beforeEach(() => {
  h.state = []; h.refs = []; h.effects = []; h.owner = 'tester'; h.storage.clear(); vi.clearAllMocks();
  render(); h.effects[4](); render();
  title(); setSnapshot('正文');
});
describe('safe HTML publishing flow', () => {
  it.each(['normal', 'event', 'dating', 'repost'] as const)('composes %s as HTML with body exactly once and escaped fields', type => {
    const bodyHtml = '<p>前<strong>正文</strong><img src="https://img.test/p.jpg" alt="图" />后</p>';
    const result = TOPIC_TYPE_REGISTRY[type].buildContent({ eventDate: '2026-11-03', eventHour: '09:00', eventLocation: '<script>x</script>', gender: '<男>', birthYear: '2000', requirements: '<期望>', sourceUrl: 'https://example.test/a', sourceTitle: '<标题>', summary: '**摘要**', fullRepost: false }, { title: 'title', content: bodyHtml, fromMini: '<p>footer</p>' });
    expect(result.split(bodyHtml)).toHaveLength(2); expect(result).toContain('<p>footer</p>');
    expect(result).not.toContain('<script>'); expect(result).not.toContain('## ');
    if (type === 'event') expect(result).toContain('&lt;script&gt;');
    if (type === 'dating') expect(result).toContain('&lt;期望&gt;');
    if (type === 'repost') expect(result).toContain('<strong>摘要</strong>');
  });
  it('snapshots native Delta before HTML preview and submits the exact preview HTML', async () => {
    const document = { version: 1, delta: { ops: [{ insert: '前' }, { insert: '粗', attributes: { bold: true } }, { insert: { image: 'https://img.test/p.jpg' } }, { insert: '后\n' }] } };
    const snapshot = setSnapshot('not final markdown', document);
    await find('previewBtn').props.onClick();
    expect(snapshot).toHaveBeenCalledOnce();
    const preview = render().find(e => e.type === 'HtmlRender')!.props.html;
    expect(preview).toContain('<p>前<strong>粗</strong><img src="https://img.test/p.jpg" alt="图片">后</p>');
    expect(preview).not.toContain('not final markdown');
    await find('topicPreviewPublish').props.onClick();
    expect(createTopic).toHaveBeenCalledWith({ node: 'water', title: '标题', content: preview });
  });
  it.each(['native', 'source', 'unsupported source'] as const)('separates %s content and independent attachments from one source footer in preview and submission', async mode => {
    const sourceFooter = '<p><em>本帖发自<a href="https://www.guozaoke.com/t/91893">小程序</a></em></p>';
    const document = mode === 'native' ? { version: 1, delta: { ops: [{ insert: '正文' }, { insert: { image: 'https://img.test/inline.jpg' } }, { insert: '\n' }] } } : undefined;
    const markdown = mode === 'unsupported source' ? '```html\n<hr><p>作者文字</p>\n```' : '正文![图片](https://img.test/inline.jpg)';
    const authored = document ? serializeTopicDocumentHtml(document.delta).html : topicMarkdownToSafeHtml(markdown).html;
    setSnapshot(markdown, document);
    const assertPreview = async (attachmentHtml = '') => {
      await find('previewBtn').props.onClick();
      const preview = render().find(e => e.type === 'HtmlRender')!.props.html;
      expect(preview).toBe(`${authored}${attachmentHtml}<hr>${sourceFooter}`);
      expect(preview.match(/本帖发自/g)).toHaveLength(1);
      expect(preview.match(/<hr\s*\/?\s*>/g)).toHaveLength(1);
      return preview;
    };
    await assertPreview();
    // Re-preview adds an independent image before the separator, not after the
    // source or as a second body/footer. No real upload or publishing occurs.
    h.state[8] = null;
    body().onAttachmentsChange(() => [{ id: 'tail', kind: 'photo', owner: 'tester', path: 'wxfile://synthetic', phase: 'complete', progress: 100, url: 'https://img.test/tail.jpg' }]);
    const preview = await assertPreview('<p><img src="https://img.test/tail.jpg" alt="图片" /></p>');
    await find('topicPreviewPublish').props.onClick();
    expect(createTopic).toHaveBeenCalledOnce();
    expect(createTopic).toHaveBeenCalledWith({ node: 'water', title: '标题', content: preview });
  });
  it('rejects unavailable/failing snapshots and empty authored body before footer', async () => {
    body().inputRef.current = null; await find('previewBtn').props.onClick();
    expect(render().some(e => e.type === 'HtmlRender')).toBe(false);
    setSnapshot(''); await find('previewBtn').props.onClick();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '请输入内容', icon: 'none' });
    expect(createTopic).not.toHaveBeenCalled();
  });
  it('locks clear/type changes while snapshot awaits and ignores unmounted preview result', async () => {
    let resolve!: (value: any) => void;
    body().inputRef.current = { snapshot: () => new Promise(yes => { resolve = yes; }) };
    const pending = find('previewBtn').props.onClick(); body().onClear();
    expect(body().value).toBe(''); // Original event state has not yet been replaced by pending snapshot.
    const state = [...h.state];
    render().find(e => e.props?.className?.split(' ').includes('typeTag') && !e.props.className.split(' ').includes('typeTag--active'))!.props.onClick();
    expect(h.state).toEqual(state);
    h.effects[0]()(); resolve({ markdown: '正文', errors: [], unsupported: [] }); await pending;
    expect(render().some(e => e.type === 'HtmlRender')).toBe(false);
  });
  it('migrates legacy Markdown draft and preserves unsupported source for escaped HTML preview', async () => {
    h.state = []; h.refs = []; h.effects = [];
    const source = '```js\n<script>alert(1)</script>\n```';
    h.storage.set('topic_draft_last', { topicType: 'normal', nodeSlug: 'water' });
    h.storage.set('topic_draft_normal_water', { title: '旧草稿', content: source });
    render(); h.effects[4](); expect(body().value).toBe(source);
    setSnapshot(source); await find('previewBtn').props.onClick();
    const preview = render().find(e => e.type === 'HtmlRender')!.props.html;
    expect(preview).toContain(topicMarkdownToSafeHtml(source).html); expect(preview).not.toContain('<script>');
  });
  it('does not duplicate or resurrect managed images and validates source-owned references', async () => {
    const image = { id: 'p', kind: 'photo', owner: 'tester', path: 'wxfile://p', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg', richManaged: true };
    body().onAttachmentsChange(() => [image]);
    const source = `![图片](${image.url})`;
    setSnapshot(source); await find('previewBtn').props.onClick();
    expect(render().find(e => e.type === 'HtmlRender')!.props.html.match(/<img /g)).toHaveLength(1);
    // New flow with a removed embed retains tray metadata but never tail-appends it.
    h.state[8] = null; setSnapshot('保留文字'); await find('previewBtn').props.onClick();
    expect(render().find(e => e.type === 'HtmlRender')!.props.html).not.toContain('<img ');
    h.state[8] = null; setSnapshot(source); h.owner = 'other'; await find('previewBtn').props.onClick();
    expect(render().some(e => e.type === 'HtmlRender')).toBe(false);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '图片所属账号已变化，请移除后重新上传', icon: 'none' });
  });
  it('checks managed ownership after source-to-rich roundtrip drops attachment tags', async () => {
    const image = { id: 'roundtrip', kind: 'photo', owner: 'tester', path: 'wxfile://p', phase: 'complete', progress: 100, url: 'https://img.test/p(1).jpg', richManaged: true };
    body().onAttachmentsChange(() => [image]);
    const source = `![图片](${image.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
    const document = { version: 1, delta: importTopicMarkdown(source).delta };
    expect(serializeTopicDocumentHtml(document.delta).referencedAttachmentIds).toEqual([]);
    setSnapshot(source, document); await find('previewBtn').props.onClick();
    expect(render().find(e => e.type === 'HtmlRender')!.props.html.match(/<img /g)).toHaveLength(1);
    h.state[8] = null; h.owner = 'other'; setSnapshot(source, document);
    await find('previewBtn').props.onClick();
    expect(render().some(e => e.type === 'HtmlRender')).toBe(false);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '图片所属账号已变化，请移除后重新上传', icon: 'none' });
    expect(createTopic).not.toHaveBeenCalled();
  });
  it('keeps native serializer errors caller-enforced', () => {
    expect(serializeTopicDocumentHtml({ ops: [{ insert: { image: 'wxfile://local' } }, { insert: '\n' }] }).errors.length).toBeGreaterThan(0);
  });
});
