import { Image, ScrollView, Text, View } from "@tarojs/components";
import { GzkButton as Button } from "gzk-ui/native-form";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import MentionTextarea, { type MentionEditorHandle } from "../../components/MentionTextarea";
import ThemedIcon from "../../components/ThemedIcon";
import { isSkyline } from "../../utils/renderer";
import { getCommentBody } from "../../utils/mentions";
import type { CommentMentionBinding, CommentMentionTarget } from '../../utils/commentMentionBindings';
import { Mention as MentionIcon } from "gzk-ui/icons";
import { Emoji as EmojiIcon } from "gzk-ui/icons";
import { Keyboard as KeyboardIcon } from "gzk-ui/icons";
import { Collapse as CollapseIcon } from "gzk-ui/icons";
import { Plus as AddIcon } from "gzk-ui/icons";
import { Camera as CameraIcon } from "gzk-ui/icons";
import { Photo as PhotoIcon } from "gzk-ui/icons";
import { Star as FavoriteIcon } from "gzk-ui/icons";
import { MAX_COMMENT_ATTACHMENTS, type Sticker } from "../../utils/stickers";
import { getCommonEmojiUsage, recordCommentEmojiUsage } from "../../utils/emojiUsage";
import ComposerEmojiPanel from '../../components/ComposerEmojiPanel';
import { isImageCompressionEnabled } from "../../utils/imageCompressionPreferences";
import { photoAttachment, stickerAttachment, type CommentAttachment } from "../../utils/commentAttachments";
import { ensureImageHostBound } from '../../utils/imageUploadGuard';

interface Props {
  value: string;
  mentionUsers?: string[];
  mentionAvatars?: Record<string, string>;
  mentionTargets?: CommentMentionTarget[];
  onMentionInsert?: (binding: CommentMentionBinding) => void;
  topicAuthor?: string;
  stickers?: Sticker[];
  onStickersChange?: (stickers: Sticker[]) => void;
  photos?: string[];
  onPhotosChange?: (photos: string[]) => void;
  previewAttachments?: CommentAttachment[];
  onAttachmentsChange?: (attachments: CommentAttachment[]) => void;
  sending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}

export default function CommentComposer({ value, mentionUsers, mentionAvatars, mentionTargets, onMentionInsert, topicAuthor, stickers = [], onStickersChange, photos = [], onPhotosChange, previewAttachments, onAttachmentsChange, sending, onChange, onClose, onSend }: Props) {
  const skyline = isSkyline();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activePanel, setActivePanel] = useState<'emoji' | 'more' | null>(null);
  const showEmojis = activePanel === 'emoji';
  const showMore = activePanel === 'more';
  const panelVisible = activePanel !== null;
  const choosingPhoto = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const previews: CommentAttachment[] = previewAttachments ?? [
    ...stickers.map((sticker, index) => ({ id: `sticker-${index}`, kind: 'sticker' as const, sticker })),
    ...photos.map((path, index) => ({ id: `photo-${index}`, kind: 'photo' as const, path })),
  ];
  const attachments = useRef({ stickers, photos, previews });
  attachments.current = { stickers, photos, previews };
  const [panelTab, setPanelTab] = useState<'common' | 'emoji' | 'sticker'>('common');
  const [commonUsage, setCommonUsage] = useState(getCommonEmojiUsage);
  const panelOpen = useRef(false);
  const lastKeyboardHeight = useRef(300);
  const awaitingKeyboard = useRef(false);
  const editorRef = useRef<MentionEditorHandle>(null);
  const bodyLength = getCommentBody(value).trim().length;
  const previewCount = stickers.length + photos.length;
  const previewHeight = photos.length > 0 ? 200 : stickers.length > 0 ? 156 : 0;
  const canSend = !sending && previews.every(item => item.kind !== 'photo' || item.status === 'complete') && (bodyLength >= 3 || previewCount > 0);
  const windowInfo = skyline ? Taro.getWindowInfo() : undefined;
  const safeBottom = windowInfo?.safeArea
    ? Math.max(0, windowInfo.screenHeight - windowInfo.safeArea.bottom) : 0;

  const updateKeyboardHeight = (height: number) => {
    if (!Number.isFinite(height)) return;
    const nextHeight = Math.min(Math.max(0, height), windowInfo?.windowHeight ?? Number.MAX_SAFE_INTEGER);
    if (nextHeight > 0) lastKeyboardHeight.current = nextHeight;
    if (panelOpen.current) return;
    // A trailing close event from the old keyboard must not collapse the slot
    // while the keyboard is being reopened.
    if (awaitingKeyboard.current && nextHeight === 0) return;
    awaitingKeyboard.current = false;
    setKeyboardHeight(nextHeight);
  };

  // Skyline's fixed overlay needs explicit bounds; only the sheet follows the keyboard.
  const popupStyle = windowInfo ? {
    width: windowInfo.windowWidth + "px",
    height: windowInfo.windowHeight + "px",
  } : undefined;
  const inputHeight = panelVisible ? lastKeyboardHeight.current : keyboardHeight;
  const bodyStyle = windowInfo ? {
    bottom: inputHeight + "px",
    paddingBottom: `calc(24rpx + ${inputHeight > 0 ? 0 : safeBottom}px)`,
    maxHeight: Math.max(0, windowInfo.windowHeight - inputHeight) + "px",
  } : panelVisible ? { bottom: inputHeight + "px" } : undefined;

  const showKeyboard = () => {
    if (panelOpen.current) {
      awaitingKeyboard.current = true;
      setKeyboardHeight(lastKeyboardHeight.current);
    }
    panelOpen.current = false;
    setActivePanel(null);
  };
  const togglePanel = (panel: 'emoji' | 'more') => {
    if (sending) return;
    if (activePanel === panel) {
      showKeyboard();
    } else {
      if (panel === 'emoji') setCommonUsage(getCommonEmojiUsage());
      const wasOpen = panelOpen.current;
      panelOpen.current = true;
      setActivePanel(panel);
      awaitingKeyboard.current = false;
      if (!wasOpen) void Taro.hideKeyboard();
    }
  };

  const choosePhoto = async (source: 'camera' | 'album') => {
    if (sending || choosingPhoto.current) return;
    const remaining = MAX_COMMENT_ATTACHMENTS - attachments.current.stickers.length - attachments.current.photos.length;
    if (remaining <= 0) {
      Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' });
      return;
    }
    choosingPhoto.current = true;
    const compressionEnabled = isImageCompressionEnabled();
    try {
      if (!await ensureImageHostBound(() => mounted.current)) return;
      const result = await Taro.chooseMedia({ count: source === 'camera' ? 1 : remaining, mediaType: ['image'], sourceType: [source], sizeType: ['original'] });
      if (!mounted.current) return;
      const paths = result.tempFiles.map(file => file.tempFilePath).filter(Boolean);
      const current = attachments.current;
      const available = Math.max(0, MAX_COMMENT_ATTACHMENTS - current.stickers.length - current.photos.length);
      if (paths.length > available) Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' });
      if (paths.length && available > 0) {
        const added = paths.slice(0, available);
        const next = [...current.photos, ...added];
        const nextPreviews = [...current.previews, ...added.map(path => photoAttachment(path, compressionEnabled))];
        attachments.current = { ...current, photos: next, previews: nextPreviews };
        if (onAttachmentsChange) onAttachmentsChange(nextPreviews);
        else onPhotosChange?.(next);
      }
    } catch (error) {
      const message = (error as { errMsg?: string })?.errMsg ?? '';
      if (!/cancel/i.test(message)) Taro.showToast({ title: source === 'camera' ? '无法打开相机，请检查权限' : '无法选择照片，请检查权限', icon: 'none' });
    } finally {
      choosingPhoto.current = false;
    }
  };

  const insertEmoji = (emoji: string) => {
    editorRef.current?.insertText(emoji);
    recordCommentEmojiUsage(emoji, []);
    setCommonUsage(getCommonEmojiUsage());
  };
  const selectSticker = (sticker: Sticker) => {
    if (sending) return;
    const current = attachments.current;
    if (current.stickers.length + current.photos.length >= MAX_COMMENT_ATTACHMENTS) {
      Taro.showToast({ title: '图片和表情包最多只能添加5个', icon: 'none' });
      return;
    }
    recordCommentEmojiUsage('', [sticker]);
    setCommonUsage(getCommonEmojiUsage());
    const next = [...current.stickers, sticker];
    const nextPreviews = [...current.previews, stickerAttachment(sticker)];
    attachments.current = { ...current, stickers: next, previews: nextPreviews };
    if (onAttachmentsChange) onAttachmentsChange(nextPreviews);
    else onStickersChange?.(next);
  };

  const removeAttachment = (item: CommentAttachment, index: number) => {
    if (sending) return;
    if (onAttachmentsChange) {
      onAttachmentsChange(previews.filter(entry => entry.id !== item.id));
    } else {
      const groupIndex = previews.slice(0, index).filter(entry => entry.kind === item.kind).length;
      if (item.kind === 'sticker') onStickersChange?.(stickers.filter((_, i) => i !== groupIndex));
      else onPhotosChange?.(photos.filter((_, i) => i !== groupIndex));
    }
  };

  return (
    <View className={`commentPopup commentPopup--visible${skyline ? " commentPopup--skyline" : ""}`} style={popupStyle}>
      <View className='commentPopupMask' onClick={onClose} />
      <View className='commentPopupBody' style={bodyStyle}>
        <View className='commentPopupHandle' />
        <View className='commentPopupAttachmentRegion' style={{ height: previewHeight + 'rpx' }}>
          {previewCount > 0 && <ScrollView type={skyline ? 'custom' : undefined} scrollX scrollIntoView={`comment-preview-${previews[previews.length - 1].id}`} scrollWithAnimation className='commentStickerPreviews' {...{ 'keyboard-dismiss-mode': 'none' }}>
            <View className='commentStickerPreviewTrack' style={{ width: previewCount * 144 + 'rpx' }}>
              {previews.map((item, index) => <View className={`commentStickerPreview${item.kind === 'photo' ? ' commentPopupPhotoPreview' : ''}`} id={`comment-preview-${item.id}`} key={item.id}>
                <Image src={item.kind === 'photo' ? item.path : item.sticker.url} mode='aspectFit' className='commentStickerPreviewImage' />
                {item.kind === 'photo' && item.status !== 'complete' && <View className='commentPhotoUploadOverlay'
                  onClick={() => {
                    if (item.status !== 'failed' || !onAttachmentsChange) return;
                    onAttachmentsChange(previews.map(entry => entry.id === item.id && entry.kind === 'photo' ? { ...entry, status: 'queued', error: undefined } : entry));
                  }}>
                  {item.status !== 'failed' && <View className='commentPhotoUploadSpinner' />}
                  <Text className='commentPhotoUploadLabel'>{item.status === 'failed' ? '失败 · 点击重试'
                    : item.phase === 'uploading' ? '上传中…' : item.phase === 'processing' ? '图床处理中…' : '处理图片…'}</Text>
                </View>}
                <View className='commentStickerRemove' ariaRole='button' ariaLabel={item.kind === 'photo' ? '删除所选照片' : `删除表情包${item.sticker.name}`} onClick={() => removeAttachment(item, index)}><Text>×</Text></View>
              </View>)}
            </View>
          </ScrollView>}
          {photos.length > 0 && <Text className='commentPopupPhotoNotice'>{previews.some(item => item.kind === 'photo' && item.status === 'failed')
            ? '图片上传失败，点击图片重试或移除' : previews.some(item => item.kind === 'photo' && item.status !== 'complete')
              ? '图片正在上传，完成后可发送' : '图片已上传，将随评论发送'}</Text>}
        </View>
        <MentionTextarea
          editorRef={editorRef}
          className='commentPopupTextarea'
          mentionUsers={mentionUsers}
          mentionAvatars={mentionAvatars}
          mentionTargets={mentionTargets}
          onMentionInsert={onMentionInsert}
          topicAuthor={topicAuthor}
          cursorSpacing={skyline ? 0 : 100}
          adjustPosition={!skyline}
          fixed
          focus={!panelVisible}
          holdKeyboard={!panelVisible}
          autoHeight={false}
          maxlength={5000}
          disabled={sending}
          onTouchStart={showKeyboard}
          onFocus={(event) => updateKeyboardHeight(event.detail.height)}
          onKeyboardHeightChange={(event) => updateKeyboardHeight(event.detail.height)}
          onInput={(event) => onChange(event.detail.value)}
          value={value}
          showConfirmBar={false}
          placeholder='说点什么，参与讨论…'
        />
        <View className='commentPopupToolbar'>
          <View className='commentPopupTools'>
            <View className='commentPopupTool commentPopupMention' ariaRole='button' ariaLabel='提及用户' onClick={() => {
              if (sending) return;
              showKeyboard();
              editorRef.current?.openMentions();
            }}>
              <ThemedIcon src={MentionIcon} tone='secondary' className='commentPopupToolIcon' />
            </View>
            <View className={`commentPopupTool commentPopupEmoji${showEmojis ? " commentPopupTool--active" : ""}`} ariaRole='button' ariaLabel={showEmojis ? '切换到键盘' : '更多表情'} onClick={() => togglePanel('emoji')}>
              <ThemedIcon src={showEmojis ? KeyboardIcon : EmojiIcon} tone={showEmojis ? 'accent' : 'secondary'} className='commentPopupToolIcon' />
            </View>
            <View className={`commentPopupTool commentPopupMore${showMore ? " commentPopupTool--active" : ""}`} ariaRole='button' ariaLabel={showMore ? '切换到键盘' : '更多功能'} onClick={() => togglePanel('more')}>
              <ThemedIcon src={showMore ? KeyboardIcon : AddIcon} tone={showMore ? 'accent' : 'secondary'} className='commentPopupToolIcon' />
            </View>
            <View className='commentPopupTool commentPopupCancel' ariaRole='button' ariaLabel='收起评论，保留草稿' onClick={onClose}>
              <ThemedIcon src={CollapseIcon} tone='secondary' className='commentPopupToolIcon' />
            </View>
          </View>
          <View className='commentPopupSubmit'>
            {bodyLength < 3 && previewCount === 0 && <Text className='commentPopupMinimum'>至少3个字</Text>}
            <Button className={`commentPopupSend${canSend ? "" : " commentPopupSend--disabled"}`} disabled={!canSend} loading={sending} onClick={() => { if (canSend) onSend(); }}>
              <Text>{sending ? "发送中" : "发送"}</Text>
            </Button>
          </View>
        </View>
      </View>
      {showMore && <View className='commentPopupEmojiPanel commentPopupMorePanel' style={{ height: inputHeight + 'px', paddingBottom: safeBottom + 'px' }}>
        <ScrollView type={skyline ? 'custom' : undefined} scrollY className='commentPopupPanelScroll' {...{ 'keyboard-dismiss-mode': 'none' }}>
          <View className='commentPopupMoreActions'>
            <View className='commentPopupMoreAction' ariaRole='button' ariaLabel='拍照' onClick={() => choosePhoto('camera')}>
              <View className='commentPopupMoreSquare'><ThemedIcon src={CameraIcon} tone='secondary' className='commentPopupMoreIcon' /></View><Text>拍照</Text>
            </View>
            <View className='commentPopupMoreAction' ariaRole='button' ariaLabel='照片' onClick={() => choosePhoto('album')}>
              <View className='commentPopupMoreSquare'><ThemedIcon src={PhotoIcon} tone='secondary' className='commentPopupMoreIcon' /></View><Text>照片</Text>
            </View>
            <View className='commentPopupMoreAction' ariaRole='button' ariaLabel='收藏' onClick={() => { if (!sending) Taro.showToast({ title: '开发中', icon: 'none' }); }}>
              <View className='commentPopupMoreSquare'><ThemedIcon src={FavoriteIcon} tone='secondary' className='commentPopupMoreIcon' /></View><Text>收藏</Text>
            </View>
          </View>
        </ScrollView>
      </View>}
      {showEmojis && (
        <View className='commentPopupEmojiPanel' style={{ height: inputHeight + "px", paddingBottom: safeBottom + "px" }}>
          <ComposerEmojiPanel tab={panelTab} common={commonUsage} disabled={sending} scrollViewType={skyline ? 'custom' : undefined}
            onTabChange={setPanelTab} onEmoji={insertEmoji} onSticker={selectSticker} />
        </View>
      )}
    </View>
  );
}
