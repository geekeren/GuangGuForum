/** Pure native-editor document conversion. No uploads, storage, or API side effects. */
export interface TopicDeltaOp {
  insert: string | { image: string };
  attributes?: Record<string, unknown>;
}
export interface TopicDelta { ops: TopicDeltaOp[]; validationErrors?: string[] }
export interface TopicDocument { version: 1; delta: TopicDelta }
export interface TopicDocumentAttachment {
  id: string;
  kind: 'photo' | 'sticker';
  owner?: string;
  url?: string;
  phase?: string;
  sticker?: { name: string; url: string };
  richManaged?: boolean;
}
export interface TopicSerializationOptions {
  attachments?: readonly TopicDocumentAttachment[];
  username?: string;
}
export interface TopicSerializationResult {
  markdown: string;
  referencedAttachmentIds: string[];
  errors: string[];
  unsupported: string[];
}
export const TOPIC_DOCUMENT_MAX_LENGTH = 50000;
export const TOPIC_DOCUMENT_MAX_OPS = 5000;
const MAX_ATTRIBUTES = 20;
const MAX_ATTRIBUTE_LENGTH = 2000;
const INLINE_ATTRIBUTES = new Set(['bold', 'italic']);
const BLOCK_ATTRIBUTES = new Set(['header', 'list']);
const IMAGE_ATTRIBUTES = new Set(['alt', 'width', 'height', 'data-custom', 'data-local', 'attachmentId']);
const unique = (values: string[]) => [...new Set(values)];

/** Malformed input remains visibly invalid, rather than silently becoming a publishable empty draft. */
export function normalizeTopicDelta(input: unknown): TopicDelta {
  const errors: string[] = [];
  const ops: TopicDeltaOp[] = [];
  if (!input || typeof input !== 'object' || !Array.isArray((input as TopicDelta).ops)) {
    return { ops: [{ insert: '\n' }], validationErrors: ['文档格式无效'] };
  }
  const source = input as TopicDelta;
  if (Array.isArray(source.validationErrors)) errors.push(...source.validationErrors.slice(0, 20).filter(value => typeof value === 'string').map(value => value.slice(0, 200)));
  if (source.ops.length > TOPIC_DOCUMENT_MAX_OPS) errors.push('文档内容过多');
  let length = 0;
  for (const value of source.ops.slice(0, TOPIC_DOCUMENT_MAX_OPS)) {
    if (!value || typeof value !== 'object') { errors.push('文档操作无效'); continue; }
    if (Object.keys(value).some(key => key !== 'insert' && key !== 'attributes')) errors.push('仅支持完整文档，不能提交编辑操作');
    let insert: TopicDeltaOp['insert'];
    if (typeof value.insert === 'string') {
      insert = value.insert.replace(/\r\n?/g, '\n');
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(insert)) errors.push('正文包含无效控制字符');
    }
    else if (value.insert && typeof value.insert === 'object' && typeof value.insert.image === 'string' && Object.keys(value.insert).length === 1) {
      insert = { image: value.insert.image };
    } else { errors.push('文档包含不支持的嵌入内容'); continue; }
    length += typeof insert === 'string' ? insert.length : insert.image.length + 1;
    if (length > TOPIC_DOCUMENT_MAX_LENGTH) { errors.push('正文不能超过50000字'); break; }
    let attributes: Record<string, unknown> | undefined;
    if (value.attributes !== undefined) {
      if (!value.attributes || typeof value.attributes !== 'object' || Array.isArray(value.attributes)) errors.push('文档样式无效');
      else {
        const entries = Object.entries(value.attributes);
        if (entries.length > MAX_ATTRIBUTES) errors.push('文档样式过多');
        length += entries.slice(0, MAX_ATTRIBUTES).reduce((size, [key, attribute]) => size + key.length +
          (typeof attribute === 'string' ? attribute.length : typeof attribute === 'number' || typeof attribute === 'boolean' ? String(attribute).length : 0), 0);
        if (length > TOPIC_DOCUMENT_MAX_LENGTH) { errors.push('文档数据过大'); break; }
        attributes = Object.create(null);
        for (const [key, attribute] of entries.slice(0, MAX_ATTRIBUTES)) {
          if (key.length > 100 || !['string', 'boolean', 'number'].includes(typeof attribute) ||
            (typeof attribute === 'string' && attribute.length > MAX_ATTRIBUTE_LENGTH) ||
            (typeof attribute === 'number' && !Number.isFinite(attribute))) {
            errors.push('文档样式值无效'); continue;
          }
          // WeChat snapshots use semantic aliases; older drafts used boolean strings.
          const semanticInline = key === 'bold' && attribute === 'strong' || key === 'italic' && attribute === 'em';
          attributes![key] = semanticInline ? true : (key === 'bold' || key === 'italic') && (attribute === 'true' || attribute === 'false')
            ? attribute === 'true' : attribute;
        }
      }
    }
    if (typeof insert === 'string' && !insert) continue;
    ops.push(attributes && Object.keys(attributes).length ? { insert, attributes } : { insert });
  }
  const last = ops[ops.length - 1];
  if (!last || typeof last.insert !== 'string' || !last.insert.endsWith('\n')) ops.push({ insert: '\n' });
  return { ops, ...(errors.length ? { validationErrors: unique(errors) } : {}) };
}

export function isSafeTopicImageUrl(value: string): boolean {
  if (/[\s<>\\\x00-\x1f\x7f]/.test(value)) return false;
  // Mini-program TaroURL omits credentials and normalizes empty hosts; validate authority directly.
  const match = /^https?:\/\/([^/?#]+)(?:[/?#][\s\S]*)?$/i.exec(value);
  if (!match || /[@%]/.test(match[1])) return false;
  const authority = match[1];
  const ipv6 = /^\[([0-9a-f:]+)\](?::(\d{1,5}))?$/i.exec(authority);
  if (authority.startsWith('[')) {
    if (!ipv6 || !ipv6[1].includes(':') || !/^[0-9a-f:]+$/i.test(ipv6[1])) return false;
    const sections = ipv6[1].split(':').filter(Boolean);
    if (sections.some(section => section.length > 4) || sections.length > 8 ||
      (ipv6[1].includes('::') ? ipv6[1].indexOf('::') !== ipv6[1].lastIndexOf('::') : sections.length !== 8)) return false;
    return !ipv6[2] || Number(ipv6[2]) > 0 && Number(ipv6[2]) <= 65535;
  }
  const host = /^([^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!host || host[2] && (Number(host[2]) <= 0 || Number(host[2]) > 65535)) return false;
  const hostname = host[1];
  if (hostname.length > 253 || !hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
  return !/^\d+(?:\.\d+){3}$/.test(hostname) || hostname.split('.').every(part => Number(part) <= 255);
}
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]()#!|~])/g, '\\$1')
    .replace(/(^|\n)(\s*)([-+] |\d+\. )/g, '$1$2\\$3');
}
function imageDestination(value: string): string {
  return value.replace(/[()\[\]]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
function attachmentId(attributes: Record<string, unknown>, errors: string[]): string | undefined {
  const direct = typeof attributes.attachmentId === 'string' ? attributes.attachmentId : undefined;
  const custom = typeof attributes['data-custom'] === 'string' ? attributes['data-custom'] : '';
  const ids = custom.split(';').filter(Boolean).map(item => item.split('=')).filter(([key]) => key === 'attachmentId');
  if (ids.length > 1 || (direct && ids[0] && direct !== ids[0][1])) errors.push('图片附件标识冲突');
  const id = direct || ids[0]?.[1];
  if (id !== undefined && !/^[A-Za-z0-9_-]{1,150}$/.test(id)) { errors.push('图片附件标识无效'); return undefined; }
  if (custom && custom.split(';').filter(Boolean).some(item => !/^attachmentId=[A-Za-z0-9_-]{1,150}$/.test(item))) errors.push('图片附件数据无效');
  return id;
}

export function serializeTopicDocument(input: TopicDelta, options: TopicSerializationOptions = {}): TopicSerializationResult {
  const delta = normalizeTopicDelta(input);
  const errors = [...delta.validationErrors || []];
  const unsupported: string[] = [];
  const references: string[] = [];
  const lines: Array<{ text: string; attributes: Record<string, unknown> }> = [];
  let line = '';
  let pendingBold = false;
  let pendingItalic = false;
  let pendingText = '';
  const flush = () => {
    if (!pendingText) return;
    // Keep whitespace outside emphasis delimiters; Markdown cannot emphasize a leading/trailing space.
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(pendingText)!;
    const marker = (pendingBold ? '**' : '') + (pendingItalic ? '*' : '');
    line += match[1] + (match[2] ? marker + escapeText(match[2]) + marker : '') + match[3];
    pendingText = '';
  };
  for (const op of delta.ops) {
    const attributes = op.attributes || {};
    const isImage = typeof op.insert !== 'string';
    for (const [key, value] of Object.entries(attributes)) {
      if (value === false && (INLINE_ATTRIBUTES.has(key) || BLOCK_ATTRIBUTES.has(key))) continue;
      const allowed = isImage ? IMAGE_ATTRIBUTES.has(key) : INLINE_ATTRIBUTES.has(key) || BLOCK_ATTRIBUTES.has(key);
      if (!allowed) unsupported.push(key);
      if (INLINE_ATTRIBUTES.has(key) && typeof value !== 'boolean') unsupported.push(key);
      if (key === 'header' && ![1, 2, 3].includes(value as number)) unsupported.push('header');
      if (key === 'list' && value !== 'bullet' && value !== 'ordered') unsupported.push('list');
    }
    if (isImage) {
      flush();
      const id = attachmentId(attributes, errors);
      let src = (op.insert as { image: string }).image;
      let alt = typeof attributes.alt === 'string' ? attributes.alt : '图片';
      if (id) {
        references.push(id);
        const matches = (options.attachments || []).filter(item => item.id === id);
        const item = matches[0];
        if (matches.length !== 1) errors.push(`图片附件不存在或重复：${id}`);
        else if (item.kind === 'sticker') {
          src = item.sticker?.url || ''; alt = item.sticker?.name || alt;
        } else if (!options.username || item.owner !== options.username) errors.push(`图片所属账号已变化：${id}`);
        else if (item.phase !== 'complete' || !item.url) errors.push(`图片尚未上传完成：${id}`);
        else src = item.url;
      } else if (attributes['data-local']) errors.push('图片尚未上传完成');
      if (!isSafeTopicImageUrl(src) || (id && !/^https:\/\//i.test(src))) errors.push('图片地址不安全或尚未上传完成');
      else line += `![${escapeText(alt)}](${imageDestination(src)})`;
      continue;
    }
    const value = op.insert as string;
    const bold = attributes.bold === true;
    const italic = attributes.italic === true;
    if (bold !== pendingBold || italic !== pendingItalic) flush();
    pendingBold = bold; pendingItalic = italic;
    const parts = value.split('\n');
    for (let index = 0; index < parts.length; index++) {
      pendingText += parts[index];
      if (index === parts.length - 1) continue;
      flush();
      if ((attributes.header || attributes.list) && parts[index]) unsupported.push('block-format-on-text');
      if (attributes.header && attributes.list) unsupported.push('conflicting-block-format');
      lines.push({ text: line, attributes }); line = '';
    }
  }
  flush();
  if (line) lines.push({ text: line, attributes: {} });
  let markdown = '';
  let ordered = 0;
  for (let index = 0; index < lines.length; index++) {
    const current = lines[index];
    const list = current.attributes.list;
    if (list === 'ordered') ordered++; else ordered = 0;
    const prefix = [1, 2, 3].includes(current.attributes.header as number) ? '#'.repeat(current.attributes.header as number) + ' ' :
      list === 'bullet' ? '- ' : list === 'ordered' ? `${ordered}. ` : '';
    markdown += prefix + current.text;
    if (index < lines.length - 1) markdown += list && lines[index + 1].attributes.list ? '\n' : '\n\n';
  }
  return { markdown, referencedAttachmentIds: unique(references), errors: unique(errors), unsupported: unique(unsupported) };
}

interface ImportResult { delta: TopicDelta; lossless: boolean; unsupported: string[] }
function decodeEntities(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function parseInline(source: string, inherited: Record<string, unknown>, ops: TopicDeltaOp[], unsupported: string[]) {
  let plain = '';
  const flush = () => {
    if (plain) ops.push(Object.keys(inherited).length ? { insert: decodeEntities(plain), attributes: { ...inherited } } : { insert: decodeEntities(plain) });
    plain = '';
  };
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    if (rest[0] === '\\' && rest.length > 1 && /[\\`*_{}\[\]()#!|~>+.-]/.test(rest[1])) {
      plain += rest[1]; index += 2; continue;
    }
    const image = /^!\[((?:\\.|[^\]\\])*)\]\(([^\s)]+)\)/.exec(rest);
    if (image) {
      flush();
      if (!isSafeTopicImageUrl(image[2])) unsupported.push('unsafe-image-url');
      ops.push({ insert: { image: image[2] }, attributes: { alt: decodeEntities(image[1].replace(/\\([\\`*_{}\[\]()#!|~])/g, '$1')) } });
      index += image[0].length; continue;
    }
    // CommonMark underscores do not open emphasis inside words (e.g. snake_case_name).
    const underscoreInsideWord = rest[0] === '_' && index > 0 && /[\p{L}\p{N}_]/u.test(source[index - 1]);
    const marker = rest.startsWith('***') ? '***' : rest.startsWith('**') ? '**' :
      rest.startsWith('__') && !underscoreInsideWord ? '__' : rest[0] === '*' || rest[0] === '_' && !underscoreInsideWord ? rest[0] : '';
    if (marker) {
      let end = index + marker.length;
      while ((end = source.indexOf(marker, end)) !== -1 && source[end - 1] === '\\') end += marker.length;
      const inside = end >= 0 ? source.slice(index + marker.length, end) : '';
      const underscoreClosesInsideWord = marker[0] === '_' && end >= 0 && /[\p{L}\p{N}]/u.test(source[end + marker.length] || '');
      if (inside && !/^\s|\s$/.test(inside) && !underscoreClosesInsideWord) {
        flush();
        // Nested delimiters have ambiguous shared closing runs; preserve source instead of claiming fidelity.
        if (/(^|[^\\])[*_]/.test(inside)) unsupported.push('nested-emphasis');
        parseInline(inside, { ...inherited, ...(marker.length > 1 ? { bold: true } : { italic: true }), ...(marker === '***' ? { italic: true } : {}) }, ops, unsupported);
        index = end + marker.length; continue;
      }
    }
    if (rest.startsWith('![') && !image) unsupported.push('image-syntax');
    if (rest[0] === '`') unsupported.push('code');
    if (rest.startsWith('~~')) unsupported.push('strike');
    if (/^\[[^\]]+\]\(/.test(rest)) unsupported.push('link');
    if (rest[0] === '<' && /^<\/?[A-Za-z!]/.test(rest)) unsupported.push('html');
    plain += rest[0]; index++;
  }
  flush();
}

/** Unsupported source is left available to the caller; never silently replace it with a lossy rich draft. */
export function importTopicMarkdown(markdown: string): ImportResult {
  const unsupported: string[] = [];
  if (typeof markdown !== 'string' || markdown.length > TOPIC_DOCUMENT_MAX_LENGTH) {
    return { delta: normalizeTopicDelta({ ops: [{ insert: typeof markdown === 'string' ? markdown.slice(0, TOPIC_DOCUMENT_MAX_LENGTH) : '' }], validationErrors: ['正文不能超过50000字'] }), lossless: false, unsupported: ['length'] };
  }
  const ops: TopicDeltaOp[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let expectedOrdered = 1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // One blank separator is represented by the preceding paragraph newline.
    if (!line && index > 0 && lines[index - 1] && index < lines.length - 1) continue;
    if (/^\s*(?:```|~~~)/.test(line)) unsupported.push('code-block');
    if (/^\s*>/.test(line)) unsupported.push('blockquote');
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) unsupported.push('divider');
    if (/^\s*\|.*\|\s*$/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) unsupported.push('table');
    if (/^\s*[-*+]\s+\[[ xX]\]/.test(line)) unsupported.push('checklist');
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const list = /^([-*+]|\d+\.)\s+(.*)$/.exec(line);
    const attributes: Record<string, unknown> = {};
    let content = line;
    if (heading) {
      if (heading[1].length > 3) unsupported.push('header');
      attributes.header = Math.min(3, heading[1].length); content = heading[2];
    } else if (list) {
      attributes.list = /^\d/.test(list[1]) ? 'ordered' : 'bullet'; content = list[2];
      if (attributes.list === 'ordered') {
        if (Number.parseInt(list[1], 10) !== expectedOrdered) unsupported.push('ordered-list-start');
        expectedOrdered++;
      } else expectedOrdered = 1;
    } else {
      expectedOrdered = 1;
      if (/^\s{2,}[-*+]\s+/.test(line)) unsupported.push('nested-list');
    }
    if (/ {2}$/.test(content) || /\\$/.test(content)) unsupported.push('hard-break');
    parseInline(content, {}, ops, unsupported);
    ops.push(Object.keys(attributes).length ? { insert: '\n', attributes } : { insert: '\n' });
  }
  const delta = normalizeTopicDelta({ ops });
  unsupported.push(...delta.validationErrors || []);
  return { delta, lossless: unsupported.length === 0, unsupported: unique(unsupported) };
}

export interface TopicHtmlSerializationResult extends Omit<TopicSerializationResult, 'markdown'> { html: string }
export function escapeTopicHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Final forum payload: safe HTML generated from document operations, never native event HTML. */
export function serializeTopicDocumentHtml(input: TopicDelta, options: TopicSerializationOptions = {}): TopicHtmlSerializationResult {
  const diagnostics = serializeTopicDocument(input, options);
  const delta = normalizeTopicDelta(input);
  const blocks: Array<{ html: string; attributes: Record<string, unknown> }> = [];
  let content = '';
  for (const op of delta.ops) {
    const attributes = op.attributes || {};
    if (typeof op.insert !== 'string') {
      const id = attachmentId(attributes, []);
      const item = id ? options.attachments?.find(attachment => attachment.id === id) : undefined;
      const src = item?.kind === 'sticker' ? item.sticker?.url : item?.kind === 'photo' ? item.url : op.insert.image;
      const alt = item?.kind === 'sticker' ? item.sticker?.name : typeof attributes.alt === 'string' ? attributes.alt : '图片';
      // Invalid images are diagnosed above and omitted from even an accidentally displayed preview.
      const owned = !id || !!item && (item.kind === 'sticker' || item.phase === 'complete' && !!options.username && item.owner === options.username);
      if (owned && src && isSafeTopicImageUrl(src) && (!id || /^https:\/\//i.test(src))) content += `<img src="${escapeTopicHtml(src)}" alt="${escapeTopicHtml(alt || '图片')}">`;
      continue;
    }
    const segments = op.insert.split('\n');
    for (let index = 0; index < segments.length; index++) {
      let text = escapeTopicHtml(segments[index]);
      if (text && attributes.italic === true) text = `<em>${text}</em>`;
      if (text && attributes.bold === true) text = `<strong>${text}</strong>`;
      content += text;
      if (index < segments.length - 1) { blocks.push({ html: content, attributes }); content = ''; }
    }
  }
  if (content) blocks.push({ html: content, attributes: {} });
  let html = '';
  let activeList: 'ul' | 'ol' | null = null;
  for (const block of blocks) {
    const list = block.attributes.list === 'bullet' ? 'ul' : block.attributes.list === 'ordered' ? 'ol' : null;
    if (list !== activeList) {
      if (activeList) html += `</${activeList}>`;
      if (list) html += `<${list}>`;
      activeList = list;
    }
    const tag = list ? 'li' : [1, 2, 3].includes(block.attributes.header as number) ? `h${block.attributes.header}` : 'p';
    html += `<${tag}>${block.html || '<br>'}</${tag}>`;
  }
  if (activeList) html += `</${activeList}>`;
  return { html, referencedAttachmentIds: diagnostics.referencedAttachmentIds, errors: diagnostics.errors, unsupported: diagnostics.unsupported };
}

/** Unsupported legacy Markdown remains visible as escaped text; never send it expecting server Markdown parsing. */
export function topicMarkdownToSafeHtml(markdown: string): { html: string; lossless: boolean; unsupported: string[] } {
  const imported = importTopicMarkdown(markdown);
  if (imported.lossless) {
    const result = serializeTopicDocumentHtml(imported.delta);
    return { html: result.html, lossless: result.errors.length === 0 && result.unsupported.length === 0, unsupported: [...result.unsupported, ...result.errors] };
  }
  return { html: '<p>' + escapeTopicHtml(markdown).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>') + '</p>', lossless: false, unsupported: imported.unsupported };
}

export const topicMarkdownToDelta = importTopicMarkdown;
export function deltaToTopicMarkdown(delta: TopicDelta, attachments?: readonly TopicDocumentAttachment[], owner?: string): TopicSerializationResult {
  return serializeTopicDocument(delta, { attachments, username: owner });
}
export function restoreTopicDocument(value: unknown, legacyContent: string, options: TopicSerializationOptions = {}) {
  if (value && typeof value === 'object' && (value as TopicDocument).version === 1) {
    const delta = normalizeTopicDelta((value as TopicDocument).delta);
    const result = serializeTopicDocument(delta, options);
    return { document: { version: 1 as const, delta }, markdown: result.markdown,
      lossless: result.errors.length === 0 && result.unsupported.length === 0, unsupported: [...result.unsupported, ...result.errors] };
  }
  const imported = importTopicMarkdown(legacyContent);
  return { document: { version: 1 as const, delta: imported.delta }, markdown: legacyContent,
    lossless: imported.lossless, unsupported: imported.unsupported };
}
