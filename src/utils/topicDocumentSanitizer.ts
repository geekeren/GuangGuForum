import { normalizeTopicDelta, type TopicDelta, type TopicDeltaOp } from './topicDocument';

export interface TopicDeltaSanitization {
  delta: TopicDelta;
  /** Formats downgraded to supported semantics; authored text is never removed. */
  removedFormats: string[];
}

const INLINE = new Set(['bold', 'italic']);
const BLOCK = new Set(['header', 'list']);
// Keep identity metadata for the serializer's current-account/upload validation.
const IMAGE = new Set(['alt', 'width', 'height', 'data-custom', 'data-local', 'attachmentId']);
const attributesEqual = (a?: Record<string, unknown>, b?: Record<string, unknown>) =>
  JSON.stringify(a || {}) === JSON.stringify(b || {});

/**
 * Converts native rich-text snapshots to the forum's supported document format.
 * This is deliberately separate from strict normalization: old/source documents
 * and submission callers must not silently lose unsupported content. Malformed
 * input remains invalid, and image safety/ownership is still checked at export.
 * No clipboard, HTML parsing, editor mutation, upload, or storage side effects.
 */
export function sanitizeTopicDelta(input: unknown): TopicDeltaSanitization {
  const normalized = normalizeTopicDelta(input);
  const removed = new Set<string>();
  const ops: TopicDeltaOp[] = [];
  let pendingBlock: Record<string, unknown> = {};

  const append = (insert: TopicDeltaOp['insert'], attributes?: Record<string, unknown>) => {
    if (insert === '') return;
    const attrs = attributes && Object.keys(attributes).length ? { ...attributes } : undefined;
    const previous = ops[ops.length - 1];
    if (typeof insert === 'string' && previous && typeof previous.insert === 'string' &&
      attributesEqual(previous.attributes, attrs)) previous.insert += insert;
    else ops.push(attrs ? { insert, attributes: attrs } : { insert });
  };

  const blockFormats = (attributes: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    const header = attributes.header;
    const list = attributes.list;
    if (header !== undefined && header !== false && header !== '') {
      if (typeof header === 'number' && Number.isInteger(header) && header > 0) {
        result.header = Math.min(header, 3);
        if (header > 3) removed.add('header');
      } else removed.add('header');
    }
    if (list !== undefined && list !== false && list !== '') {
      if (list === 'bullet' || list === 'ordered') result.list = list;
      else if (list === 'check' || list === 'checked' || list === 'unchecked') {
        result.list = 'bullet'; removed.add('list');
      } else removed.add('list');
    }
    if (result.list && result.header) { delete result.header; removed.add('header'); }
    return result;
  };

  for (const op of normalized.ops) {
    const attributes = op.attributes || {};
    if (typeof op.insert !== 'string') {
      const imageAttributes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (IMAGE.has(key)) imageAttributes[key] = value;
        else removed.add(key);
      }
      append({ image: op.insert.image }, imageAttributes);
      continue;
    }

    const inline: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (INLINE.has(key)) {
        if (value === true) inline[key] = true;
        else if (value !== false) removed.add(key);
      } else if (!BLOCK.has(key)) removed.add(key);
    }
    const block = blockFormats(attributes);
    const explicitBlock = Object.keys(attributes).some(key => BLOCK.has(key));
    const parts = op.insert.split('\n');
    for (let index = 0; index < parts.length; index++) {
      const text = parts[index];
      append(text, inline);
      // Some paste providers put paragraph attributes on text, not its newline.
      if (text && explicitBlock) pendingBlock = block;
      if (index < parts.length - 1) {
        append('\n', explicitBlock ? block : pendingBlock);
        pendingBlock = {};
      }
    }
  }

  // Reapply the same bounds after splitting/merging. Errors from the incoming
  // snapshot survive, including unknown embeds and truncation/invalid values.
  const delta = normalizeTopicDelta({ ops, validationErrors: normalized.validationErrors });
  return { delta, removedFormats: [...removed].sort() };
}
