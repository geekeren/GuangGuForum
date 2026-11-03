import { Image, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { createImageUploadController, ImageUploadError, uploadImage } from 'guanggu-forum-api';
import RichTopicBody, { type RichBodyHandle } from './RichTopicBody';
import type { TopicDocument } from '../../utils/topicDocument';
import ThemedIcon from '../../components/ThemedIcon';
import MentionIcon from '../../assets/composer-mention.svg?raw';
import EmojiIcon from '../../assets/composer-emoji.svg?raw';
import KeyboardIcon from '../../assets/composer-keyboard.svg?raw';
import AddIcon from '../../assets/composer-add.svg?raw';
import CameraIcon from '../../assets/composer-camera.svg?raw';
import PhotoIcon from '../../assets/composer-photo.svg?raw';
import FavoriteIcon from '../../assets/composer-favorite.svg?raw';
import { EMOJIS, getCommonEmojiUsage, recordCommentEmojiUsage } from '../../utils/emojiUsage';
import { MAX_COMMENT_ATTACHMENTS, STICKERS, type Sticker } from '../../utils/stickers';
import { compressCommentPhoto } from '../../utils/commentPhotos';
import { isImageCompressionEnabled } from '../../utils/imageCompressionPreferences';
import { getCachedUsername } from '../../utils/currentUser';
import { getScrollViewType } from '../../utils/renderer';
import { ensureImageHostBound, openImageHostSettings } from '../../utils/imageUploadGuard';
import './TopicEditor.scss';

type Photo = {
  id: string; kind: 'photo'; path: string; owner: string; url?: string; uploadId?: string;
  phase: 'preparing' | 'uploading' | 'processing' | 'complete' | 'failed';
  progress: number | null; compressed?: boolean; error?: string; richManaged?: boolean;
};
export type TopicAttachment = Photo | { id: string; kind: 'sticker'; sticker: Sticker; richManaged?: boolean };

export function restoreTopicAttachments(value: unknown): TopicAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COMMENT_ATTACHMENTS).flatMap((item): TopicAttachment[] => {
    if (!item || typeof item.id !== 'string') return [];
    if (item.kind === 'sticker') {
      const sticker = STICKERS.find(entry => entry.filename === item.sticker?.filename);
      return sticker ? [{ id: item.id, kind: 'sticker', sticker, richManaged: item.richManaged === true }] : [];
    }
    if (item.kind !== 'photo' || typeof item.path !== 'string' || typeof item.owner !== 'string') return [];
    const complete = item.phase === 'complete' && typeof item.url === 'string' && /^https:\/\//.test(item.url);
    return [{
      id: item.id, kind: 'photo', path: item.path, owner: item.owner,
      uploadId: typeof item.uploadId === 'string' ? item.uploadId : undefined,
      url: complete ? item.url : undefined, compressed: item.compressed === true, richManaged: item.richManaged === true,
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
  attachments: TopicAttachment[];
  onAttachmentsChange: (update: (current: TopicAttachment[]) => TopicAttachment[]) => void;
  document?: TopicDocument;
  onChange: (value: string, document?: TopicDocument) => void;
}

let nextAttachmentId = 0;
const attachmentId = () => `topic-media-${Date.now()}-${nextAttachmentId++}`;
// Only bound incomplete native gestures, never delay ordinary editor blur.
const DOCK_GESTURE_TIMEOUT_MS = 5000;
const DOCK_TAP_COMPLETION_MS = 350;

export default function TopicEditor({ value, document, placeholder, inputRef, disabled, attachments, onAttachmentsChange, onChange }: Props) {
  const [panel, setPanel] = useState<'emoji' | 'more' | null>(null);
  const [tab, setTab] = useState<'common' | 'emoji' | 'sticker'>('common');
  const [common, setCommon] = useState(getCommonEmojiUsage);
  const [focused, setFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const awaitingKeyboard = useRef(false);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const updateKeyboardHeight = (height: number) => {
    if (!Number.isFinite(height)) return;
    if (height > 0) setPanelHeight(height);
    if (panelRef.current || (awaitingKeyboard.current && height === 0)) return;
    awaitingKeyboard.current = false;
    setKeyboardHeight(Math.max(0, height));
  };
  const [dockGestureActive, setDockGestureActive] = useState(false);
  const dockGestureTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dockVisible = focused || keyboardHeight > 0 || !!panel || (!disabled && dockGestureActive);
  const [panelHeight, setPanelHeight] = useState(300);
  const editor = useRef<RichBodyHandle>(null);
  const currentAttachments = useRef(attachments);
  currentAttachments.current = attachments;
  const active = useRef(true);
  const selecting = useRef(false);
  const account = useRef(getCachedUsername());
  const jobs = useRef(new Map<string, ReturnType<typeof createImageUploadController>>());
  const releaseDockGesture = () => {
    clearTimeout(dockGestureTimer.current); dockGestureTimer.current = undefined;
    if (active.current) setDockGestureActive(false);
  };
  const armDockGesture = (timeout: number) => {
    clearTimeout(dockGestureTimer.current);
    dockGestureTimer.current = setTimeout(releaseDockGesture, timeout);
  };
  const startDockGesture = () => {
    if (disabled || !active.current) return;
    setDockGestureActive(true); armDockGesture(DOCK_GESTURE_TIMEOUT_MS);
  };
  const endDockGesture = (event: { stopPropagation(): void }) => {
    event.stopPropagation();
    // Native tap follows touchend. Retain the target until that tap, or bounded cancellation.
    if (active.current) armDockGesture(DOCK_TAP_COMPLETION_MS);
  };

  const update = (change: (current: TopicAttachment[]) => TopicAttachment[]) => {
    currentAttachments.current = change(currentAttachments.current);
    onAttachmentsChange(change);
  };
  const showKeyboard = () => {
    if (panelRef.current) { awaitingKeyboard.current = true; setKeyboardHeight(panelHeight); }
    panelRef.current = null;
    setPanel(null); setFocused(true);
  };
  useImperativeHandle(inputRef, () => ({
    focus: showKeyboard,
    insertText: (text: string) => editor.current?.insertText(text),
    snapshot: () => editor.current?.snapshot() ?? Promise.reject(new Error('Editor unavailable')),
  }));
  useEffect(() => {
    active.current = true;
    if (currentAttachments.current.some(item => item.kind === 'photo' && item.phase !== 'complete' && item.phase !== 'failed')) {
      update(current => restoreTopicAttachments(current));
    }
    const keyboardListener = (event: { height: number }) => { if (active.current) updateKeyboardHeight(event.height); };
    Taro.onKeyboardHeightChange?.(keyboardListener);
    return () => {
      active.current = false;
      clearTimeout(dockGestureTimer.current); dockGestureTimer.current = undefined;
      Taro.offKeyboardHeightChange?.(keyboardListener);
      jobs.current.forEach(job => job.abort());
      jobs.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!disabled) return;
    clearTimeout(dockGestureTimer.current); dockGestureTimer.current = undefined;
    setDockGestureActive(false);
  }, [disabled]);

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
    } catch (error) {
      patch({ phase: 'failed', progress: null, error: error instanceof Error ? error.message : '上传失败，点击重试' });
      if (current() && error instanceof ImageUploadError && (error.code === 'not_bound' || error.code === 'invalid_token')) void openImageHostSettings();
    } finally {
      if (jobs.current.get(photo.id) === controller) jobs.current.delete(photo.id);
    }
  };

  const choosePhoto = async (source: 'camera' | 'album') => {
    if (disabled || selecting.current) return;
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

  const insertAttachment = async (item: TopicAttachment) => {
    if (disabled || !active.current || account.current !== getCachedUsername()) return;
    if (item.kind === 'photo' && (item.phase !== 'complete' || !item.url || item.owner !== getCachedUsername())) {
      Taro.showToast({ title: '上传完成后点击插入正文', icon: 'none' }); return;
    }
    const src = item.kind === 'photo' ? item.url! : item.sticker.url;
    const inserted = await editor.current?.insertImage(src, item.id, item.kind === 'photo' ? '图片' : item.sticker.name);
    if (inserted && active.current && account.current === getCachedUsername()) {
      update(items => items.map(current => current.id === item.id ? { ...current, richManaged: true } : current));
    }
  };
  const remove = async (id: string) => {
    if (disabled) return;
    if (currentAttachments.current.some(item => item.id === id && item.richManaged)) {
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
    if (disabled) return;
    if (currentAttachments.current.length >= MAX_COMMENT_ATTACHMENTS) { Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' }); return; }
    const selected: TopicAttachment = { id: attachmentId(), kind: 'sticker', sticker };
    update(items => [...items, selected]);
    recordCommentEmojiUsage('', [sticker]);
    setCommon(getCommonEmojiUsage());
  };
  const togglePanel = (next: 'emoji' | 'more') => {
    if (disabled) return;
    if (panel === next) { showKeyboard(); return; }
    if (next === 'emoji') setCommon(getCommonEmojiUsage());
    setFocused(false);
    awaitingKeyboard.current = false;
    panelRef.current = next;
    setPanel(next);
    void Taro.hideKeyboard();
  };
  const emojis = tab === 'common' ? common.emojis : EMOJIS;
  const stickers = tab === 'common' ? common.stickers : STICKERS;
  const failedPhoto = attachments.find((item): item is Photo => item.kind === 'photo' && item.phase === 'failed');

  return <View className='topicEditor'>
    <View className='topicAttachmentRegion' style={{ height: attachments.length ? '166rpx' : '0rpx' }}>
      {attachments.length > 0 && <ScrollView type={getScrollViewType()} scrollX scrollWithAnimation
        scrollIntoView={`topic-preview-${attachments[attachments.length - 1].id}`} className='topicAttachmentScroll' {...{ 'keyboard-dismiss-mode': 'none' }}
      >
        <View className='topicAttachmentTrack' style={{ width: attachments.length * 144 + 'rpx' }}>
          {attachments.map(item => <View className='topicAttachment' id={`topic-preview-${item.id}`} key={item.id}>
            <Image src={item.kind === 'photo' ? item.url || item.path : item.sticker.url} mode='aspectFit' className='topicAttachmentImage' onClick={() => { void insertAttachment(item); }} />
            {item.kind === 'photo' && item.phase !== 'complete' && <View className={`topicUploadOverlay${item.phase === 'failed' ? ' topicUploadOverlay--failed' : ''}`}
              ariaRole='button' ariaLabel={item.error || '图片上传中'} onClick={() => { if (item.phase === 'failed') void runUpload(item); }}
            >
              {item.phase !== 'failed' && <View className='topicUploadSpinner' />}
              <Text className='topicUploadText'>{item.phase === 'failed' ? '点击重试' : item.phase === 'preparing' ? '处理中' : item.phase === 'processing' ? '服务器处理中' : item.progress === null ? '上传中' : `${item.progress}%`}</Text>
            </View>}
            <View className='topicAttachmentRemove' ariaRole='button' ariaLabel='移除附件' onClick={() => { void remove(item.id); }}><Text>×</Text></View>
          </View>)}
        </View>
      </ScrollView>}
    </View>
    {failedPhoto && <Text className='topicUploadError'>{failedPhoto.error || '图片上传失败，点击图片重试或移除'}</Text>}
    {attachments.length > 0 && <Text className='topicUploadHint'>上传后点击插入正文 · 已插入的图片在正文中删除</Text>}
    <RichTopicBody handleRef={editor} value={value} document={document} attachments={attachments} placeholder={placeholder}
      disabled={disabled} focus={focused && !panel} onChange={onChange}
      onFocus={() => { setFocused(true); panelRef.current = null; setPanel(null); }} onBlur={() => setFocused(false)}
    />
    {dockVisible && <View className='topicEditorDock' style={{ bottom: (panel ? 0 : keyboardHeight) + 'px', paddingBottom: keyboardHeight > 0 && !panel ? '0px' : undefined }}
      onTouchStart={startDockGesture} onTouchEnd={endDockGesture} onTouchMove={releaseDockGesture} onTouchCancel={releaseDockGesture}
      onClick={releaseDockGesture}
    >
    <View className='topicEditorFormats'>
      {[['正文', 'header', ''], ['加粗', 'bold', 'true'], ['标题', 'header', 'h2'], ['列表', 'list', 'bullet'], ['编号', 'list', 'ordered']].map(([label, name, formatValue]) =>
        <View key={label} className='topicFormatTool' ariaRole='button' ariaLabel={label} onClick={() => { if (!disabled) editor.current?.format(name, formatValue); }}><Text>{label}</Text></View>)}
    </View>
    <View className='topicEditorToolbar'>
      <View className='topicEditorTool' ariaRole='button' ariaLabel='提及用户' onClick={() => { if (!disabled) { showKeyboard(); editor.current?.openMentions(); } }}><ThemedIcon src={MentionIcon} tone='secondary' className='topicEditorToolIcon' /></View>
      <View className='topicEditorTool' ariaRole='button' ariaLabel={panel === 'emoji' ? '切换到键盘' : '表情'} onClick={() => togglePanel('emoji')}><ThemedIcon src={panel === 'emoji' ? KeyboardIcon : EmojiIcon} tone={panel === 'emoji' ? 'accent' : 'secondary'} className='topicEditorToolIcon' /></View>
      <View className='topicEditorTool' ariaRole='button' ariaLabel={panel === 'more' ? '切换到键盘' : '更多功能'} onClick={() => togglePanel('more')}><ThemedIcon src={panel === 'more' ? KeyboardIcon : AddIcon} tone={panel === 'more' ? 'accent' : 'secondary'} className='topicEditorToolIcon' /></View>
      <Text className='topicAttachmentCount'>{attachments.length}/{MAX_COMMENT_ATTACHMENTS}</Text>
    </View>
    <View className='topicEditorPanelRegion' style={{ height: panel ? panelHeight + 'px' : '0px' }}>
      {panel === 'emoji' && <View className='topicEditorPanel'>
        <View className='topicEditorTabs'>{(['common', 'emoji', 'sticker'] as const).map((item, index) => <View key={item} className={`topicEditorTab${tab === item ? ' topicEditorTab--active' : ''}`} ariaRole='button' onClick={() => setTab(item)}><Text>{['常用', '表情', '过早客'][index]}</Text></View>)}</View>
        <ScrollView type={getScrollViewType()} scrollY className='topicEditorPanelScroll' {...{ 'keyboard-dismiss-mode': 'none' }}>
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
      </View></View>}
    </View>
    </View>}
  </View>;
}
