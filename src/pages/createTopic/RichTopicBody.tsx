import { Editor, Text, View, type EditorProps } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useImperativeHandle, useRef, useState, type ComponentType, type RefObject } from 'react';
import MentionTextarea from '../../components/MentionTextarea';
import { getCachedUsername } from '../../utils/currentUser';
import { AI_MENTION_USERNAME } from '../../utils/mentions';
import { importTopicMarkdown, normalizeTopicDelta, serializeTopicDocument, serializeTopicDocumentHtml, type TopicDocument, type TopicDelta } from '../../utils/topicDocument';
import { createNativeEditorAdapter, type NativeEditorAdapter, type NativeEditorContext } from './nativeEditor';
import { editorDeltaText, planEditorShortcut } from './editorShortcuts';
import type { TopicAttachment } from './TopicEditor';

export interface EditorSnapshot { markdown: string; document?: TopicDocument; errors: string[]; unsupported: string[]; referencedAttachmentIds?: string[] }
export interface RichBodyHandle {
  snapshot(): Promise<EditorSnapshot>;
  insertText(text: string): Promise<void>;
  insertImage(src: string, id: string, alt: string): Promise<boolean>;
  format(name: string, value?: string): void;
  openMentions(): void;
}
interface Props {
  value: string; document?: TopicDocument; attachments: TopicAttachment[]; disabled: boolean; focus: boolean;
  placeholder: string; handleRef: RefObject<RichBodyHandle | null>; onChange: (value: string, document?: TopicDocument) => void;
  onFocus: () => void; onBlur: () => void;
}
let nextEditorId = 0;
const NativeEditor = Editor as ComponentType<EditorProps & { focus?: boolean }>;
const SOURCE_NOTICE = '此内容包含暂不支持的 Markdown，源码已完整保留；预览和发布将按原样文字显示。';

export default function RichTopicBody(props: Props) {
  const id = useRef(`topic-native-editor-${++nextEditorId}`);
  const initial = useRef(importTopicMarkdown(props.value));
  const [sourceMode, setSourceMode] = useState(!props.document && !initial.current.lossless);
  const [notice, setNotice] = useState(initial.current.lossless ? '' : SOURCE_NOTICE);
  const [mentions, setMentions] = useState(false);
  const [ready, setReady] = useState(false);
  const active = useRef(true);
  const adapter = useRef<NativeEditorAdapter | null>(null);
  const delta = useRef<TopicDelta>(normalizeTopicDelta(props.document?.delta || initial.current.delta));
  const latest = useRef(props); latest.current = props;
  const lastValue = useRef(props.value);
  const lastDocument = useRef(props.document);
  const boundary = useRef(0);
  const revision = useRef(0);
  const operation = useRef<Promise<unknown> | null>(null);
  const expectedShortcutTexts = useRef<Set<string> | null>(null);
  const sourceHandle = useRef<any>(null);
  const snapshotValue = (next = delta.current): EditorSnapshot => {
    const options = { attachments: latest.current.attachments, username: getCachedUsername() };
    const result = serializeTopicDocument(next, options);
    const html = serializeTopicDocumentHtml(next, options);
    return { document: { version: 1, delta: next }, markdown: result.errors.length || result.unsupported.length ? lastValue.current : result.markdown,
      errors: html.errors, unsupported: html.unsupported, referencedAttachmentIds: html.referencedAttachmentIds };
  };
  const publish = (next: TopicDelta) => {
    delta.current = normalizeTopicDelta(next);
    const result = snapshotValue();
    setNotice(result.unsupported.length ? '检测到暂不支持的格式，请撤销该格式后再预览。' : result.errors.length ? '正文图片或格式状态异常，请检查后重试。' : '');
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
    if (sourceMode) return { markdown: lastValue.current, errors: [], unsupported: [] };
    await operation.current;
    return read();
  };
  useEffect(() => () => { active.current = false; boundary.current++; adapter.current?.dispose(); }, []);
  // Hydrate only an external draft/reset. Echoed native typing never invokes setContents.
  useEffect(() => {
    if (props.value === lastValue.current && props.document === lastDocument.current) return;
    lastValue.current = props.value; lastDocument.current = props.document; boundary.current++; revision.current++;
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
  useImperativeHandle(props.handleRef, () => ({
    snapshot,
    async insertText(text) {
      if (sourceMode) { if (!latest.current.disabled) sourceHandle.current?.insertText(text); return; }
      await write(ctx => ctx.insertText(text));
    },
    async insertImage(src, imageId, alt) {
      if (sourceMode) {
        if (latest.current.disabled || !sourceHandle.current) return false;
        sourceHandle.current.insertText(`\n\n![${alt}](${src.replace(/\(/g, '%28').replace(/\)/g, '%29')})\n\n`); return true;
      }
      return write(ctx => ctx.insertImage(src, imageId, alt));
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
    if (latest.current.disabled || operation.current) return;
    if (sourceMode) {
      const imported = importTopicMarkdown(lastValue.current);
      if (!imported.lossless) { setNotice(SOURCE_NOTICE); return; }
      delta.current = imported.delta; boundary.current++; setSourceMode(false); setReady(false); setNotice('');
    } else {
      try {
        // Failed initialization has no edits: the exact legacy source remains recoverable.
        const result = ready ? await snapshot() : { markdown: lastValue.current, errors: [], unsupported: [] };
        if (result.errors.length || result.unsupported.length) return;
        boundary.current++; adapter.current?.dispose(); adapter.current = null;
        setSourceMode(true); setReady(false); lastDocument.current = undefined;
        latest.current.onChange(result.markdown, undefined);
      } catch { setNotice('正文读取失败，不能切换或预览，请重试。'); }
    }
  };
  return <View className='richTopicBody'>
    <View className='topicWritingHint'><Text>{sourceMode ? 'Markdown 源码' : '正文 · 输入 # 空格或 **加粗** 自动排版'}</Text>
      <Text className='topicSourceToggle' onClick={() => { void switchMode(); }}>{sourceMode ? '切换富文本' : '源码'}</Text></View>
    {notice && <Text className='topicEditorNotice'>{notice}</Text>}
    {sourceMode ? <MentionTextarea className='contentInput topicEditorInput' value={props.value} editorRef={sourceHandle}
      mentionUsers={getCachedUsername() ? [getCachedUsername()] : []} placeholder={props.placeholder} disabled={props.disabled}
      autoHeight focus={props.focus} holdKeyboard maxlength={50000} onFocus={props.onFocus} onBlur={props.onBlur}
      onInput={event => { lastValue.current = event.detail.value; lastDocument.current = undefined; setNotice(importTopicMarkdown(event.detail.value).lossless ? '' : SOURCE_NOTICE); props.onChange(event.detail.value, undefined); }}
    />
      : <NativeEditor id={id.current} className='topicNativeEditor' placeholder={props.placeholder} readOnly={props.disabled || !ready}
          focus={props.focus} showImgToolbar showImgResize onReady={onReady} onFocus={props.onFocus}
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
