import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeEditorAdapter, type NativeEditorContext } from '../../pages/createTopic/nativeEditor';
import { planEditorShortcut } from '../../pages/createTopic/editorShortcuts';
import type { TopicDelta } from '../topicDocument';

const plain = (text: string): TopicDelta => ({ ops: [{ insert: text + '\n' }] });
function context(overrides = {}) {
  return { getContents: vi.fn((cb: any) => cb.success({ delta: plain('body') })), setContents: vi.fn((cb: any) => cb.success({})),
    insertText: vi.fn((cb: any) => cb.success({})), insertImage: vi.fn((cb: any) => cb.success({})), format: vi.fn(),
    getSelection: vi.fn((cb: any) => cb.success({ range: { index: 0, length: 0 } })), setSelection: vi.fn((cb: any) => cb.success({})),
    deleteText: vi.fn((cb: any) => cb.success({})), ...overrides } as unknown as NativeEditorContext;
}
afterEach(() => vi.useRealTimers());
describe('native topic editor adapter', () => {
  it('queues snapshot behind insertion and preserves inline insertion options', async () => {
    let complete!: (value: any) => void;
    const ctx = context({ insertImage: vi.fn((cb: any) => { complete = cb.success; }) });
    const editor = createNativeEditorAdapter(ctx, () => true);
    const insert = editor.insertImage('https://img.test/p.jpg', 'p', '图片');
    const read = editor.snapshot(); await Promise.resolve();
    expect(ctx.getContents).not.toHaveBeenCalled();
    expect(ctx.insertImage).toHaveBeenCalledWith(expect.objectContaining({ nowrap: true, data: { attachmentId: 'p' } }));
    complete({}); await insert; expect(await read).toEqual(plain('body'));
  });
  it('times out absent callbacks, ignores late callback and permits retry', async () => {
    vi.useFakeTimers(); let late!: (value: any) => void;
    const ctx = context({ getContents: vi.fn((cb: any) => { late = cb.success; }) });
    const editor = createNativeEditorAdapter(ctx, () => true, 100);
    const read = editor.snapshot(); const rejection = expect(read).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100); await rejection; late({ delta: plain('late') });
    vi.mocked(ctx.getContents).mockImplementation((cb: any) => cb.success({ delta: plain('retry') }));
    expect(await editor.snapshot()).toEqual(plain('retry'));
  });
  it('rejects disposal and callback failure without blocking later queue jobs', async () => {
    const ctx = context({ getContents: vi.fn((cb: any) => cb.fail(new Error('native failed'))) });
    const editor = createNativeEditorAdapter(ctx, () => true);
    await expect(editor.snapshot()).rejects.toThrow('native failed');
    vi.mocked(ctx.getContents).mockImplementation((cb: any) => cb.success({ delta: plain('retry') }));
    expect(await editor.snapshot()).toEqual(plain('retry'));
    editor.dispose(); await expect(editor.snapshot()).rejects.toThrow('disposed');
  });
  it.each(['h2', 'h3'] as const)('forwards native %s without replacing contents or changing the selection', async header => {
    const ctx = context(); const editor = createNativeEditorAdapter(ctx, () => true);
    await editor.format('header', header);
    expect(ctx.format).toHaveBeenCalledOnce(); expect(ctx.format).toHaveBeenCalledWith('header', header);
    expect(ctx.setContents).not.toHaveBeenCalled(); expect(ctx.setSelection).not.toHaveBeenCalled(); expect(ctx.deleteText).not.toHaveBeenCalled(); expect(ctx.insertText).not.toHaveBeenCalled();
  });
  it('stops a multi-delete shortcut when the live revision changes', async () => {
    let current = true;
    const ctx = context({ deleteText: vi.fn((cb: any) => { current = false; cb.success({}); }) });
    const editor = createNativeEditorAdapter(ctx, () => true);
    const plan = planEditorShortcut(plain('**正文*'), plain('**正文**'), { index: 6, length: 0 })!;
    await expect(editor.shortcut(plan, () => current)).rejects.toThrow('changed');
    expect(ctx.deleteText).toHaveBeenCalledOnce(); expect(ctx.format).not.toHaveBeenCalled();
  });
});
describe('conservative appended Markdown shortcuts', () => {
  it.each([['#', '# ', 'header', 'h1'], ['##', '## ', 'header', 'h2'], ['###', '### ', 'header', 'h3'], ['-', '- ', 'list', 'bullet']])('converts %s delimiter', (before, after, name, value) => {
    expect(planEditorShortcut(plain(before), plain(after), { index: after.length, length: 0 })?.format).toEqual({ name, value });
  });
  it('does not convert numbered-list or italic delimiters', () => {
    expect(planEditorShortcut(plain('1.'), plain('1. '), { index: 3, length: 0 })).toBeNull();
  });
  it('converts bold with exact descending deletions and restored caret', () => {
    expect(planEditorShortcut(plain('前 **文字*'), plain('前 **文字**'), { index: 8, length: 0 })).toMatchObject({
      deletions: [{ index: 6, length: 2 }, { index: 2, length: 2 }], selection: { index: 2, length: 2 }, caret: 4,
    });
  });
  it('continues after previous heading, bold, emoji and image', () => {
    const prefix = [{ insert: '标题' }, { insert: '\n', attributes: { header: 2 } }, { insert: '加粗🙂', attributes: { bold: true } }, { insert: { image: 'https://img.test/p.jpg' } }, { insert: '\n' }];
    const previous = { ops: [...prefix, { insert: '##\n' }] };
    const next = { ops: [...prefix, { insert: '## \n' }] };
    const index = '标题\n加粗🙂￼\n## '.length;
    expect(planEditorShortcut(previous, next, { index, length: 0 })).toMatchObject({ caret: index - 3, format: { name: 'header', value: 'h2' } });
  });
  it('skips paste, selected/mid-document/code/nested/IME replacement and current formatting', () => {
    expect(planEditorShortcut(plain(''), plain('## '), { index: 3, length: 0 })).toBeNull();
    expect(planEditorShortcut(plain('#'), plain('# '), { index: 1, length: 0 })).toBeNull();
    expect(planEditorShortcut(plain('#'), plain('# '), { index: 2, length: 1 })).toBeNull();
    expect(planEditorShortcut(plain('ni'), plain('你 '), { index: 2, length: 0 })).toBeNull();
    expect(planEditorShortcut(plain('`**字*'), plain('`**字**'), { index: 6, length: 0 })).toBeNull();
    expect(planEditorShortcut(plain('#'), { ops: [{ insert: '# \n', attributes: { bold: true } }] }, { index: 2, length: 0 })).toBeNull();
  });
});
