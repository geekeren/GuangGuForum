import { Image, RootPortal, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useReady } from '@tarojs/taro';
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { createImageUploadController, ImageUploadError, uploadImage } from 'guanggu-forum-api';
import RichTopicBody, { type ImageInsertionResult, type RichBodyHandle } from './RichTopicBody';
import { serializeTopicDocument, type TopicDocument } from '../../utils/topicDocument';
import ThemedIcon from '../../components/ThemedIcon';
import MentionIcon from '../../assets/composer-mention.svg?raw';
import EmojiIcon from '../../assets/composer-emoji.svg?raw';
import KeyboardIcon from '../../assets/composer-keyboard.svg?raw';
import AddIcon from '../../assets/editor-add.svg?raw';
import HeadingIcon from '../../assets/editor-heading.svg?raw';
import BoldIcon from '../../assets/editor-bold.svg?raw';
import ListIcon from '../../assets/editor-list.svg?raw';
import TrashIcon from '../../assets/search-trash.svg?raw';
import CameraIcon from '../../assets/composer-camera.svg?raw';
import PhotoIcon from '../../assets/composer-photo.svg?raw';
import FavoriteIcon from '../../assets/composer-favorite.svg?raw';
import { EMOJIS, getCommonEmojiUsage, recordCommentEmojiUsage } from '../../utils/emojiUsage';
import { MAX_COMMENT_ATTACHMENTS, STICKERS, type Sticker } from '../../utils/stickers';
import { compressCommentPhoto } from '../../utils/commentPhotos';
import { isImageCompressionEnabled } from '../../utils/imageCompressionPreferences';
import { getCachedUsername } from '../../utils/currentUser';
import { usePageScrollViewType } from '../../hooks/usePageRenderer';
import { ensureImageHostBound, openImageHostSettings } from '../../utils/imageUploadGuard';
import { useTheme } from '../../hooks/useTheme';
import { THEME_PALETTES, themeVariables } from '../../utils/themePreferences';
import { svgIconSource } from '../../utils/svgIcon';
import { resolveViewportInset } from '../../utils/keyboardDockPosition';
import { tryHideKeyboardAccessoryView } from '../../utils/keyboardAccessory';
import { EMPTY_FORMAT_STATUS, type TopicFormatStatus } from './nativeEditorStatus';
import './TopicEditor.scss';

type Photo = {
  id: string; kind: 'photo'; path: string; owner: string; url?: string; uploadId?: string;
  phase: 'preparing' | 'uploading' | 'processing' | 'complete' | 'failed';
  progress: number | null; compressed?: boolean; error?: string; richManaged?: boolean;
  insertionState?: 'pending' | 'failed' | 'uncertain';
};
export type TopicAttachment = Photo | { id: string; kind: 'sticker'; sticker: Sticker; richManaged?: boolean; insertionState?: 'pending' | 'failed' | 'uncertain' };

export function restoreTopicAttachments(value: unknown): TopicAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COMMENT_ATTACHMENTS).flatMap((item): TopicAttachment[] => {
    if (!item || typeof item.id !== 'string') return [];
    const insertionState = item.richManaged === true ? undefined : item.insertionState === 'pending' || item.insertionState === 'uncertain'
      ? 'uncertain' : item.insertionState === 'failed' ? 'failed' : undefined;
    if (item.kind === 'sticker') {
      const sticker = STICKERS.find(entry => entry.filename === item.sticker?.filename);
      return sticker ? [{ id: item.id, kind: 'sticker', sticker, richManaged: item.richManaged === true, insertionState }] : [];
    }
    if (item.kind !== 'photo' || typeof item.path !== 'string' || typeof item.owner !== 'string') return [];
    const complete = item.phase === 'complete' && typeof item.url === 'string' && /^https:\/\//.test(item.url);
    return [{
      id: item.id, kind: 'photo', path: item.path, owner: item.owner,
      uploadId: typeof item.uploadId === 'string' ? item.uploadId : undefined,
      url: complete ? item.url : undefined, compressed: item.compressed === true, richManaged: item.richManaged === true,
      insertionState,
      phase: complete ? 'complete' : 'failed', progress: complete ? 100 : null,
      error: complete ? undefined : '上传已中断，点击重试',
    }];
  });
}

interface Props {
  value: string;
  placeholder: string;
  inputRef: RefObject<any>;
  previousRef: RefObject<any>;
  disabled: boolean;
  onClear?: () => void;
  attachments: TopicAttachment[];
  onAttachmentsChange: (update: (current: TopicAttachment[]) => TopicAttachment[]) => void;
  document?: TopicDocument;
  onChange: (value: string, document?: TopicDocument) => void;
}

let nextAttachmentId = 0;
let nextDockViewportId = 0;
const attachmentId = () => `topic-media-${Date.now()}-${nextAttachmentId++}`;
type FormatTool = { label: string; name: 'bold' | 'list'; value?: string; icon: string };
// Italic and numbered lists are intentionally unsupported in the topic editor.
const FORMAT_TOOLS: FormatTool[] = [
  { label: '加粗', name: 'bold', icon: BoldIcon },
  { label: '无序列表', name: 'list', value: 'bullet', icon: ListIcon },
];

export default function TopicEditor({ value, document, placeholder, inputRef, disabled, onClear, attachments, onAttachmentsChange, onChange }: Props) {
  const { theme } = useTheme();
  const scrollViewType = usePageScrollViewType();
  const [panel, setPanel] = useState<'emoji' | 'more' | null>(null);
  const [tab, setTab] = useState<'common' | 'emoji' | 'sticker'>('common');
  const [common, setCommon] = useState(getCommonEmojiUsage);
  const [formatStatus, setFormatStatus] = useState<TopicFormatStatus>(EMPTY_FORMAT_STATUS);
  const formatActive = (name: FormatTool['name'], value?: string) => formatStatus.available
    && (name === 'list' ? formatStatus.list === value : formatStatus[name]);
  const formatStatusRef = useRef(formatStatus); formatStatusRef.current = formatStatus;
  const [focused, setFocused] = useState(false);
  // Textarea focus requests are not evidence of native Editor focus. Only the
  // body's real focus/blur events control the toolbar's visibility.
  const [bodyFocused, setBodyFocused] = useState(false);
  const bodyFocusedRef = useRef(false);
  const [toolsHidden, setToolsHidden] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const lastKeyboardHeight = useRef(300);
  const nativeKeyboardHeight = useRef(0);
  // The body owns its own scroll viewport so a long draft no longer scrolls the
  // whole page. Measure the viewport/content to render a persistent scrollbar;
  // the native scrollbar is an overlay that fades on iOS and reads as absent.
  const [bodyScrollView, setBodyScrollView] = useState(0);
  const [bodyScrollContent, setBodyScrollContent] = useState(0);
  const [bodyScrollTop, setBodyScrollTop] = useState(0);
  // The body grows to the space left below it, so the page itself stays fixed.
  const [bodyTop, setBodyTop] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const bodyScrollTopRef = useRef(0);
  const bodyMeasureTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bodyScrollbarTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const measureBodyScroll = () => {
    Taro.createSelectorQuery()
      .select('.topicEditorBody').boundingClientRect()
      .select('.topicEditorBodyScroll').boundingClientRect()
      .select('.topicEditorBodyContent').boundingClientRect()
      .select('.topicEditorDock').boundingClientRect()
      .exec(result => {
        if (!active.current || !pageVisible.current) return;
        const top = Number(result?.[0]?.top);
        if (Number.isFinite(top)) setBodyTop(previous => Math.abs(previous - top) < 0.5 ? previous : top);
        const dock = Number(result?.[3]?.height);
        const measuredDock = Number.isFinite(dock) && dock > 0 ? dock : 0;
        setDockHeight(previous => Math.abs(previous - measuredDock) < 0.5 ? previous : measuredDock);
        const view = Number(result?.[1]?.height);
        const content = Number(result?.[2]?.height);
        if (!Number.isFinite(view) || !Number.isFinite(content) || view <= 0) return;
        setBodyScrollView(previous => Math.abs(previous - view) < 0.5 ? previous : view);
        setBodyScrollContent(previous => Math.abs(previous - content) < 0.5 ? previous : content);
      });
  };
  const scheduleBodyMeasure = () => {
    clearTimeout(bodyMeasureTimer.current);
    bodyMeasureTimer.current = setTimeout(measureBodyScroll, 200);
  };
  const handleBodyScroll = (event: { detail?: { scrollTop?: number } }) => {
    const top = Number(event?.detail?.scrollTop);
    if (!Number.isFinite(top)) return;
    bodyScrollTopRef.current = top;
    if (bodyScrollbarTimer.current) return;
    bodyScrollbarTimer.current = setTimeout(() => {
      bodyScrollbarTimer.current = undefined;
      const next = bodyScrollTopRef.current;
      setBodyScrollTop(previous => Math.abs(previous - next) < 0.5 ? previous : next);
    }, 60);
  };
  const pageVisible = useRef(true);
  const viewportProbeId = useRef(`topic-dock-viewport-${++nextDockViewportId}`);
  const viewportRequest = useRef(0);
  const measuredViewport = useRef<{ width: number; baselineHeight: number; baselineBottom?: number }>({ width: 0, baselineHeight: 0 });
  const [viewport, setViewport] = useState<{ baselineHeight: number; viewportHeight: number; baselineBottom?: number; viewportBottom?: number }>({ baselineHeight: 0, viewportHeight: 0 });
  const awaitingKeyboard = useRef(false);
  const panelOpen = useRef(false);
  const windowInfo = Taro.getWindowInfo();
  const safeBottom = windowInfo.safeArea ? Math.max(0, windowInfo.screenHeight - windowInfo.safeArea.bottom) : 0;
  const updateKeyboardHeight = (height: number) => {
    if (!Number.isFinite(height)) return;
    const nextHeight = Math.min(Math.max(0, height), windowInfo.windowHeight);
    nativeKeyboardHeight.current = nextHeight;
    if (nextHeight > 0) {
      lastKeyboardHeight.current = nextHeight;
      tryHideKeyboardAccessoryView();
    }
    measureViewport();
    scheduleBodyMeasure();
    if (panelOpen.current || (awaitingKeyboard.current && nextHeight === 0)) return;
    awaitingKeyboard.current = false;
    setKeyboardHeight(nextHeight);
  };
  const dockVisible = bodyFocused && !disabled && !toolsHidden;
  const panelVisible = !!panel && !disabled && !toolsHidden;
  const overlayVisible = dockVisible || panelVisible;
  const inputHeight = panel ? lastKeyboardHeight.current : keyboardHeight;
  // The fixed sheet and the panel occupy siblings, exactly like CommentComposer.
  // Measure remaining body space once per layout/keyboard event, never poll.
  const viewportBottom = viewport.viewportBottom ?? viewport.viewportHeight;
  const viewportInset = resolveViewportInset(viewport);
  const bodyReserved = (dockVisible ? dockHeight : 0) + (overlayVisible ? inputHeight : 0);
  const bodyAvailable = viewportBottom > 0
    ? Math.max(0, Math.round(viewportBottom + viewportInset - bodyTop - bodyReserved))
    : 0;
  const editor = useRef<RichBodyHandle>(null);
  const currentAttachments = useRef(attachments);
  currentAttachments.current = attachments;
  const active = useRef(true);
  const selecting = useRef(false);
  const account = useRef(getCachedUsername());
  const jobs = useRef(new Map<string, ReturnType<typeof createImageUploadController>>());
  const insertionJobs = useRef(new Map<string, Promise<ImageInsertionResult>>());
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const runFormat = ({ name, value: formatValue }: FormatTool) => {
    const status = formatStatusRef.current;
    if (disabledRef.current || !active.current || !pageVisible.current || !bodyFocusedRef.current || !status.available || !editor.current) return;
    // A single native tap formats the current selection. Do not rewrite contents,
    // hide/reopen the keyboard, or emulate textarea-only focus/holdKeyboard props.
    editor.current.format(name, name === 'list' && status.list === formatValue ? '' : formatValue);
  };
  const measureViewport = () => {
    const request = ++viewportRequest.current;
    Taro.nextTick(() => {
      if (!active.current || !pageVisible.current || request !== viewportRequest.current) return;
      Taro.createSelectorQuery().select(`#${viewportProbeId.current}`).boundingClientRect(rect => {
        if (!active.current || !pageVisible.current || request !== viewportRequest.current || !rect || Array.isArray(rect)
          || !Number.isFinite(rect.height) || rect.height <= 0 || !Number.isFinite(rect.width) || rect.width <= 0) return;
        const measured = measuredViewport.current;
        if (measured.width !== rect.width) {
          measured.width = rect.width; measured.baselineHeight = 0; measured.baselineBottom = undefined;
        }
        const bottom = Number.isFinite(rect.bottom) && Number.isFinite(rect.top) && Math.abs(rect.bottom - rect.top - rect.height) <= 1 ? rect.bottom : undefined;
        if (nativeKeyboardHeight.current === 0 && !awaitingKeyboard.current && !panelOpen.current) {
          measured.baselineHeight = Math.max(measured.baselineHeight, rect.height);
          if (bottom !== undefined) measured.baselineBottom = Math.max(measured.baselineBottom ?? bottom, bottom);
        }
        const next = { baselineHeight: measured.baselineHeight, viewportHeight: rect.height, baselineBottom: measured.baselineBottom, viewportBottom: bottom };
        setViewport(current => current.baselineHeight === next.baselineHeight && current.viewportHeight === next.viewportHeight
          && current.baselineBottom === next.baselineBottom && current.viewportBottom === next.viewportBottom ? current : next);
      }).exec();
    });
  };
  useDidHide(() => {
    pageVisible.current = false;
    viewportRequest.current++;
    nativeKeyboardHeight.current = 0;
    awaitingKeyboard.current = false;
    panelOpen.current = false;
    bodyFocusedRef.current = false; setBodyFocused(false);
    setKeyboardHeight(0); setPanel(null); setFocused(false);
    clearTimeout(bodyMeasureTimer.current); bodyMeasureTimer.current = undefined;
    clearTimeout(bodyScrollbarTimer.current); bodyScrollbarTimer.current = undefined;
  });
  useDidShow(() => {
    pageVisible.current = true;
    setToolsHidden(false);
    measureViewport();
    measureBodyScroll();
  });
  useReady(() => { measureViewport(); measureBodyScroll(); });
  useEffect(() => { scheduleBodyMeasure(); }, [value, dockVisible, panel, attachments.length, keyboardHeight]);
  useEffect(() => { scheduleBodyMeasure(); }, [bodyAvailable]);

  const update = (change: (current: TopicAttachment[]) => TopicAttachment[]) => {
    currentAttachments.current = change(currentAttachments.current);
    onAttachmentsChange(change);
  };
  const showKeyboard = (notify = false) => {
    const canFocus = editor.current?.canFocus?.() ?? false;
    if (panelOpen.current && canFocus) {
      awaitingKeyboard.current = true;
      setKeyboardHeight(lastKeyboardHeight.current);
    } else if (!canFocus) {
      awaitingKeyboard.current = false;
      setKeyboardHeight(nativeKeyboardHeight.current);
      if (notify) Taro.showToast({ title: '请点击正文唤起键盘', icon: 'none' });
    }
    panelOpen.current = false;
    setToolsHidden(false);
    setPanel(null);
    setFocused(canFocus);
    measureViewport();
  };
  useImperativeHandle(inputRef, () => ({
    focus: () => showKeyboard(true),
    dismissTools: () => {
      panelOpen.current = false; awaitingKeyboard.current = false;
      setFocused(false); setPanel(null); setToolsHidden(true);
      viewportRequest.current++;
    },
    insertText: (text: string) => editor.current?.insertText(text),
    snapshot: () => editor.current?.snapshot() ?? Promise.reject(new Error('Editor unavailable')),
  }));
  useEffect(() => {
    active.current = true;
    if (currentAttachments.current.some(item => item.kind === 'photo' && item.phase !== 'complete' && item.phase !== 'failed')) {
      update(current => restoreTopicAttachments(current));
    }
    const keyboardListener = (event: { height: number }) => { if (active.current && pageVisible.current) updateKeyboardHeight(event.height); };
    const resizeListener = () => {
      if (!active.current || !pageVisible.current) return;
      measureViewport(); scheduleBodyMeasure();
    };
    Taro.onKeyboardHeightChange?.(keyboardListener);
    Taro.onWindowResize?.(resizeListener);
    measureViewport();
    return () => {
      active.current = false;
      viewportRequest.current++;
      clearTimeout(bodyMeasureTimer.current); bodyMeasureTimer.current = undefined;
      clearTimeout(bodyScrollbarTimer.current); bodyScrollbarTimer.current = undefined;
      Taro.offKeyboardHeightChange?.(keyboardListener);
      Taro.offWindowResize?.(resizeListener);
      jobs.current.forEach(job => job.abort());
      jobs.current.clear();
    };
  }, []);

  const runUpload = async (photo: Photo) => {
    if (jobs.current.has(photo.id) || disabled) return;
    if (photo.owner !== getCachedUsername()) {
      Taro.showToast({ title: '图片所属账号已变化，请移除后重新上传', icon: 'none' });
      return;
    }
    const controller = createImageUploadController();
    jobs.current.set(photo.id, controller);
    const current = () => active.current && account.current === getCachedUsername()
      && jobs.current.get(photo.id) === controller && currentAttachments.current.some(item => item.id === photo.id);
    const patch = (changes: Partial<Photo>) => {
      if (current()) update(items => items.map(item => item.id === photo.id && item.kind === 'photo' ? { ...item, ...changes } : item));
    };
    patch({ phase: 'preparing', progress: null, error: undefined });
    try {
      if (!await ensureImageHostBound(current)) {
        patch({ phase: 'failed', progress: null, error: '请检查图床设置后点击重试' });
        return;
      }
      let path = photo.path;
      if (!photo.compressed && !photo.uploadId && isImageCompressionEnabled()) {
        path = await compressCommentPhoto(path);
        patch({ path, compressed: true });
      }
      if (!current()) return;
      const result = await uploadImage({
        filePath: path, uploadId: photo.uploadId, signal: controller.signal,
        onUploadId: uploadId => patch({ uploadId }),
        onProgress: progress => patch({ phase: progress.phase, progress: progress.progress }),
      });
      patch({ phase: 'complete', progress: 100, url: result.url, uploadId: result.id, path });
      // Completed uploads remain independent attachments; never mutate the body.
    } catch (error) {
      patch({ phase: 'failed', progress: null, error: error instanceof Error ? error.message : '上传失败，点击重试' });
      if (current() && error instanceof ImageUploadError && (error.code === 'not_bound' || error.code === 'invalid_token')) void openImageHostSettings();
    } finally {
      if (jobs.current.get(photo.id) === controller) jobs.current.delete(photo.id);
    }
  };

  const choosePhoto = async (source: 'camera' | 'album') => {
    if (disabledRef.current || !active.current || !pageVisible.current || selecting.current) return;
    const remaining = MAX_COMMENT_ATTACHMENTS - currentAttachments.current.length;
    if (remaining <= 0) { Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' }); return; }
    selecting.current = true;
    try {
      if (!await ensureImageHostBound(() => active.current && account.current === getCachedUsername())) return;
      const selected = await Taro.chooseMedia({ count: source === 'camera' ? 1 : remaining, mediaType: ['image'], sourceType: [source], sizeType: ['original'] });
      if (!active.current || account.current !== getCachedUsername()) return;
      const available = Math.max(0, MAX_COMMENT_ATTACHMENTS - currentAttachments.current.length);
      const photos: Photo[] = selected.tempFiles.filter(file => !!file.tempFilePath).slice(0, available).map(file => ({
        id: attachmentId(), kind: 'photo', path: file.tempFilePath, owner: account.current,
        phase: 'preparing', progress: null,
      }));
      if (selected.tempFiles.length > available) Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' });
      update(items => [...items, ...photos]);
      for (const photo of photos) {
        if (!active.current || account.current !== getCachedUsername()) break;
        await runUpload(photo);
      }
    } catch (error) {
      if (active.current && !/cancel/i.test((error as { errMsg?: string })?.errMsg ?? '')) {
        Taro.showToast({ title: source === 'camera' ? '无法打开相机，请检查权限' : '无法选择照片，请检查权限', icon: 'none' });
      }
    } finally { selecting.current = false; }
  };

  const insertAttachment = async (id: string): Promise<ImageInsertionResult> => {
    const existing = insertionJobs.current.get(id);
    if (existing) return existing;
    const current = () => active.current && account.current === getCachedUsername() && currentAttachments.current.some(item => item.id === id);
    const item = currentAttachments.current.find(attachment => attachment.id === id);
    if (!item || !current()) return 'cancelled';
    if (item.richManaged) return 'inserted';
    const patch = (changes: { richManaged?: boolean; insertionState?: TopicAttachment['insertionState'] }) => {
      if (current()) update(items => items.map(attachment => attachment.id === id ? { ...attachment, ...changes } : attachment));
    };
    if (item.kind === 'photo' && (item.phase !== 'complete' || !item.url || item.owner !== getCachedUsername())) return 'retry';
    if (disabledRef.current || !pageVisible.current) {
      if (item.insertionState !== 'uncertain') patch({ insertionState: 'failed' });
      return 'retry';
    }
    const task = (async (): Promise<ImageInsertionResult> => {
      // Legacy interrupted inline insertion can only be inspected, never repeated.
      let result: ImageInsertionResult;
      try { result = await editor.current?.confirmImage(id) ? 'inserted' : 'uncertain'; }
      catch { result = 'uncertain'; }
      if (result === 'inserted') patch({ richManaged: true, insertionState: undefined });
      else patch({ insertionState: 'uncertain' });
      if (current() && result !== 'inserted') Taro.showToast({ title: '旧图片插入状态待确认，请检查正文或移除附件', icon: 'none' });
      return result;
    })();
    insertionJobs.current.set(id, task);
    try { return await task; } finally { if (insertionJobs.current.get(id) === task) insertionJobs.current.delete(id); }
  };
  const openAttachment = (id: string) => {
    const item = currentAttachments.current.find(attachment => attachment.id === id);
    if (!item || disabledRef.current || !active.current || !pageVisible.current || account.current !== getCachedUsername()) return;
    if (item.kind === 'photo' && item.owner !== getCachedUsername()) return;
    if (item.kind === 'photo' && item.phase === 'failed') { void runUpload(item); return; }
    if (item.insertionState) { void insertAttachment(id); return; }
    // A completed thumbnail is deliberately inert: no implicit body insertion.
  };
  const remove = async (id: string) => {
    if (disabledRef.current || !active.current || !pageVisible.current || account.current !== getCachedUsername()) return;
    if (insertionJobs.current.has(id)) { Taro.showToast({ title: '图片正在插入正文，请稍候', icon: 'none' }); return; }
    if (currentAttachments.current.some(item => item.id === id && (item.richManaged || item.insertionState))) {
      try {
        const snapshot = await editor.current?.snapshot();
        if (!snapshot) throw new Error('Editor unavailable');
        // A source roundtrip may retain the image URL but lose its native attachment tag.
        const item = currentAttachments.current.find(candidate => candidate.id === id);
        const src = item?.kind === 'photo' ? item.url : item?.sticker.url;
        const encodedSrc = src?.replace(/\(/g, '%28').replace(/\)/g, '%29');
        const urlReferenced = src && (snapshot.document
          ? snapshot.document.delta.ops.some(op => typeof op.insert === 'object' && (op.insert.image === src || op.insert.image === encodedSrc))
          : snapshot.markdown.includes(src) || !!encodedSrc && snapshot.markdown.includes(encodedSrc));
        if (snapshot.referencedAttachmentIds?.includes(id) || urlReferenced) {
          Taro.showToast({ title: '已插入正文，请在正文中删除图片', icon: 'none' }); return;
        }
      } catch { Taro.showToast({ title: '正文读取失败，请重试后移除附件', icon: 'none' }); return; }
      if (!active.current || account.current !== getCachedUsername()) return;
    }
    jobs.current.get(id)?.abort();
    jobs.current.delete(id);
    update(items => items.filter(item => item.id !== id));
  };
  const addSticker = (sticker: Sticker) => {
    if (disabledRef.current || !active.current || !pageVisible.current || account.current !== getCachedUsername()) return;
    if (currentAttachments.current.length >= MAX_COMMENT_ATTACHMENTS) { Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' }); return; }
    const selected: TopicAttachment = { id: attachmentId(), kind: 'sticker', sticker };
    update(items => [...items, selected]);
    recordCommentEmojiUsage('', [sticker]);
    setCommon(getCommonEmojiUsage());
    // Stickers share the independent attachment tray, not the native Delta.
  };
  const handleBodyChange = (markdown: string, nextDocument?: TopicDocument) => {
    onChange(markdown, nextDocument);
    if (account.current !== getCachedUsername()) return;
    const items = currentAttachments.current;
    const serialized = nextDocument ? serializeTopicDocument(nextDocument.delta, { attachments: items, username: getCachedUsername() }) : undefined;
    if (serialized?.errors.length || serialized?.unsupported.length) return;
    const references = new Set(serialized?.referencedAttachmentIds);
    const imageUrls = nextDocument?.delta.ops.flatMap(op => typeof op.insert === 'object' ? [op.insert.image] : []);
    const deleted = new Set(items.filter(item => {
      if (!item.richManaged || item.insertionState || references.has(item.id)) return false;
      const url = item.kind === 'photo' ? item.url : item.sticker.url;
      if (!url) return false;
      const encoded = url.replace(/\(/g, '%28').replace(/\)/g, '%29');
      return imageUrls ? !imageUrls.some(src => src === url || src === encoded) : !markdown.includes(url) && !markdown.includes(encoded);
    }).map(item => item.id));
    if (deleted.size) update(current => current.filter(item => !deleted.has(item.id)));
  };
  const togglePanel = (next: 'emoji' | 'more') => {
    if (disabled) return;
    if (panel === next) { showKeyboard(true); return; }
    if (next === 'emoji') setCommon(getCommonEmojiUsage());
    setFocused(false);
    awaitingKeyboard.current = false;
    const wasOpen = panelOpen.current;
    panelOpen.current = true;
    setPanel(next);
    if (!wasOpen) void Taro.hideKeyboard();
  };
  const emojis = tab === 'common' ? common.emojis : EMOJIS;
  const stickers = tab === 'common' ? common.stickers : STICKERS;
  const failedPhoto = attachments.find((item): item is Photo => item.kind === 'photo' && item.phase === 'failed');
  const previews = attachments.filter(item => !item.richManaged);
  const failedInsertion = previews.some(item => item.insertionState === 'failed' || item.insertionState === 'uncertain');
  const overlayStyle = { width: `${windowInfo.windowWidth}px`, height: `${windowInfo.windowHeight}px`, bottom: `${-viewportInset}px`, ...themeVariables(theme) };
  const dockStyle = { bottom: `${inputHeight}px`, paddingBottom: inputHeight > 0 ? '0px' : `${safeBottom}px`, maxHeight: `${Math.max(0, windowInfo.windowHeight - inputHeight)}px` };
  const resumeLabel = editor.current?.canFocus?.() ? '切换到键盘' : '收起面板';
  const nativeControls = process.env.TARO_ENV === 'weapp';
  const palette = THEME_PALETTES[theme];
  const toolbarControl = (label: string, icon: string, selected: boolean, unavailable: boolean, action: () => void, secondary = false) => {
    const tone = selected ? 'accent' : secondary ? 'secondary' : 'primary';
    const className = `topicEditorTool${selected ? ' topicEditorTool--active' : ''}${unavailable && !nativeControls ? ' topicEditorTool--disabled' : ''}`;
    return nativeControls
      ? <View key={label} className={className}><topic-format-button icon={svgIconSource(icon, selected ? palette['accent-primary'] : secondary ? palette['text-secondary'] : palette['text-primary'])}
          label={label} disabled={unavailable} active={selected} background={palette['brand-soft']} onFormatend={action} /></View>
      : <View key={label} className={className} ariaRole='button' ariaLabel={label} onClick={action}>
          <View className='topicEditorToolGlyph'><ThemedIcon src={icon} tone={tone} className='topicEditorToolIcon' /></View>
        </View>;
  };
  const attachmentControl = (item: TopicAttachment) => {
    const uploading = item.kind === 'photo' && item.phase !== 'complete';
    const failedUpload = uploading && item.phase === 'failed';
    const inserting = insertionJobs.current.has(item.id);
    const unavailable = disabled || uploading && !failedUpload || inserting;
    const caption = uploading
      ? failedUpload ? '点击重试' : item.phase === 'preparing' ? '处理中' : item.phase === 'processing' ? '服务器处理中' : item.progress === null ? '上传中' : `${item.progress}%`
      : item.insertionState === 'uncertain' ? '检查插入状态' : item.insertionState === 'failed' ? '检查旧图片' : inserting ? '检查旧图片' : '';
    return <topic-format-button icon={item.kind === 'photo' ? item.url || item.path : item.sticker.url}
      label={uploading ? item.error || '图片上传中' : item.insertionState ? '检查图片插入状态' : '图片附件'}
      disabled={unavailable} active={false} background='transparent' thumbnail caption={caption} loading={uploading && !failedUpload || inserting}
      onFormatend={() => {
        if (disabledRef.current || !active.current || !pageVisible.current || account.current !== getCachedUsername()) return;
        if (failedUpload && item.kind === 'photo') void runUpload(item);
        else if (!unavailable) openAttachment(item.id);
      }} />;
  };
  const bodyOverflow = bodyScrollContent - bodyScrollView;
  const bodyScrollbarVisible = bodyScrollView > 0 && bodyOverflow > 2;
  const bodyThumbHeight = bodyScrollbarVisible
    ? Math.min(bodyScrollView, Math.max(48, bodyScrollView * bodyScrollView / bodyScrollContent))
    : 0;
  const bodyThumbTrack = Math.max(0, bodyScrollView - bodyThumbHeight);
  const bodyThumbTop = bodyScrollbarVisible
    ? Math.max(0, Math.min(bodyThumbTrack, bodyScrollTop / bodyOverflow * bodyThumbTrack))
    : 0;

  return <View className='topicEditor'>
    <View className='topicAttachmentRegion' style={{ height: previews.length ? '166rpx' : '0rpx' }}>
      {previews.length > 0 && <ScrollView type={scrollViewType} scrollX scrollWithAnimation
        scrollIntoView={`topic-preview-${previews[previews.length - 1].id}`} className='topicAttachmentScroll' {...{ 'keyboard-dismiss-mode': 'none' }}
      >
        <View className='topicAttachmentTrack' style={{ width: previews.length * 144 + 'rpx' }}>
          {previews.map(item => <View className='topicAttachment' id={`topic-preview-${item.id}`} key={item.id}>
            {nativeControls ? attachmentControl(item) : <>
            <Image src={item.kind === 'photo' ? item.url || item.path : item.sticker.url} mode='aspectFit' className='topicAttachmentImage' onClick={() => openAttachment(item.id)} />
            {item.kind === 'photo' && item.phase !== 'complete' && <View className={`topicUploadOverlay${item.phase === 'failed' ? ' topicUploadOverlay--failed' : ''}`}
              ariaRole='button' ariaLabel={item.error || '图片上传中'} onClick={() => { if (item.phase === 'failed') void runUpload(item); }}
            >
              {item.phase !== 'failed' && <View className='topicUploadSpinner' />}
              <Text className='topicUploadText'>{item.phase === 'failed' ? '点击重试' : item.phase === 'preparing' ? '处理中' : item.phase === 'processing' ? '服务器处理中' : item.progress === null ? '上传中' : `${item.progress}%`}</Text>
            </View>}
            {item.insertionState && (item.kind !== 'photo' || item.phase === 'complete') && <View className={`topicUploadOverlay${item.insertionState === 'pending' ? '' : ' topicUploadOverlay--failed'}`}
              ariaRole='button' ariaLabel='检查图片插入状态' onClick={() => openAttachment(item.id)}
            >
                            <Text className='topicUploadText'>检查旧图片插入状态</Text>
            </View>}
            </>}
            <View className='topicAttachmentRemove' ariaRole='button' ariaLabel='移除附件' onClick={() => { void remove(item.id); }}><Text>×</Text></View>
          </View>)}
        </View>
      </ScrollView>}
    </View>
    {failedPhoto && <Text className='topicUploadError'>{failedPhoto.error || '图片上传失败，点击图片重试或移除'}</Text>}
    {previews.length > 0 && <Text className='topicUploadHint'>{failedInsertion ? '旧图片插入状态待确认，请检查正文或移除附件' : '图片作为独立附件发布'}</Text>}
    <View className='topicEditorBody'>
      <ScrollView type={scrollViewType} scrollY enhanced showScrollbar={false} className='topicEditorBodyScroll'
        style={viewportBottom > 0 ? { height: `${bodyAvailable}px` } : undefined} onScroll={handleBodyScroll}
        {...{ 'keyboard-dismiss-mode': 'none' }}
      >
        <View className='topicEditorBodyContent'>
          <RichTopicBody handleRef={editor} value={value} document={document} attachments={attachments} placeholder={placeholder}
            disabled={disabled} focus={focused && !panel} onChange={handleBodyChange}
            onFormatStatusChange={setFormatStatus}
            onFocus={() => { bodyFocusedRef.current = true; setBodyFocused(true); setToolsHidden(false); setFocused(true); panelOpen.current = false; setPanel(null); measureViewport(); scheduleBodyMeasure(); }}
            onTouchStart={() => showKeyboard()}
            onBlur={() => { bodyFocusedRef.current = false; setBodyFocused(false); setFocused(false); }}
          />
        </View>
      </ScrollView>
      {bodyScrollbarVisible && <View className='topicEditorBodyScrollbar'>
        <View className='topicEditorBodyScrollThumb' style={{ height: `${bodyThumbHeight}px`, transform: `translateY(${bodyThumbTop}px)` }} />
      </View>}
    </View>
    {/* Native editor focus can pan the page; keep the dock outside its scroll ancestors. */}
    <RootPortal>
    <View id={viewportProbeId.current} className='topicEditorViewportProbe' />
    {overlayVisible && <View className='topicEditorDockHost' style={overlayStyle}>
    {dockVisible && <View className='topicEditorDock' style={dockStyle}>
    <View className='topicEditorToolbar'>
      {FORMAT_TOOLS.map(tool => toolbarControl(tool.label, tool.icon, !!formatActive(tool.name, tool.value), disabled || !formatStatus.available, () => runFormat(tool)))}
      {toolbarControl('选择照片', PhotoIcon, false, disabled, () => { void choosePhoto('album'); })}
      {toolbarControl(panel === 'emoji' ? resumeLabel : '表情', panel === 'emoji' ? KeyboardIcon : EmojiIcon, panel === 'emoji', disabled, () => togglePanel('emoji'), true)}
      {toolbarControl(panel === 'more' ? resumeLabel : '更多功能', panel === 'more' ? KeyboardIcon : AddIcon, panel === 'more', disabled, () => togglePanel('more'), true)}
    </View>
    </View>}
    {panelVisible && <View className='topicEditorPanelRegion' style={{ height: `${inputHeight}px`, paddingBottom: `${safeBottom}px` }}>
      {!dockVisible && <View className='topicEditorPanelHeader'>
        <View className='topicEditorPanelAction' ariaRole='button' ariaLabel='表情' onClick={() => { if (panel !== 'emoji') togglePanel('emoji'); }}><Text>表情</Text></View>
        <View className='topicEditorPanelAction' ariaRole='button' ariaLabel='更多功能' onClick={() => { if (panel !== 'more') togglePanel('more'); }}><Text>更多</Text></View>
        <View className='topicEditorPanelAction' ariaRole='button' ariaLabel={resumeLabel} onClick={() => showKeyboard(true)}><Text>{resumeLabel}</Text></View>
      </View>}
      {panel === 'emoji' && <View className='topicEditorPanel'>
        <View className='topicEditorTabs'>{(['common', 'emoji', 'sticker'] as const).map((item, index) => <View key={item} className={`topicEditorTab${tab === item ? ' topicEditorTab--active' : ''}`} ariaRole='button' onClick={() => setTab(item)}><Text>{['常用', '表情', '过早客'][index]}</Text></View>)}</View>
        <ScrollView type={scrollViewType} scrollY className='topicEditorPanelScroll' {...{ 'keyboard-dismiss-mode': 'none' }}>
          {tab === 'common' && <Text className='topicCommonHeading'>Emoji</Text>}
          {tab === 'common' && emojis.length === 0 && <Text className='topicCommonEmpty'>选择后，常用 Emoji 会显示在这里</Text>}
          {tab !== 'sticker' && Array.from({ length: Math.ceil(emojis.length / 8) }, (_, row) => <View className='topicPanelRow' key={`emoji-${row}`}>
            {emojis.slice(row * 8, row * 8 + 8).map(emoji => <View className='topicPanelEmoji' key={emoji} ariaRole='button' ariaLabel={`插入表情${emoji}`} onClick={() => { if (!disabled) { editor.current?.insertText(emoji); recordCommentEmojiUsage(emoji, []); setCommon(getCommonEmojiUsage()); } }}><Text>{emoji}</Text></View>)}
          </View>)}
          {tab === 'common' && <Text className='topicCommonHeading'>自定义表情</Text>}
          {tab === 'common' && stickers.length === 0 && <Text className='topicCommonEmpty'>选择后，常用自定义表情会显示在这里</Text>}
          {tab !== 'emoji' && Array.from({ length: Math.ceil(stickers.length / 5) }, (_, row) => <View className='topicPanelRow' key={`sticker-${row}`}>
            {stickers.slice(row * 5, row * 5 + 5).map(sticker => <View className='topicPanelSticker' key={sticker.filename} ariaRole='button' ariaLabel={`添加表情包${sticker.name}`} onClick={() => addSticker(sticker)}><Image lazyLoad src={sticker.url} mode='aspectFit' className='topicPanelStickerImage' /></View>)}
          </View>)}
        </ScrollView>
      </View>}
      {panel === 'more' && <View className='topicEditorPanel'><View className='topicMoreActions'>
        <View className='topicMoreAction' ariaRole='button' ariaLabel='拍照' onClick={() => choosePhoto('camera')}><View className='topicMoreSquare'><ThemedIcon src={CameraIcon} tone='secondary' className='topicMoreIcon' /></View><Text>拍照</Text></View>
        <View className='topicMoreAction' ariaRole='button' ariaLabel='照片' onClick={() => choosePhoto('album')}><View className='topicMoreSquare'><ThemedIcon src={PhotoIcon} tone='secondary' className='topicMoreIcon' /></View><Text>照片</Text></View>
        <View className='topicMoreAction' ariaRole='button' ariaLabel='收藏' onClick={() => { if (!disabled) Taro.showToast({ title: '开发中', icon: 'none' }); }}><View className='topicMoreSquare'><ThemedIcon src={FavoriteIcon} tone='secondary' className='topicMoreIcon' /></View><Text>收藏</Text></View>
        <View className='topicMoreAction' ariaRole='button' ariaLabel='提及用户' onClick={() => { if (!disabled) { showKeyboard(); editor.current?.openMentions(); } }}><View className='topicMoreSquare'><ThemedIcon src={MentionIcon} tone='secondary' className='topicMoreIcon' /></View><Text>提及用户</Text></View>
        <View className='topicMoreAction' ariaRole='button' ariaLabel='恢复正文格式' onClick={() => { if (!disabled) { showKeyboard(); editor.current?.format('header', ''); } }}><View className='topicMoreSquare'><ThemedIcon src={HeadingIcon} tone='secondary' className='topicMoreIcon' /></View><Text>正文格式</Text></View>
        {onClear && <View className='topicMoreAction' ariaRole='button' ariaLabel='清空草稿' onClick={() => { if (!disabled) onClear(); }}><View className='topicMoreSquare'><ThemedIcon src={TrashIcon} tone='secondary' className='topicMoreIcon' /></View><Text>清空草稿</Text></View>}
      </View></View>}
    </View>}
    </View>}
    </RootPortal>
  </View>;
}
