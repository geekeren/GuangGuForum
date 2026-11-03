import type { TopicDelta } from '../../utils/topicDocument';

export interface EditorRange { index: number; length: number }
export interface ShortcutPlan {
  deletions: EditorRange[];
  selection: EditorRange;
  format: { name: 'header' | 'list' | 'bold'; value: string };
  caret: number;
}

export function editorDeltaText(delta: TopicDelta): string {
  return delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '￼').join('');
}

/** Only an appended ASCII delimiter in the final plain line; earlier rich content is untouched. */
export function planEditorShortcut(previous: TopicDelta, next: TopicDelta, range: EditorRange): ShortcutPlan | null {
  const before = editorDeltaText(previous), after = editorDeltaText(next);
  if (!before.endsWith('\n') || !after.endsWith('\n')) return null;
  const oldText = before.slice(0, -1), text = after.slice(0, -1);
  if (range.length || range.index !== text.length || text.length !== oldText.length + 1 || !text.startsWith(oldText) || !/[ *]/.test(text.slice(-1))) return null;
  const start = text.lastIndexOf('\n') + 1;
  // Native/Delta indices use UTF-16 string lengths and one slot per embed. Device verification remains required.
  let position = 0;
  for (const op of next.ops) {
    const length = typeof op.insert === 'string' ? op.insert.length : 1;
    if (position + length > start && (typeof op.insert !== 'string' || Object.keys(op.attributes || {}).length)) return null;
    position += length;
  }
  // Confirm unchanged rich prefix too, not merely unchanged rendered text.
  const prefix = (delta: TopicDelta) => {
    let remaining = start;
    return JSON.stringify(delta.ops.flatMap(op => {
      if (!remaining) return [];
      const length = typeof op.insert === 'string' ? op.insert.length : 1;
      const take = Math.min(length, remaining); remaining -= take;
      return [{ insert: typeof op.insert === 'string' ? op.insert.slice(0, take) : op.insert, ...(op.attributes ? { attributes: op.attributes } : {}) }];
    }));
  };
  if (prefix(previous) !== prefix(next)) return null;
  const line = text.slice(start);
  const heading = /^(#{1,3}) $/.exec(line);
  const list = line === '- ' ? 'bullet' : line === '1. ' ? 'ordered' : null;
  if (heading || list) return {
    deletions: [{ index: start, length: line.length }], selection: { index: start, length: 0 },
    format: heading ? { name: 'header', value: `h${heading[1].length}` } : { name: 'list', value: list! }, caret: start,
  };
  const bold = /^(.*?)\*\*([^*\\\n]+)\*\*$/.exec(line);
  if (!bold || /[*\\`_￼]/.test(bold[1]) || !bold[2].trim()) return null;
  const opening = start + bold[1].length;
  return {
    deletions: [{ index: text.length - 2, length: 2 }, { index: opening, length: 2 }],
    selection: { index: opening, length: bold[2].length }, format: { name: 'bold', value: 'true' }, caret: text.length - 4,
  };
}
