import { Editor, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import MentionTextarea from '../../components/MentionTextarea';
import { getCachedUsername } from '../../utils/currentUser';
import { useTheme } from '../../hooks/useTheme';
import { THEME_PALETTES } from '../../utils/themePreferences';
import { AI_MENTION_USERNAME } from '../../utils/mentions';
import { tryHideKeyboardAccessoryView } from '../../utils/keyboardAccessory';
import { importTopicMarkdown, normalizeTopicDelta, serializeTopicDocument, serializeTopicDocumentHtml, type TopicDocument, type TopicDelta } from '../../utils/topicDocument';
import { sanitizeTopicDelta } from '../../utils/topicDocumentSanitizer';
import { createNativeEditorAdapter, type NativeEditorAdapter, type NativeEditorContext } from './nativeEditor';
import { editorDeltaText, planEditorShortcut } from './editorShortcuts';
import { EMPTY_FORMAT_STATUS, parseNativeEditorStatus, sameFormatStatus, type TopicFormatStatus } from './nativeEditorStatus';
import type { TopicAttachment } from './TopicEditor';

export interface EditorSnapshot { markdown: string; document?: TopicDocument; errors: string[]; unsupported: string[]; referencedAttachmentIds?: string[] }
export type ImageInsertionResult = 'inserted' | 'retry' | 'uncertain' | 'cancelled';
export interface RichBodyHandle {
  /** Only the source textarea supports programmatic focus; native Editor does not. */
  canFocus(): boolean;
  snapshot(): Promise<EditorSnapshot>;
  insertText(text: string): Promise<void>;
  insertImage(src: string, id: string, alt: string, current?: () => boolean): Promise<ImageInsertionResult>;
  confirmImage(id: string): Promise<boolean>;
  format(name: string, value?: string): void;
  openMentions(): void;
}
interface Props {
  value: string; document?: TopicDocument; attachments: TopicAttachment[]; disabled: boolean; focus: boolean;
  placeholder: string; handleRef: RefObject<RichBodyHandle | null>; onChange: (value: string, document?: TopicDocument) => void;
  onFocus: () => void; onBlur: () => void; onTouchStart?: () => void;
  onFormatStatusChange?: (status: TopicFormatStatus) => void;
}
let nextEditorId = 0;
const SOURCE_NOTICE = '此内容包含暂不支持的 Markdown，源码已完整保留；预览和发布将按原样文字显示。';
const FORMAT_LABELS: Record<string, string> = {
  header: '标题级别', list: '列表类型', bold: '加粗', italic: '斜体', underline: '下划线', strike: '删除线',
  color: '文字颜色', background: '文字背景', font: '字体', size: '字号', align: '段落对齐', indent: '缩进',
  link: '链接', 'code-block': '代码块', blockquote: '引用',
  'block-format-on-text': '标题或列表的段落位置', 'conflicting-block-format': '同一段落的标题与列表冲突',
};

export default function RichTopicBody(props: Props) {
  const { theme } = useTheme();
  const id = useRef(`topic-native-editor-${++nextEditorId}`);
  const initial = useRef(importTopicMarkdown(props.value));
  const [sourceMode, setSourceMode] = useState(!props.document && !initial.current.lossless);
  const [notice, setNotice] = useState(initial.current.lossless ? '' : SOURCE_NOTICE);
  const [mentions, setMentions] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(ready); readyRef.current = ready;
  const sourceModeRef = useRef(sourceMode); sourceModeRef.current = sourceMode;
  const active = useRef(true);
  const adapter = useRef<NativeEditorAdapter | null>(null);
  const delta = useRef<TopicDelta>(normalizeTopicDelta(props.document?.delta || initial.current.delta));
  const latest = useRef(props); latest.current = props;
  const lastValue = useRef(props.value);
  const lastDocument = useRef(props.document);
  const boundary = useRef(0);
  const revision = useRef(0);
  const operation = useRef<Promise<unknown> | null>(null);
  const imageQueue = useRef(Promise.resolve());
  const pendingImages = useRef(0);
  const insertedImages = useRef(new Set<string>());
  const imageAttempts = useRef(new Map<string, { src: string; countBefore: number; boundary: number }>());
  const expectedShortcutTexts = useRef<Set<string> | null>(null);
  const sourceHandle = useRef<any>(null);
  const handleFocus = () => { tryHideKeyboardAccessoryView(); props.onFocus(); };
  const formatDiagnostic = useRef('');
  const removedFormats = useRef<string[]>([]);
  const formatStatus = useRef(EMPTY_FORMAT_STATUS);
  const publishFormatStatus = (next: TopicFormatStatus) => {
    if (sameFormatStatus(formatStatus.current, next)) return;
    formatStatus.current = next;
    latest.current.onFormatStatusChange?.(next);
  };
  useEffect(() => {
    publishFormatStatus(!sourceMode && ready && !props.disabled ? { ...formatStatus.current, available: true } : EMPTY_FORMAT_STATUS);
  }, [sourceMode, ready, props.disabled]);
  const snapshotValue = (next = delta.current): EditorSnapshot => {
    const options = { attachments: latest.current.attachments, username: getCachedUsername() };
    const result = serializeTopicDocument(next, options);
    const html = serializeTopicDocumentHtml(next, options);
    return { document: { version: 1, delta: next }, markdown: result.errors.length || result.unsupported.length ? lastValue.current : result.markdown,
      errors: html.errors, unsupported: html.unsupported, referencedAttachmentIds: html.referencedAttachmentIds };
  };
  const publish = (next: unknown) => {
    const sanitized = sanitizeTopicDelta(next);
    delta.current = sanitized.delta;
    if (sanitized.removedFormats.length) removedFormats.current = [...new Set([...removedFormats.current, ...sanitized.removedFormats])];
    const result = snapshotValue();
    const formats = result.unsupported.map(code => FORMAT_LABELS[code] || code).join('、');
    const downgraded = removedFormats.current.map(code => FORMAT_LABELS[code] || code).join('、');
    setNotice(formats ? `暂不支持：${formats}。请撤销对应格式后再预览。` : result.errors.length ? '正文图片或格式状态异常，请检查后重试。'
      : downgraded ? `已转换为支持的正文格式：${downgraded}。预览以转换后内容为准。` : '');
    if (process.env.NODE_ENV !== 'production') {
      // Log only formatting metadata, never body text, image URLs or attachment data.
      const attributes = new Set<string>();
      if (result.unsupported.length) for (const op of delta.current.ops) {
        for (const [key, value] of Object.entries(op.attributes || {})) {
          if (!['header', 'list', 'bold', 'italic'].includes(key)) continue;
          attributes.add(JSON.stringify({ key, type: typeof value, value: typeof value === 'string' ? value.slice(0, 12) : typeof value === 'number' || typeof value === 'boolean' ? value : undefined }));
        }
        if (attributes.size >= 20) break;
      }
      const signature = JSON.stringify({ unsupported: result.unsupported, attributes: Array.from(attributes) });
      if (formatDiagnostic.current !== signature) {
        formatDiagnostic.current = signature;
        if (result.unsupported.length) console.debug('[RichTopicBody unsupported formats]', { unsupported: result.unsupported, attributes: Array.from(attributes, entry => JSON.parse(entry)) });
      }
    }
    lastValue.current = result.markdown; lastDocument.current = result.document;
    latest.current.onChange(result.markdown, result.document);
  };
  const read = async () => {
    const ctx = adapter.current, version = boundary.current, edit = revision.current;
    if (!ctx || !ready) throw new Error('Editor unavailable');
    const contents = await ctx.snapshot();
    if (!active.current || version !== boundary.current || ctx !== adapter.current || edit !== revision.current) throw new Error('Editor changed while reading');
    publish(contents);
    return snapshotValue();
  };
  const snapshot = async (): Promise<EditorSnapshot> => {
    await imageQueue.current;
    await operation.current;
    const result = sourceModeRef.current ? { markdown: lastValue.current, errors: [], unsupported: [], referencedAttachmentIds: [] } : await read();
    const references = new Set(result.referencedAttachmentIds);
    const unconfirmed = latest.current.attachments.some(item => item.insertionState && !item.richManaged
      && !insertedImages.current.has(item.id) && !references.has(item.id));
    return unconfirmed ? { ...result, errors: [...result.errors, '图片尚未确认插入正文，请重试插入或移除附件'] } : result;
  };
  useEffect(() => () => { active.current = false; boundary.current++; adapter.current?.dispose(); }, []);
  // Hydrate only an external draft/reset. Echoed native typing never invokes setContents.
  useEffect(() => {
    if (props.value === lastValue.current && props.document === lastDocument.current) return;
    publishFormatStatus(EMPTY_FORMAT_STATUS);
    readyRef.current = false;
    lastValue.current = props.value; lastDocument.current = props.document; boundary.current++; revision.current++;
    removedFormats.current = [];
    insertedImages.current.clear(); imageAttempts.current.clear();
    const imported = importTopicMarkdown(props.value);
    delta.current = normalizeTopicDelta(props.document?.delta || imported.delta);
    if (!props.document && !imported.lossless) {
      adapter.current?.dispose(); adapter.current = null; setReady(false); setSourceMode(true); setNotice(SOURCE_NOTICE); return;
    }
    if (!sourceMode && adapter.current) {
      const version = boundary.current, ctx = adapter.current;
      setReady(false);
      void ctx.hydrate(delta.current).then(() => { if (active.current && version === boundary.current) setReady(true); })
        .catch(() => { if (active.current) setNotice('正文恢复失败，可切换源码继续编辑。'); });
    }
  }, [props.value, props.document]);

  const write = async (job: (ctx: NativeEditorAdapter) => Promise<unknown>): Promise<boolean> => {
    if (!adapter.current || !ready || latest.current.disabled || !active.current || operation.current) return false;
    const ctx = adapter.current, version = boundary.current;
    let inserted = false;
    const task = (async () => {
      try {
        await job(ctx); inserted = active.current && version === boundary.current && ctx === adapter.current;
      } catch { if (active.current) setNotice('编辑操作失败，请检查正文后重试。'); }
      // Reconcile even a partially applied mutation; never claim the original markers survived.
      if (active.current && version === boundary.current && ctx === adapter.current) {
        const edit = revision.current;
        try {
          const contents = await ctx.snapshot();
          if (active.current && version === boundary.current && ctx === adapter.current && edit === revision.current) publish(contents);
          else if (active.current) setNotice('编辑期间正文已变化，请重新预览以读取最新内容。');
        } catch { if (active.current) setNotice('正文读取失败，请重新点击正文后预览。'); }
      }
      if (!inserted && active.current) setNotice('编辑操作未完成，已同步当前正文，请检查或撤销后重试。');
    })();
    operation.current = task;
    try { await task; return inserted; } finally { if (operation.current === task) operation.current = null; }
  };
  const countImage = (contents: TopicDelta, src: string) => {
    const encoded = src.replace(/\(/g, '%28').replace(/\)/g, '%29');
    return contents.ops.filter(op => typeof op.insert === 'object' && (op.insert.image === src || op.insert.image === encoded)).length;
  };
  const insertImage = async (src: string, imageId: string, alt: string, current: () => boolean = () => true): Promise<ImageInsertionResult> => {
    const version = boundary.current;
    const valid = () => active.current && version === boundary.current && current();
    pendingImages.current++;
    // Uploads can finish during another editor operation; do not drop a busy insertion.
    const queued = imageQueue.current.then(async (): Promise<ImageInsertionResult> => {
      while (operation.current) await operation.current;
      if (!valid()) return 'cancelled';
      if (insertedImages.current.has(imageId)) return 'inserted';
      if (latest.current.disabled) return 'retry';
      if (sourceModeRef.current) {
        if (!sourceHandle.current) return 'retry';
        const before = lastValue.current;
        sourceHandle.current.insertText(`\n\n![${alt}](${src.replace(/\(/g, '%28').replace(/\)/g, '%29')})\n\n`);
        if (before === lastValue.current) return 'retry';
        insertedImages.current.add(imageId);
        return 'inserted';
      }
      const ctx = adapter.current;
      if (!ctx || !readyRef.current) return 'retry';
      const currentEditor = () => valid() && ctx === adapter.current && !latest.current.disabled;
      let submitted = false;
      const task = (async (): Promise<ImageInsertionResult> => {
        try {
          const before = await ctx.snapshot();
          if (!currentEditor()) return 'cancelled';
          if (before.validationErrors?.length) return 'retry';
          if (snapshotValue(before).referencedAttachmentIds?.includes(imageId)) {
            insertedImages.current.add(imageId); return 'inserted';
          }
          const countBefore = countImage(before, src);
          imageAttempts.current.set(imageId, { src, countBefore, boundary: version });
          try {
            await ctx.insertImage(src, imageId, alt, () => {
              if (!currentEditor()) return false;
              submitted = true;
              return true;
            });
          } catch { if (!submitted) return 'cancelled'; }
          // A failed native callback may still have inserted the image.
          if (!currentEditor()) return 'uncertain';
          const edit = revision.current;
          const after = await ctx.snapshot();
          if (!currentEditor()) return 'uncertain';
          if (edit === revision.current) publish(after);
          const confirmed = snapshotValue(after).referencedAttachmentIds?.includes(imageId) || countImage(after, src) > countBefore;
          if (!confirmed) return 'uncertain';
          insertedImages.current.add(imageId);
          return 'inserted';
        } catch { return submitted ? 'uncertain' : 'retry'; }
      })();
      operation.current = task;
      try { return await task; } finally { if (operation.current === task) operation.current = null; }
    });
    imageQueue.current = queued.then(() => undefined, () => undefined);
    try { return await queued; } finally { pendingImages.current--; }
  };
  useImperativeHandle(props.handleRef, () => ({
    canFocus: () => sourceModeRef.current && !latest.current.disabled && active.current,
    snapshot,
    async insertText(text) {
      if (sourceMode) { if (!latest.current.disabled) sourceHandle.current?.insertText(text); return; }
      await write(ctx => ctx.insertText(text));
    },
    insertImage,
    async confirmImage(imageId) {
      await imageQueue.current;
      await operation.current;
      if (!active.current || sourceModeRef.current || !readyRef.current) return false;
      const version = boundary.current;
      try {
        const result = await read();
        const attempt = imageAttempts.current.get(imageId);
        const confirmed = result.referencedAttachmentIds?.includes(imageId) || !!attempt && attempt.boundary === version
          && !!result.document && countImage(result.document.delta, attempt.src) > attempt.countBefore;
        if (confirmed && active.current && version === boundary.current) { insertedImages.current.add(imageId); return true; }
      } catch {}
      return false;
    },
    format(name, value) {
      if (!sourceMode) void write(async ctx => {
        if (name === 'header' && value === '') { await ctx.format('header', ''); await ctx.format('list', ''); }
        else await ctx.format(name, value);
      });
    },
    openMentions() { if (sourceMode) sourceHandle.current?.openMentions(); else setMentions(value => !value); },
  }));

  const onReady = () => {
    readyRef.current = false;
    publishFormatStatus(EMPTY_FORMAT_STATUS);
    Taro.createSelectorQuery().select(`#${id.current}`).context(result => {
      if (!active.current || !result.context) return;
      const ctx = createNativeEditorAdapter(result.context as NativeEditorContext, () => active.current);
      const version = boundary.current;
      adapter.current?.dispose(); adapter.current = ctx;
      void ctx.hydrate(delta.current).then(() => {
        if (active.current && version === boundary.current && ctx === adapter.current) setReady(true);
      }).catch(() => { if (active.current) setNotice('富文本初始化失败，可切换源码继续编辑。'); });
    }).exec();
  };
  const onInput = async (next: TopicDelta) => {
    if (!active.current) return;
    const previous = delta.current;
    const ownEvent = expectedShortcutTexts.current?.has(editorDeltaText(next));
    if (!ownEvent) revision.current++;
    const edit = revision.current;
    publish(next);
    if (operation.current || latest.current.disabled || !ready || !adapter.current?.supportsRanges) return;
    const ctx = adapter.current;
    try {
      const range = await ctx.selection();
      if (!range || edit !== revision.current || ctx !== adapter.current || !active.current || operation.current) return;
      const plan = planEditorShortcut(previous, delta.current, range);
      if (!plan) return;
      let text = editorDeltaText(delta.current);
      const allowed = new Set([text]);
      for (const deletion of plan.deletions) { text = text.slice(0, deletion.index) + text.slice(deletion.index + deletion.length); allowed.add(text); }
      expectedShortcutTexts.current = allowed;
      await write(editor => editor.shortcut(plan, () => active.current && edit === revision.current));
    } catch { if (active.current) setNotice('自动排版未完成，已保留当前正文，请检查或撤销后重试。'); }
    finally { expectedShortcutTexts.current = null; }
  };
  const switchMode = async () => {
    if (latest.current.disabled || operation.current || pendingImages.current) return;
    if (sourceMode) {
      const imported = importTopicMarkdown(lastValue.current);
      if (!imported.lossless) { setNotice(SOURCE_NOTICE); return; }
      delta.current = imported.delta; boundary.current++; insertedImages.current.clear(); imageAttempts.current.clear(); setSourceMode(false); setReady(false); setNotice('');
    } else {
      try {
        // Failed initialization has no edits: the exact legacy source remains recoverable.
        const result = ready ? await snapshot() : { markdown: lastValue.current, errors: [], unsupported: [] };
        if (result.errors.length || result.unsupported.length) return;
        boundary.current++; insertedImages.current.clear(); imageAttempts.current.clear(); adapter.current?.dispose(); adapter.current = null;
        setSourceMode(true); setReady(false); lastDocument.current = undefined;
        latest.current.onChange(result.markdown, undefined);
      } catch { setNotice('正文读取失败，不能切换或预览，请重试。'); }
    }
  };
  return <View className='richTopicBody'>
    {notice && <Text className='topicEditorNotice'>{notice}</Text>}
    {(sourceMode || notice && !ready) && <View className='topicEditorRecovery' onClick={() => { void switchMode(); }}>
      <Text>{sourceMode ? '恢复富文本编辑' : '使用源码继续编辑'}</Text>
    </View>}
    {sourceMode ? <MentionTextarea className='contentInput topicEditorInput' value={props.value} editorRef={sourceHandle}
      mentionUsers={getCachedUsername() ? [getCachedUsername()] : []} placeholder={props.placeholder} disabled={props.disabled}
      autoHeight focus={props.focus} holdKeyboard={props.focus} showConfirmBar={false} maxlength={50000} onFocus={handleFocus} onBlur={props.onBlur}
      onTouchStart={props.onTouchStart}
      onInput={event => { lastValue.current = event.detail.value; lastDocument.current = undefined; setNotice(importTopicMarkdown(event.detail.value).lossless ? '' : SOURCE_NOTICE); props.onChange(event.detail.value, undefined); }}
    />
      : <Editor id={id.current} className='topicNativeEditor' style={{ color: THEME_PALETTES[theme]['text-primary'] }} placeholder={props.placeholder} readOnly={props.disabled || !ready}
          showImgToolbar showImgResize onReady={onReady} onFocus={handleFocus} onTouchStart={props.onTouchStart}
          onStatusChange={event => {
            if (active.current && readyRef.current && !sourceModeRef.current && !latest.current.disabled) publishFormatStatus(parseNativeEditorStatus(event.detail));
          }}
          onBlur={event => { if (event.detail?.delta && active.current) publish(event.detail.delta); props.onBlur(); }}
          onInput={event => { void onInput(event.detail.delta); }}
      />}
    {mentions && <View className='topicRichMentions' onTouchEnd={event => event.stopPropagation()}>
      {[...new Set([getCachedUsername(), AI_MENTION_USERNAME].filter(Boolean))].map(user => <Text className='topicMentionChip' key={user}
        onClick={() => { void write(ctx => ctx.insertText(`@${user} `)); setMentions(false); }}
      >@{user}</Text>)}
    </View>}
  </View>;
}
