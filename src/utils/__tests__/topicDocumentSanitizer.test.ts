import { describe, expect, it } from 'vitest';
import { sanitizeTopicDelta } from '../topicDocumentSanitizer';
import { serializeTopicDocumentHtml, TOPIC_DOCUMENT_MAX_LENGTH, TOPIC_DOCUMENT_MAX_OPS, type TopicDelta } from '../topicDocument';

const html = (input: unknown) => serializeTopicDocumentHtml(sanitizeTopicDelta(input).delta);
const plain = (delta: TopicDelta) => delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '[image]').join('');

describe('native rich-text paste legalization', () => {
  it('removes Word/web decorations but preserves text and supported inline formatting', () => {
    const input = { ops: [
      { insert: '中文😀', attributes: { bold: 'strong', italic: 'em', color: '#ff0000', font: 'Arial', size: 'large', underline: true, strike: true, link: 'javascript:alert(1)' } },
      { insert: '\n', attributes: { align: 'center', direction: 'rtl' } },
    ] };
    const result = sanitizeTopicDelta(input);
    expect(result.removedFormats).toEqual(['align', 'color', 'direction', 'font', 'link', 'size', 'strike', 'underline']);
    expect(plain(result.delta)).toBe('中文😀\n');
    expect(serializeTopicDocumentHtml(result.delta)).toMatchObject({ html: '<p><strong><em>中文😀</em></strong></p>', errors: [], unsupported: [] });
    expect(input.ops[0].attributes.color).toBe('#ff0000');
  });

  it('moves paragraph attributes from text onto its newline, including a split inline run', () => {
    const result = sanitizeTopicDelta({ ops: [
      { insert: '粗', attributes: { bold: true, list: 'ordered', indent: 2 } },
      { insert: '普通' }, { insert: '\n' },
      { insert: '标题\n', attributes: { header: 2, italic: true } },
    ] });
    expect(result.removedFormats).toEqual(['indent']);
    expect(serializeTopicDocumentHtml(result.delta)).toMatchObject({
      html: '<ol><li><strong>粗</strong>普通</li></ol><h2><em>标题</em></h2>', errors: [], unsupported: [],
    });
  });

  it('honors explicit paragraph resets instead of reviving a text-carried list', () => {
    const result = html({ ops: [
      { insert: '取消列表', attributes: { list: 'ordered' } },
      { insert: '\n', attributes: { list: false } },
      { insert: '取消标题', attributes: { header: 2 } },
      { insert: '\n', attributes: { header: '' } },
    ] });
    expect(result).toMatchObject({ html: '<p>取消列表</p><p>取消标题</p>', errors: [], unsupported: [] });
  });

  it('preserves empty mixed list items and closes lists before the separate signature', () => {
    const result = html({ ops: [
      { insert: 'A\nB\n', attributes: { list: 'bullet' } },
      { insert: 'C\n\n', attributes: { list: 'ordered' } },
      { insert: '本帖发自 小程序\n', attributes: { italic: true } },
    ] });
    expect(result).toMatchObject({ html: '<ul><li>A</li><li>B</li></ul><ol><li>C</li><li><br></li></ol><p><em>本帖发自 小程序</em></p>', errors: [], unsupported: [] });
  });

  it('flattens nested lists, downgrades H4–6 and resolves list/heading conflicts without deleting text', () => {
    const result = sanitizeTopicDelta({ ops: [
      { insert: '深层标题\n', attributes: { header: 6 } },
      { insert: '嵌套\n', attributes: { list: 'ordered', header: 2, indent: 3 } },
      { insert: '任务\n', attributes: { list: 'checked' } },
      { insert: '引用\n', attributes: { blockquote: true, 'code-block': true } },
    ] });
    expect(result.removedFormats).toEqual(['blockquote', 'code-block', 'header', 'indent', 'list']);
    expect(serializeTopicDocumentHtml(result.delta)).toMatchObject({ html: '<h3>深层标题</h3><ol><li>嵌套</li></ol><ul><li>任务</li></ul><p>引用</p>', errors: [], unsupported: [] });
  });

  it('preserves supported formatting and is idempotent on the legalized delta', () => {
    const result = sanitizeTopicDelta({ ops: [
      { insert: 'a\nb', attributes: { bold: true, header: 3, color: 'red' } },
      { insert: 'c', attributes: { italic: true } },
      { insert: '\n' },
    ] });
    const again = sanitizeTopicDelta(result.delta);
    expect(again.delta).toEqual(result.delta);
    expect(again.removedFormats).toEqual([]);
    expect(plain(result.delta)).toBe('a\nbc\n');
    expect(serializeTopicDocumentHtml(result.delta).unsupported).toEqual([]);
  });

  it('preserves safe external images in place without uploads or fake attachment ownership', () => {
    const result = sanitizeTopicDelta({ ops: [
      { insert: '前😀' },
      { insert: { image: 'https://example.com/a.png' }, attributes: { alt: '网页图', width: '50%', link: 'https://example.com' } },
      { insert: '后\n' },
    ] });
    expect(plain(result.delta)).toBe('前😀[image]后\n');
    expect(result.removedFormats).toEqual(['link']);
    expect(serializeTopicDocumentHtml(result.delta)).toMatchObject({ html: '<p>前😀<img src="https://example.com/a.png" alt="网页图">后</p>', referencedAttachmentIds: [], errors: [], unsupported: [] });
  });

  it('retains attachment metadata so forged or foreign identities still fail closed', () => {
    const result = sanitizeTopicDelta({ ops: [
      { insert: { image: 'https://example.com/a.png' }, attributes: { attachmentId: 'other-photo', 'data-custom': 'attachmentId=other-photo' } },
      { insert: '\n' },
    ] });
    const serialized = serializeTopicDocumentHtml(result.delta, { username: 'tester', attachments: [] });
    expect(serialized.errors.length).toBeGreaterThan(0);
    expect(serialized.html).not.toContain('<img');
    expect(result.delta.ops[0].attributes?.attachmentId).toBe('other-photo');
  });

  it.each(['wxfile://tmp/a.png', 'data:image/png;base64,a', 'blob:local', 'javascript:alert(1)', 'https://user:pass@example.com/a.png'])('keeps unsafe/pending image %s visible in the delta but blocks export', url => {
    const result = sanitizeTopicDelta({ ops: [{ insert: '前' }, { insert: { image: url } }, { insert: '后\n' }] });
    expect(plain(result.delta)).toBe('前[image]后\n');
    const serialized = serializeTopicDocumentHtml(result.delta);
    expect(serialized.errors.length).toBeGreaterThan(0);
    expect(serialized.html).not.toContain('<img');
  });

  it.each([null, { ops: [{ retain: 2 }] }, { ops: [{ insert: { video: 'https://example.com/a' } }] }, { ops: [{ insert: '正文', attributes: { color: {} } }] }])('does not launder malformed snapshots into a publishable document %#', input => {
    const result = sanitizeTopicDelta(input);
    expect(result.delta.validationErrors?.length).toBeGreaterThan(0);
    expect(serializeTopicDocumentHtml(result.delta).errors.length).toBeGreaterThan(0);
    expect(sanitizeTopicDelta(result.delta).delta.validationErrors).toEqual(result.delta.validationErrors);
  });

  it('preserves errors and bounds before and after splitting rather than ignoring oversized decoration', () => {
    for (const input of [
      { ops: [{ insert: 'x'.repeat(TOPIC_DOCUMENT_MAX_LENGTH + 1) }] },
      { ops: Array.from({ length: TOPIC_DOCUMENT_MAX_OPS + 1 }, () => ({ insert: 'a' })) },
      { ops: [{ insert: 'x', attributes: { color: 'r'.repeat(2001) } }] },
      { ops: [{ insert: 'x', attributes: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`format${i}`, 'x'])) }] },
    ]) {
      const result = sanitizeTopicDelta(input);
      expect(result.delta.validationErrors?.length).toBeGreaterThan(0);
      expect(serializeTopicDocumentHtml(result.delta).errors.length).toBeGreaterThan(0);
    }
  });

  it('keeps deterministic mixed-format snapshots idempotent and exportable', () => {
    let seed = 7;
    const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
    const variants = [{}, { bold: true, list: 'ordered' }, { header: 6, italic: true },
      { list: 'bullet', indent: 2 }, { list: false }, { header: '', color: 'red' },
      { header: 3, list: 'ordered' }, { link: 'javascript:a', size: 30 }];
    for (let index = 0; index < 128; index++) {
      const ops = Array.from({ length: 1 + next() % 15 }, () => ({
        insert: ['文😀', '\n', 'a\n\nb', '末\n'][next() % 4],
        attributes: variants[next() % variants.length],
      }));
      const result = sanitizeTopicDelta({ ops });
      expect(sanitizeTopicDelta(result.delta).delta).toEqual(result.delta);
      expect(serializeTopicDocumentHtml(result.delta)).toMatchObject({ errors: [], unsupported: [] });
    }
  });

  it('escapes pasted literal HTML and strips unknown event/style attributes', () => {
    const result = html({ ops: [{ insert: '<img src=x onerror=evil> & <script>\n', attributes: { onclick: 'evil', style: 'color:red' } }] });
    expect(result.html).toBe('<p>&lt;img src=x onerror=evil&gt; &amp; &lt;script&gt;</p>');
    expect(result.errors).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });
});
