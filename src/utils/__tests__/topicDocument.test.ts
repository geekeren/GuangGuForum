import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeTopicDelta, importTopicMarkdown, serializeTopicDocument, serializeTopicDocumentHtml, topicMarkdownToSafeHtml, escapeTopicHtml, restoreTopicDocument, isSafeTopicImageUrl, TOPIC_DOCUMENT_MAX_LENGTH, TOPIC_DOCUMENT_MAX_OPS, type TopicDelta, type TopicDocumentAttachment } from '../topicDocument';

afterEach(() => vi.unstubAllGlobals());

const serialize = (ops: TopicDelta['ops']) => serializeTopicDocument({ ops });
const photo: TopicDocumentAttachment = { id: 'photo-1', kind: 'photo', owner: 'tester', phase: 'complete', url: 'https://img.example.com/a(b).jpg', richManaged: true };
const image = (src = 'https://img.example.com/old.jpg', attributes: Record<string, unknown> = { 'data-custom': 'attachmentId=photo-1' }): TopicDelta => ({ ops: [{ insert: '图片之前 ' }, { insert: { image: src }, attributes }, { insert: ' 图片之后\n' }] });

describe('safe HTML forum document payload', () => {
  it('validates authority without browser/global URL or permissive TaroURL normalization', () => {
    vi.stubGlobal('URL', undefined);
    for (const value of ['https://example.com/a.png', 'https://example.com:443/a', 'https://[::1]/a']) expect(isSafeTopicImageUrl(value)).toBe(true);
    for (const value of ['https://user:pass@example.com/a', 'https:///a.png', 'https://:443/a', 'https://example.com:99999/a', 'https://example..com/a', 'https://-bad.com/a', 'https://exa%40mple.com/a']) expect(isSafeTopicImageUrl(value)).toBe(false);
    vi.stubGlobal('URL', class { hostname = 'taro.com'; });
    expect(isSafeTopicImageUrl('https://user:pass@example.com/a')).toBe(false);
  });
  it('preserves literal intraword underscores and diagnoses lossy nested/non1 numbered source', () => {
    for (const text of ['a_b_c', 'file__name__txt']) {
      expect(importTopicMarkdown(text).lossless).toBe(true);
      expect(topicMarkdownToSafeHtml(text).html).toBe(`<p>${text}</p>`);
    }
    for (const text of ['**粗体 和 *斜体***', '3. 第三项\n4. 第四项']) {
      expect(importTopicMarkdown(text).lossless).toBe(false);
      expect(topicMarkdownToSafeHtml(text).lossless).toBe(false);
      expect(topicMarkdownToSafeHtml(text).html).toContain(text.split('\n')[0]);
    }
  });
  it('emits escaped paragraphs and inline emphasis, not Markdown markers or native HTML', () => {
    const result = serializeTopicDocumentHtml({ ops: [{ insert: '<script> & "文本"\n' }, { insert: '粗体', attributes: { bold: true } }, { insert: '斜体', attributes: { italic: true } }, { insert: '\n\n尾\n' }] });
    expect(result.html).toBe('<p>&lt;script&gt; &amp; &quot;文本&quot;</p><p><strong>粗体</strong><em>斜体</em></p><p><br></p><p>尾</p>');
    expect(result.errors).toEqual([]); expect(result.unsupported).toEqual([]);
  });
  it('groups ordered/bullet lists and closes them before paragraphs/headings', () => {
    const result = serializeTopicDocumentHtml({ ops: [{ insert: '标题' }, { insert: '\n', attributes: { header: 3 } }, { insert: '一' }, { insert: '\n', attributes: { list: 'ordered' } }, { insert: '二' }, { insert: '\n', attributes: { list: 'ordered' } }, { insert: '条目' }, { insert: '\n', attributes: { list: 'bullet' } }, { insert: '正文\n' }] });
    expect(result.html).toBe('<h3>标题</h3><ol><li>一</li><li>二</li></ol><ul><li>条目</li></ul><p>正文</p>');
  });
  it('preserves inline image placement, resolves upload identity and strips native image attrs', () => {
    const result = serializeTopicDocumentHtml(image('javascript:ignored', { 'data-custom': 'attachmentId=photo-1', alt: '" onerror="evil', width: '100%', height: '50px' }), { attachments: [photo], username: 'tester' });
    expect(result.html).toBe('<p>图片之前 <img src="https://img.example.com/a(b).jpg" alt="&quot; onerror=&quot;evil"> 图片之后</p>');
    expect(result.html).not.toContain('data-custom'); expect(result.html).not.toContain('width='); expect(result.errors).toEqual([]);
  });
  it('fails closed and omits missing/foreign/pending images from generated preview HTML', () => {
    for (const options of [{ attachments: [], username: 'tester' }, { attachments: [photo], username: 'other' }, { attachments: [{ ...photo, phase: 'failed' }], username: 'tester' }]) {
      const result = serializeTopicDocumentHtml(image(), options);
      expect(result.errors.length).toBeGreaterThan(0); expect(result.html).not.toContain('<img');
    }
  });
  it('converts supported source Markdown to HTML and preserves unsupported source safely with diagnostics', () => {
    expect(topicMarkdownToSafeHtml('# 标题\n\n**粗体**')).toEqual({ html: '<h1>标题</h1><p><strong>粗体</strong></p>', lossless: true, unsupported: [] });
    const source = '> 引用\n<script>alert(1)</script>';
    const result = topicMarkdownToSafeHtml(source);
    expect(result.lossless).toBe(false); expect(result.html).toBe('<p>&gt; 引用<br>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(escapeTopicHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});

describe('pure native editor document conversion', () => {
  it('preserves paragraphs, short text, blank paragraphs, mentions and emoji', () => {
    expect(serialize([{ insert: '你好\n\n@用户 😀\n尾\n' }]).markdown).toBe('你好\n\n\n\n@用户 😀\n\n尾');
    expect(serialize([{ insert: '\n' }]).markdown).toBe('');
    expect(serialize([{ insert: '第一段\n第二段\n' }]).markdown).toBe('第一段\n\n第二段');
  });
  it('merges adjacent emphasis ops without changing CJK or whitespace', () => {
    expect(serialize([{ insert: 'A ' }, { insert: '中文', attributes: { bold: true } }, { insert: '加粗', attributes: { bold: true } }, { insert: ' 尾\n' }]).markdown).toBe('A **中文加粗** 尾');
    expect(serialize([{ insert: ' 粗体 ', attributes: { bold: true } }, { insert: '\n' }]).markdown).toBe(' **粗体** ');
    expect(serialize([{ insert: '强调', attributes: { bold: true, italic: true } }, { insert: '\n' }]).markdown).toBe('***强调***');
  });
  it('serializes newline header/list attrs and preserves list numbering', () => {
    const result = serialize([{ insert: '标题' }, { insert: '\n', attributes: { header: 2 } }, { insert: '第一项' }, { insert: '\n', attributes: { list: 'ordered' } }, { insert: '第二项' }, { insert: '\n', attributes: { list: 'ordered' } }, { insert: '正文\n' }, { insert: '条目' }, { insert: '\n', attributes: { list: 'bullet' } }]);
    expect(result.markdown).toBe('## 标题\n\n1. 第一项\n2. 第二项\n\n正文\n\n- 条目'); expect(result.unsupported).toEqual([]);
  });
  it('escapes literal Markdown and HTML syntax, preserving authored text rather than enabling tags', () => {
    const text = '**literal** <script> & [link](url) `code`';
    const result = serialize([{ insert: text + '\n' }]);
    expect(result.markdown).toContain('\\*\\*literal\\*\\*'); expect(result.markdown).toContain('&lt;script&gt; &amp;');
    const imported = importTopicMarkdown(result.markdown); expect(imported.lossless).toBe(true);
    expect(imported.delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('')).toBe(text + '\n');
  });
  it('resolves a tagged inline image by current-owner attachment ID without appending or uploading', () => {
    const result = serializeTopicDocument(image(), { attachments: [photo], username: 'tester' });
    expect(result.errors).toEqual([]); expect(result.referencedAttachmentIds).toEqual(['photo-1']);
    expect(result.markdown).toBe('图片之前 ![图片](https://img.example.com/a%28b%29.jpg) 图片之后');
  });
  it('deduplicates referenced IDs, not deliberate repeated image occurrences', () => {
    const delta: TopicDelta = { ops: [image().ops[1], image().ops[1], { insert: '\n' }] };
    const result = serializeTopicDocument(delta, { attachments: [photo], username: 'tester' });
    expect(result.referencedAttachmentIds).toEqual(['photo-1']); expect(result.markdown.match(/!\[/g)).toHaveLength(2);
  });
  it.each([
    { attachments: [], username: 'tester' }, { attachments: [photo], username: 'other' },
    { attachments: [{ ...photo, phase: 'failed' }], username: 'tester' },
    { attachments: [{ ...photo, url: 'wxfile://tmp/photo.jpg' }], username: 'tester' },
    { attachments: [photo, photo], username: 'tester' },
  ])('fails closed for missing/foreign/pending/unsafe/duplicate managed images %#', options => {
    expect(serializeTopicDocument(image(), options).errors.length).toBeGreaterThan(0);
  });
  it('resolves catalog sticker images and preserves their identity', () => {
    const sticker: TopicDocumentAttachment = { id: 'sticker-1', kind: 'sticker', sticker: { name: '笑', url: 'https://img.example.com/smile.png' } };
    const result = serializeTopicDocument(image('', { 'data-custom': 'attachmentId=sticker-1;' }), { attachments: [sticker] });
    expect(result.errors).toEqual([]); expect(result.markdown).toContain('![笑](https://img.example.com/smile.png)');
  });
  it.each(['javascript:alert(1)', 'data:image/png;base64,a', 'wxfile://tmp/a', 'cloud://a', '//example.com/a', 'https://name:password@example.com/a', 'https://example.com/a\n', 'https://example.com/a\\b'])('rejects unsafe image URL %s', src => {
    expect(isSafeTopicImageUrl(src)).toBe(false); expect(serializeTopicDocument(image(src, {})).errors.length).toBeGreaterThan(0);
    expect(importTopicMarkdown(`![图片](${src})`).lossless).toBe(false);
  });
  it('allows safe remote legacy Markdown images with no attachment/upload side effects', () => {
    const imported = importTopicMarkdown('前 ![图](https://example.com/a.png) 后');
    expect(imported.lossless).toBe(true); const result = serializeTopicDocument(imported.delta);
    expect(result.errors).toEqual([]); expect(result.referencedAttachmentIds).toEqual([]); expect(result.markdown).toBe('前 ![图](https://example.com/a.png) 后');
  });
  it.each(['color', 'align', 'link', 'strike', 'indent', 'script'])('reports unimplemented native format %s instead of silently submitting', key => {
    expect(serialize([{ insert: '内容', attributes: { [key]: 'x' } }, { insert: '\n' }]).unsupported).toContain(key);
  });
  it('rejects invalid known formats and excessive header values without throwing', () => {
    expect(serialize([{ insert: '\n', attributes: { header: 99999999 } }]).unsupported).toContain('header');
    expect(serialize([{ insert: '文字', attributes: { bold: 'yes' } }, { insert: '\n' }]).unsupported).toContain('bold');
    expect(serialize([{ insert: '\n', attributes: { header: 1, list: 'ordered' } }]).unsupported).toContain('conflicting-block-format');
  });
  it('rejects malformed delta, mutation ops, unknown embeds and bounded overflows', () => {
    expect(serializeTopicDocument(normalizeTopicDelta(null)).errors).not.toEqual([]);
    expect(normalizeTopicDelta({ ops: [{ retain: 1 }] }).validationErrors).not.toEqual([]);
    expect(normalizeTopicDelta({ ops: [{ insert: { video: 'x' } }] }).validationErrors).not.toEqual([]);
    expect(normalizeTopicDelta({ ops: [{ insert: 'a'.repeat(TOPIC_DOCUMENT_MAX_LENGTH + 1) }] }).validationErrors).not.toEqual([]);
    expect(normalizeTopicDelta({ ops: Array.from({ length: TOPIC_DOCUMENT_MAX_OPS + 1 }, () => ({ insert: 'a' })) }).validationErrors).not.toEqual([]);
    expect(normalizeTopicDelta({ ops: [{ insert: 'x', attributes: { bold: {} } }] }).validationErrors).not.toEqual([]);
  });
  it.each(['```ts\nconst x = 1\n```', '> 引用', '| a | b |\n| --- | --- |', '- [x] 任务', '#### 四级标题', '[链接](https://example.com)', '`code`', '~~删除~~', '<b>HTML</b>'])('preserves unsupported source-mode fallback %s', source => {
    const result = importTopicMarkdown(source); expect(result.lossless).toBe(false); expect(result.unsupported.length).toBeGreaterThan(0);
    expect(restoreTopicDocument(null, source).markdown).toBe(source);
  });
  it.each(['第一段\n\n第二段', '# 标题\n\n**粗体** 和 *斜体*', '1. 一\n2. 二\n\n- 条目', '前 ![图](https://example.com/a.png) 后', '普通 @用户 😀'])('is stable over supported Markdown roundtrip %s', markdown => {
    const first = importTopicMarkdown(markdown); expect(first.lossless).toBe(true);
    const serialized = serializeTopicDocument(first.delta); expect(serialized.errors).toEqual([]); expect(serialized.unsupported).toEqual([]);
    const second = importTopicMarkdown(serialized.markdown); expect(second.lossless).toBe(true);
    expect(serializeTopicDocument(second.delta).markdown).toBe(serialized.markdown);
  });
  it('retains versioned Delta authority rather than stale paired markdown', () => {
    const value = { version: 1, delta: { ops: [{ insert: '新内容\n' }] }, markdown: '旧内容' };
    expect(restoreTopicDocument(value, '旧内容').markdown).toBe('新内容');
    expect(normalizeTopicDelta({ ops: [{ insert: 'Windows\r\n文本' }] }).ops).toEqual([{ insert: 'Windows\n文本' }, { insert: '\n' }]);
  });
});
