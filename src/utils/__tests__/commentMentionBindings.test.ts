import { describe, expect, it } from 'vitest';
import { editCommentMentionBindings, validCommentMentionBindings, verifiedMentionId, verifiedMentionTargets } from '../commentMentionBindings';
import { buildAttachmentComment, stickerAttachment } from '../commentAttachments';
import { STICKERS } from '../stickers';
const binding = { uid: 42, reply_id: 7, start: 3, end: 9, label: '@Alice' };
const text = '👍 @Alice 后文';
describe('explicit comment identity bindings', () => {
  it('accepts only positive safe server ids', () => {
    expect(verifiedMentionId('42')).toBe(42);
    for (const value of ['', 'r42', '-1', '0', '1.5', '9007199254740992']) expect(verifiedMentionId(value)).toBeUndefined();
  });
  it('keeps exact display names and rejects conflicting or missing identity mappings', () => {
    expect(verifiedMentionTargets([{ author: '复杂 名👍', authorUserId: '42' }, { author: '复杂 名👍', authorUserId: '42' }])).toEqual([{ label: '复杂 名👍', uid: 42 }]);
    expect(verifiedMentionTargets([{ author: 'same', authorUserId: '42' }, { author: 'same', authorUserId: '43' }])).toEqual([]);
    expect(verifiedMentionTargets([{ author: 'same', authorUserId: '42' }, { author: 'same' }])).toEqual([]);
  });
  it('validates UTF-16 exact slices rather than finding typed text by a name', () => {
    expect(validCommentMentionBindings(text, [binding])).toEqual([binding]);
    expect(validCommentMentionBindings(text, [])).toEqual([]);
    for (const invalid of [{ ...binding, start: 2 }, { ...binding, end: 10 }, { ...binding, start: -1 }, { ...binding, start: 3.5 }, { ...binding, uid: 0 }, { ...binding, reply_id: -1 }, { ...binding, label: '@Bob' }]) expect(validCommentMentionBindings(text, [invalid])).toEqual([]);
  });
  it('shifts both UTF-16 endpoints for edits before a label', () => {
    expect(editCommentMentionBindings(text, `😀${text}`, [binding])).toEqual([{ ...binding, start: 5, end: 11 }]);
    expect(editCommentMentionBindings(text, text.slice(3), [binding])).toEqual([{ ...binding, start: 0, end: 6 }]);
  });
  it('keeps bindings for edits after labels and for identical content', () => {
    expect(editCommentMentionBindings(text, `${text}更多`, [binding])).toEqual([binding]);
    expect(editCommentMentionBindings(text, text, [binding])).toEqual([binding]);
  });
  it('revokes labels touched by insertion, deletion or replacement without rebinding typed text', () => {
    for (const next of ['👍 @AlXice 后文', '👍 @Aice 后文', '👍 @Bob 后文', '👍  后文']) expect(editCommentMentionBindings(text, next, [binding])).toEqual([]);
    expect(editCommentMentionBindings('👍 @Bob 后文', text, [])).toEqual([]);
  });
  it('treats insertion at a label start as prefix movement and at its end as following text', () => {
    expect(editCommentMentionBindings(text, '👍 X@Alice 后文', [binding])).toEqual([{ ...binding, start: 4, end: 10 }]);
    expect(editCommentMentionBindings(text, '👍 @AliceX 后文', [binding])).toEqual([binding]);
  });
  it('keeps exact repeated-label identities independently and rejects overlapping ranges', () => {
    const value = '@same @same';
    const first = { uid: 1, reply_id: 9, start: 0, end: 5, label: '@same' };
    const second = { uid: 2, reply_id: 10, start: 6, end: 11, label: '@same' };
    expect(validCommentMentionBindings(value, [second, first])).toEqual([first, second]);
    expect(validCommentMentionBindings(value, [first, { ...first, uid: 3 }])).toEqual([first]);
  });
  it('revokes both repeated identities when deleting either indistinguishable occurrence', () => {
    const previous = '@same @same';
    const first = { uid: 1, reply_id: 9, start: 0, end: 5, label: '@same' };
    const second = { uid: 2, reply_id: 10, start: 6, end: 11, label: '@same' };
    expect(editCommentMentionBindings(previous, '@same', [first, second])).toEqual([]);
    expect(editCommentMentionBindings('@same @same @same', '@same @same', [first, second])).toEqual([]);
  });
  it('revokes an original identity when a repeated-label insertion could put it at either position', () => {
    const original = { uid: 1, reply_id: 9, start: 0, end: 5, label: '@same' };
    expect(editCommentMentionBindings('@same', '@same @same', [original])).toEqual([]);
  });
  it('retains independent bindings outside an ambiguous repeated edit', () => {
    const previous = '@Alice|@same @same|@Bob';
    const bindings = [
      { uid: 1, reply_id: 0, start: 0, end: 6, label: '@Alice' },
      { uid: 2, reply_id: 1, start: 7, end: 12, label: '@same' },
      { uid: 3, reply_id: 2, start: 13, end: 18, label: '@same' },
      { uid: 4, reply_id: 0, start: 19, end: 23, label: '@Bob' },
    ];
    expect(editCommentMentionBindings(previous, '@Alice|@same|@Bob', bindings)).toEqual([
      bindings[0], { ...bindings[3], start: 13, end: 17 },
    ]);
  });
  it('revokes adjacent identities when shared label characters also admit a touched boundary', () => {
    const previous = '@Alice @same @same @Bob';
    const bindings = [
      { uid: 1, reply_id: 0, start: 0, end: 6, label: '@Alice' },
      { uid: 4, reply_id: 0, start: 19, end: 23, label: '@Bob' },
    ];
    // Deleting "e @sam" after @Alic or "same @" before Bob produces the same text.
    expect(editCommentMentionBindings(previous, '@Alice @same @Bob', bindings)).toEqual([]);
  });
  it('preserves uniquely located edits among repeated labels without reverse lookup', () => {
    const previous = '@same LEFT @same RIGHT';
    const first = { uid: 1, reply_id: 9, start: 0, end: 5, label: '@same' };
    const second = { uid: 2, reply_id: 10, start: 11, end: 16, label: '@same' };
    expect(editCommentMentionBindings(previous, 'LEFT @same RIGHT', [first, second])).toEqual([{ ...second, start: 5, end: 10 }]);
    expect(editCommentMentionBindings(previous, '@same LEFT RIGHT', [first, second])).toEqual([first]);
  });
  it('caps bindings at sixteen and never scans appended image Markdown', () => {
    const value = Array(20).fill('@A').join(' ');
    const many = Array.from({ length: 20 }, (_, i) => ({ uid: i + 1, reply_id: 0, start: i * 3, end: i * 3 + 2, label: '@A' }));
    expect(validCommentMentionBindings(value, many)).toHaveLength(16);
    const final = buildAttachmentComment(text, [stickerAttachment(STICKERS[0])]);
    expect(final.startsWith(`${text}\n\n`)).toBe(true);
    expect(validCommentMentionBindings(final, [binding])).toEqual([binding]);
  });
});
