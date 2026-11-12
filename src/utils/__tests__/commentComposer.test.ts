import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { readFileSync } from "node:fs";
import { isSkyline } from "../renderer";
import CommentComposer from "../../pages/topicDetail/CommentComposer";
import ComposerEmojiPanel from '../../components/ComposerEmojiPanel';
import { STICKERS } from "../stickers";
import { getCommonEmojiUsage, recordCommentEmojiUsage } from "../emojiUsage";
import { compressCommentPhoto } from "../commentPhotos";
import { photoAttachment, stickerAttachment, type CommentAttachment } from "../commentAttachments";
import { isImageCompressionEnabled } from '../imageCompressionPreferences';

const harness = vi.hoisted(() => ({ state: [] as any[], cursor: 0, refs: [] as any[], refCursor: 0, bound: true }));
vi.mock("react", () => ({
  useEffect: () => {},
  useRef: (initial: any) => { const i = harness.refCursor++; if (!(i in harness.refs)) harness.refs[i] = { current: initial }; return harness.refs[i]; },
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.state[index], (value: any) => { harness.state[index] = value; }];
  },
}));
vi.mock("@tarojs/taro", () => ({
  default: { chooseMedia: vi.fn(), showToast: vi.fn(), hideKeyboard: vi.fn(), getWindowInfo: vi.fn(() => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844, safeArea: { bottom: 810 } })) },
}));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Button: "Button", ScrollView: "ScrollView", Image: "Image" }));
vi.mock("../../components/ThemedIcon", () => ({ default: "ThemedIcon" }));
vi.mock("../../components/MentionTextarea", () => ({ default: "MentionTextarea" }));
vi.mock("../renderer", () => ({ isSkyline: vi.fn(() => true) }));
vi.mock("../commentPhotos", () => ({ compressCommentPhoto: vi.fn() }));
vi.mock('../imageCompressionPreferences', () => ({ isImageCompressionEnabled: vi.fn() }));
// These consumer cases simulate binding outcomes; they do not exercise real auth/storage/network.
vi.mock('../imageUploadGuard', () => ({ ensureImageHostBound: () => Promise.resolve(harness.bound) }));
vi.mock("../emojiUsage", async (importOriginal) => ({
  ...await importOriginal<typeof import('../emojiUsage')>(),
  getCommonEmojiUsage: vi.fn(),
  recordCommentEmojiUsage: vi.fn(),
}));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  const rendered = tree.type === ComposerEmojiPanel ? ComposerEmojiPanel(tree.props) : null;
  return [tree, ...elements(rendered), ...elements(tree.props?.children)];
}
const props = { value: "@first 正文内容", stickers: [] as typeof STICKERS, onStickersChange: vi.fn(), photos: [] as string[], onPhotosChange: vi.fn(), previewAttachments: undefined as CommentAttachment[] | undefined, onAttachmentsChange: undefined as ((next: CommentAttachment[]) => void) | undefined, sending: false, onChange: vi.fn(), onClose: vi.fn(), onSend: vi.fn() };
function render() {
  harness.cursor = 0; harness.refCursor = 0;
  return CommentComposer(props);
}
function find(tree: any, name: string) {
  return elements(tree).find(e => e.type === name || e.props?.className?.split(" ").includes(name)).props;
}
beforeEach(() => {
  harness.state = []; harness.refs = []; harness.bound = true;
  props.value = "@first 正文内容"; props.sending = false;
  props.stickers = [];
  props.photos = [];
  props.previewAttachments = undefined;
  props.onAttachmentsChange = undefined;
  vi.clearAllMocks();
  props.onPhotosChange.mockImplementation((photos: string[]) => { props.photos = photos; });
  vi.mocked(isSkyline).mockReturnValue(true);
  vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: ['👍', '😂'], stickers: [STICKERS[0]] });
  vi.mocked(Taro.chooseMedia).mockResolvedValue({ tempFiles: [{ tempFilePath: '/tmp/photo.jpg' }] } as any);
  vi.mocked(compressCommentPhoto).mockImplementation(async path => path);
  vi.mocked(isImageCompressionEnabled).mockReturnValue(true);
});

describe("Skyline comment sheet with WebView fallback", () => {
  it.each(['camera', 'album'] as const)('keeps original %s photos without compression when the preference is disabled', async source => {
    vi.mocked(isImageCompressionEnabled).mockReturnValue(false);
    find(render(), 'commentPopupMore').onClick();
    await elements(render()).find(e => e.props?.ariaLabel === (source === 'camera' ? '拍照' : '照片'))!.props.onClick();
    expect(compressCommentPhoto).not.toHaveBeenCalled();
    expect(props.photos).toEqual(['/tmp/photo.jpg']);
    expect(vi.mocked(Taro.chooseMedia).mock.calls[0][0].sizeType).toEqual(['original']);
  });
  it.each([true, false])('appends mixed additions and scrolls to the newest stable item in Skyline=%s', async skyline => {
    vi.mocked(isSkyline).mockReturnValue(skyline);
    props.onAttachmentsChange = next => {
      props.previewAttachments = next;
      props.stickers = next.flatMap(item => item.kind === 'sticker' ? [item.sticker] : []);
      props.photos = next.flatMap(item => item.kind === 'photo' ? [item.path] : []);
    };
    props.onAttachmentsChange([stickerAttachment(STICKERS[0]), photoAttachment('/tmp/old.jpg')]);
    let tree = render();
    const oldFirstTarget = find(tree, 'commentStickerPreviews').scrollIntoView;
    find(tree, 'commentPopupMore').onClick();
    await elements(render()).find(e => e.props?.ariaLabel === '拍照')!.props.onClick();
    tree = render();
    const imageSources = () => elements(render()).filter(e => e.props?.className === 'commentStickerPreviewImage').map(e => e.props.src);
    expect(imageSources()).toEqual([STICKERS[0].url, '/tmp/old.jpg', '/tmp/photo.jpg']);
    const firstPhotoTarget = find(tree, 'commentStickerPreviews').scrollIntoView;
    expect(firstPhotoTarget).not.toBe(oldFirstTarget);
    expect(find(tree, 'commentStickerPreviews').scrollWithAnimation).toBe(true);
    expect(elements(tree).some(e => e.props?.id === firstPhotoTarget)).toBe(true);
    find(tree, 'commentPopupEmoji').onClick();
    find(render(), 'composerEmojiSticker').onClick();
    tree = render();
    expect(imageSources()).toEqual([STICKERS[0].url, '/tmp/old.jpg', '/tmp/photo.jpg', STICKERS[0].url]);
    expect(find(tree, 'commentStickerPreviews').scrollIntoView).not.toBe(firstPhotoTarget);
    const previews = elements(tree).filter(e => e.props?.className?.split(' ').includes('commentStickerPreview'));
    expect(new Set(previews.map(e => e.key)).size).toBe(4);
    elements(previews[3]).find(e => e.props?.className === 'commentStickerRemove')!.props.onClick();
    expect(imageSources()).toEqual([STICKERS[0].url, '/tmp/old.jpg', '/tmp/photo.jpg']);
    expect(props.previewAttachments?.[0].id).toBe(previews[0].key);
    expect(find(render(), 'MentionTextarea').focus).toBe(false);
  });
  it('appends a selected photo batch while keeping the picker selection order', async () => {
    props.onAttachmentsChange = next => {
      props.previewAttachments = next;
      props.stickers = next.flatMap(item => item.kind === 'sticker' ? [item.sticker] : []);
      props.photos = next.flatMap(item => item.kind === 'photo' ? [item.path] : []);
    };
    props.onAttachmentsChange([photoAttachment('/tmp/old.jpg')]);
    find(render(), 'commentPopupMore').onClick();
    vi.mocked(Taro.chooseMedia).mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/tmp/new1.jpg' }, { tempFilePath: '/tmp/new2.jpg' }] } as any);
    await elements(render()).find(e => e.props?.ariaLabel === '照片')!.props.onClick();
    expect(props.photos).toEqual(['/tmp/old.jpg', '/tmp/new1.jpg', '/tmp/new2.jpg']);
    expect(elements(render()).filter(e => e.props?.className === 'commentStickerPreviewImage').map(e => e.props.src)).toEqual(props.photos);
  });
  it.each([false, true])('previews every original and preserves upload compression intent=%s without running compression in UI', async compressionEnabled => {
    vi.mocked(isImageCompressionEnabled).mockReturnValue(compressionEnabled);
    props.onAttachmentsChange = next => { props.previewAttachments = next; props.photos = next.flatMap(item => item.kind === 'photo' ? [item.path] : []); };
    find(render(), 'commentPopupMore').onClick();
    vi.mocked(Taro.chooseMedia).mockResolvedValueOnce({ tempFiles: [{ tempFilePath: '/tmp/original.jpg' }, { tempFilePath: '/tmp/second.png' }] } as any);
    await elements(render()).find(e => e.props?.ariaLabel === '照片')!.props.onClick();
    expect(props.photos).toEqual(['/tmp/original.jpg', '/tmp/second.png']);
    expect(elements(render()).filter(e => e.props?.className === 'commentStickerPreviewImage').map(e => e.props.src)).toEqual(props.photos);
    expect(props.previewAttachments?.every(item => item.kind === 'photo' && item.compress === compressionEnabled)).toBe(true);
    expect(compressCommentPhoto).not.toHaveBeenCalled(); expect(Taro.showToast).not.toHaveBeenCalled();
  });
  it.each([true, false])('animates the always-mounted upper attachment region in Skyline=%s', async skyline => {
    vi.mocked(isSkyline).mockReturnValue(skyline);
    let tree = render();
    expect(find(tree, 'commentPopupAttachmentRegion').style.height).toBe('0rpx');
    props.stickers = [STICKERS[0]];
    tree = render();
    expect(find(tree, 'commentPopupAttachmentRegion').style.height).toBe('156rpx');
    find(tree, 'commentPopupMore').onClick();
    await elements(render()).find(e => e.props?.ariaLabel === '拍照')!.props.onClick();
    tree = render();
    const bodyChildren = find(tree, 'commentPopupBody').children;
    expect(bodyChildren.findIndex((e: any) => e?.props?.className === 'commentPopupAttachmentRegion')).toBeLessThan(bodyChildren.findIndex((e: any) => e?.type === 'MentionTextarea'));
    expect(find(tree, 'commentPopupAttachmentRegion').style.height).toBe('200rpx');
    expect(find(tree, 'commentStickerPreviewTrack').style.width).toBe('288rpx');
    expect(elements(tree).filter(e => e.props?.className === 'commentStickerPreviewImage').map(e => e.props.src)).toEqual([STICKERS[0].url, '/tmp/photo.jpg']);
    expect(elements({ props: find(tree, 'commentPopupMorePanel') }).some(e => e.props?.className === 'commentStickerPreviewImage')).toBe(false);
    find(tree, 'commentPopupEmoji').onClick();
    tree = render();
    expect(find(tree, 'commentPopupAttachmentRegion').style.height).toBe('200rpx');
    elements(tree).find(e => e.props?.ariaLabel === '删除所选照片')!.props.onClick();
    expect(find(render(), 'commentPopupAttachmentRegion').style.height).toBe('156rpx');
    props.stickers = [];
    expect(find(render(), 'commentPopupAttachmentRegion').style.height).toBe('0rpx');
    const styles = readFileSync('src/pages/topicDetail/index.scss', 'utf8');
    expect(styles).toMatch(/\.commentPopupAttachmentRegion\s*\{[^}]*overflow: hidden;[^}]*transition: height 200ms ease;/);
    expect(readFileSync('src/components/MentionTextarea/index.scss', 'utf8')).toContain('transition: height 200ms ease;');
  });
  it('allows five photos, blocks more, and frees capacity after removal', async () => {
    find(render(), 'commentPopupMore').onClick();
    vi.mocked(Taro.chooseMedia).mockResolvedValueOnce({ tempFiles: Array.from({ length: 5 }, (_, i) => ({ tempFilePath: `/tmp/${i}.jpg` })) } as any);
    await elements(render()).find(e => e.props?.ariaLabel === '照片')!.props.onClick();
    expect(props.photos).toHaveLength(5);
    await elements(render()).find(e => e.props?.ariaLabel === '拍照')!.props.onClick();
    expect(Taro.chooseMedia).toHaveBeenCalledOnce();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '图片和表情包最多只能添加5个', icon: 'none' });
    elements(render()).find(e => e.props?.ariaLabel === '删除所选照片')!.props.onClick();
    expect(props.photos).toHaveLength(4);
    find(render(), 'commentPopupEmoji').onClick();
    find(render(), 'composerEmojiSticker').onClick();
    expect(props.onStickersChange).toHaveBeenLastCalledWith([STICKERS[0]]);
    props.stickers = [STICKERS[0]];
    props.onStickersChange.mockClear();
    find(render(), 'composerEmojiSticker').onClick();
    expect(props.onStickersChange).not.toHaveBeenCalled();
  });
  it('allows repeated stickers up to the combined limit and restricts album count to remaining slots', async () => {
    props.photos = ['/tmp/1.jpg', '/tmp/2.jpg'];
    find(render(), 'commentPopupEmoji').onClick();
    const sticker = find(render(), 'composerEmojiSticker');
    sticker.onClick(); sticker.onClick(); sticker.onClick(); sticker.onClick();
    expect(props.onStickersChange).toHaveBeenLastCalledWith([STICKERS[0], STICKERS[0], STICKERS[0]]);
    expect(props.onStickersChange).toHaveBeenCalledTimes(3);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '图片和表情包最多只能添加5个', icon: 'none' });
    props.stickers = [STICKERS[0], STICKERS[0]];
    find(render(), 'commentPopupMore').onClick();
    await elements(render()).find(e => e.props?.ariaLabel === '照片')!.props.onClick();
    expect(Taro.chooseMedia).toHaveBeenLastCalledWith({ count: 1, mediaType: ['image'], sourceType: ['album'], sizeType: ['original'] });
    expect(props.photos).toHaveLength(3);
  });
  it('rechecks capacity after the native picker returns', async () => {
    props.stickers = STICKERS.slice(0, 3);
    find(render(), 'commentPopupMore').onClick();
    let resolve: (value: any) => void = () => {};
    vi.mocked(Taro.chooseMedia).mockReturnValueOnce(new Promise(done => { resolve = done; }) as any);
    const pending = elements(render()).find(e => e.props?.ariaLabel === '照片')!.props.onClick();
    props.stickers = STICKERS.slice(0, 4);
    render();
    resolve({ tempFiles: [{ tempFilePath: '/tmp/1.jpg' }, { tempFilePath: '/tmp/2.jpg' }] });
    await pending;
    expect(props.photos).toEqual(['/tmp/1.jpg']);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '图片和表情包最多只能添加5个', icon: 'none' });
  });
  it('places more after emoji and swaps panels without reopening the keyboard', () => {
    let tree = render();
    const tools = elements(tree).filter(e => e.props?.className?.split(' ').includes('commentPopupTool'));
    expect(tools.map(e => e.props.className.split(' ')[1])).toEqual(['commentPopupMention', 'commentPopupEmoji', 'commentPopupMore', 'commentPopupCancel']);
    find(tree, 'MentionTextarea').onFocus({ detail: { height: 336 } });
    find(render(), 'commentPopupMore').onClick();
    tree = render();
    expect(find(tree, 'commentPopupMore').ariaLabel).toBe('切换到键盘');
    expect(find(tree, 'commentPopupMorePanel').style.height).toBe('336px');
    expect(find(tree, 'MentionTextarea').focus).toBe(false);
    expect(find(tree, 'MentionTextarea').holdKeyboard).toBe(false);
    expect(elements(tree).filter(e => e.props?.className === 'commentPopupMoreAction').map(e => e.props.ariaLabel)).toEqual(['拍照', '照片', '收藏']);
    find(tree, 'MentionTextarea').onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), 'commentPopupBody').style.bottom).toBe('336px');
    find(render(), 'commentPopupEmoji').onClick();
    tree = render();
    expect(elements(tree).some(e => e.props?.className?.includes('commentPopupMorePanel'))).toBe(false);
    expect(find(tree, 'commentPopupMore').ariaLabel).toBe('更多功能');
    expect(find(tree, 'commentPopupEmojiPanel').style.height).toBe('336px');
    find(tree, 'commentPopupMore').onClick();
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce();
    find(render(), 'commentPopupMore').onClick();
    tree = render();
    expect(find(tree, 'MentionTextarea').focus).toBe(true);
    find(tree, 'MentionTextarea').onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), 'commentPopupBody').style.bottom).toBe('336px');
  });
  it.each(['camera', 'album'] as const)('opens the native %s picker and previews locally without editing comment text', async source => {
    find(render(), 'commentPopupMore').onClick();
    const action = elements(render()).find(e => e.props?.ariaLabel === (source === 'camera' ? '拍照' : '照片'))!;
    await action.props.onClick();
    expect(Taro.chooseMedia).toHaveBeenCalledWith({ count: source === 'camera' ? 1 : 5, mediaType: ['image'], sourceType: [source], sizeType: ['original'] });
    expect(compressCommentPhoto).not.toHaveBeenCalled();
    const tree = render();
    expect(find(tree, 'commentStickerPreviewImage').src).toBe('/tmp/photo.jpg');
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onStickersChange).not.toHaveBeenCalled();
    expect(find(tree, 'MentionTextarea').focus).toBe(false);
    elements(tree).find(e => e.props?.ariaLabel === '删除所选照片')!.props.onClick();
    expect(elements(render()).some(e => e.props?.className?.split(' ').includes('commentPopupPhotoPreview'))).toBe(false);
  });
  it('does not open media or alter drafts when the synthetic binding guard denies access', () => {
    harness.bound = false;
    find(render(), 'commentPopupMore').onClick();
    return elements(render()).find(e => e.props?.ariaLabel === '照片')!.props.onClick().then(() => {
      expect(Taro.chooseMedia).not.toHaveBeenCalled(); expect(props.photos).toEqual([]);
      expect(props.onChange).not.toHaveBeenCalled(); expect(props.onPhotosChange).not.toHaveBeenCalled();
      expect(props.onStickersChange).not.toHaveBeenCalled();
    });
  });
  it('ignores cancellation, reports permission errors and keeps favorite a placeholder', async () => {
    find(render(), 'commentPopupMore').onClick();
    const actions = elements(render()).filter(e => e.props?.className === 'commentPopupMoreAction');
    vi.mocked(Taro.chooseMedia).mockRejectedValueOnce({ errMsg: 'chooseMedia:fail cancel' });
    await actions[0].props.onClick();
    expect(Taro.showToast).not.toHaveBeenCalled();
    vi.mocked(Taro.chooseMedia).mockRejectedValueOnce({ errMsg: 'chooseMedia:fail auth denied' });
    await actions[1].props.onClick();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '无法选择照片，请检查权限', icon: 'none' });
    actions[2].props.onClick();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: '开发中', icon: 'none' });
  });
  it('prevents duplicate picker calls and blocks more actions while sending', async () => {
    find(render(), 'commentPopupMore').onClick();
    const action = elements(render()).find(e => e.props?.ariaLabel === '拍照')!;
    let resolve: (value: any) => void = () => {};
    vi.mocked(Taro.chooseMedia).mockReturnValueOnce(new Promise(done => { resolve = done; }) as any);
    const pending = action.props.onClick();
    await action.props.onClick();
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    expect(Taro.chooseMedia).toHaveBeenCalledOnce();
    resolve({ tempFiles: [] });
    await pending;
    props.sending = true;
    const actions = elements(render()).filter(e => e.props?.className === 'commentPopupMoreAction');
    await actions[0].props.onClick();
    actions[2].props.onClick();
    find(render(), 'commentPopupMore').onClick();
    expect(Taro.chooseMedia).toHaveBeenCalledOnce();
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(find(render(), 'MentionTextarea').focus).toBe(false);
  });
  it("shows five stickers per row in the second tab and previews selected images", () => {
    find(render(), "commentPopupEmoji").onClick();
    const tabs = elements(render()).filter(e => e.props?.className?.split(' ').includes('composerEmojiTab'));
    tabs[2].props.onClick();
    let tree = render();
    const rows = elements(tree).filter(e => e.props?.className === 'composerEmojiRow');
    expect(rows).toHaveLength(6);
    expect(rows.every(row => row.props.children.length === 5)).toBe(true);
    const cells = elements(tree).filter(e => e.props?.className === 'composerEmojiSticker');
    expect(cells.every(cell => cell.props.children.type === 'Image')).toBe(true);
    expect(cells[0].props.ariaLabel).toBe(`添加表情包${STICKERS[0].name}`);
    find(tree, 'composerEmojiSticker').onClick();
    expect(props.onStickersChange).toHaveBeenCalledWith([STICKERS[0]]);
    props.stickers = [STICKERS[0]];
    props.onStickersChange.mockClear();
    elements(render()).filter(e => e.props?.className === 'composerEmojiSticker')[1].props.onClick();
    expect(props.onStickersChange).toHaveBeenCalledWith([STICKERS[0], STICKERS[1]]);
    props.stickers = STICKERS.slice(0, 5);
    props.onStickersChange.mockClear();
    find(render(), 'composerEmojiSticker').onClick();
    expect(props.onStickersChange).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '图片和表情包最多只能添加5个', icon: 'none' });
    props.stickers = [STICKERS[0]];
    props.value = '';
    tree = render();
    expect(find(tree, 'commentStickerPreviewImage').src).toBe(STICKERS[0].url);
    expect(find(tree, 'commentPopupSend').disabled).toBe(false);
    expect(find(tree, 'MentionTextarea').focus).toBe(false);
    find(tree, 'commentStickerRemove').onClick();
    expect(props.onStickersChange).toHaveBeenLastCalledWith([]);
    props.stickers = [];
    elements(render()).filter(e => e.props?.className === 'composerEmojiSticker')[1].props.onClick();
    expect(props.onStickersChange).toHaveBeenLastCalledWith([STICKERS[1]]);
    props.stickers = STICKERS.slice(0, 5);
    props.sending = true;
    props.onStickersChange.mockClear();
    vi.mocked(Taro.showToast).mockClear();
    find(render(), 'composerEmojiSticker').onClick();
    expect(Taro.showToast).not.toHaveBeenCalled();
    find(render(), 'commentStickerRemove').onClick();
    expect(props.onStickersChange).not.toHaveBeenCalled();
  });
  it("gives the overlay actual viewport dimensions and a full-width bottom sheet", () => {
    const tree = render();
    expect(tree.props.className).toContain("commentPopup--skyline");
    expect(tree.props.style).toEqual({ width: "390px", height: "844px" });
    expect(find(tree, "commentPopupBody").style).toEqual({ bottom: "0px", paddingBottom: "calc(24rpx + 34px)", maxHeight: "844px" });
    const styles = readFileSync("src/pages/topicDetail/index.scss", "utf8").split("&.commentPopup--skyline")[1];
    expect(styles).toContain("position: absolute;");
    expect(styles).toContain("width: 100%;");
    expect(styles).toContain("bottom: 0;");
  });
  it("moves only the Skyline sheet above the keyboard without pushing the page", () => {
    const input = find(render(), "MentionTextarea");
    expect(input.adjustPosition).toBe(false);
    expect(input.cursorSpacing).toBe(0);
    expect(input.fixed).toBe(true);
    expect(input.autoHeight).toBe(false);
    input.onFocus({ detail: { height: 336 } });
    expect(find(render(), "commentPopupBody").style).toEqual({ bottom: "336px", paddingBottom: "calc(24rpx + 0px)", maxHeight: "508px" });
  });
  it("updates keyboard height and restores device safe padding when it closes", () => {
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: 360 } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("360px");
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), "commentPopupBody").style.paddingBottom).toBe("calc(24rpx + 34px)");
  });
  it("rejects invalid keyboard height and clamps negative heights", () => {
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: NaN } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("0px");
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: -1 } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("0px");
  });
  it("keeps WebView's native adjust-position and CSS sheet layout", () => {
    vi.mocked(isSkyline).mockReturnValue(false);
    const tree = render();
    expect(tree.props.className).not.toContain("--skyline");
    expect(tree.props.style).toBeUndefined();
    expect(find(tree, "commentPopupBody").style).toBeUndefined();
    const input = find(tree, "MentionTextarea");
    expect(input.adjustPosition).toBe(true);
    expect(input.cursorSpacing).toBe(100);
    input.onKeyboardHeightChange({ detail: { height: 336 } });
    expect(find(render(), "commentPopupBody").style).toBeUndefined();
    expect(Taro.getWindowInfo).not.toHaveBeenCalled();
  });
  it("passes draft and whole-mention changes through without changing backend format", () => {
    const input = find(render(), "MentionTextarea");
    expect(input.value).toBe(props.value);
    input.onInput({ detail: { value: "@second 正文" } });
    expect(props.onChange).toHaveBeenCalledWith("@second 正文");
  });
  it("keeps dismissal and send in the bottom toolbar", () => {
    const tree = render();
    find(tree, "commentPopupCancel").onClick();
    expect(props.onClose).toHaveBeenCalledOnce();
    const send = find(tree, "commentPopupSend");
    expect(send.children.type).toBe("Text");
    expect(send.disabled).toBe(false);
    send.onClick();
    expect(props.onSend).toHaveBeenCalledOnce();
  });
  it("prevents sending whitespace, only recipients, short text or an in-flight comment", () => {
    for (const value of ["", "  ", "@first ", "@first 好的"]) {
      props.value = value;
      const send = find(render(), "commentPopupSend");
      expect(send.disabled).toBe(true);
      send.onClick();
    }
    props.value = "足够长的正文";
    props.sending = true;
    const send = find(render(), "commentPopupSend");
    expect(send.disabled).toBe(true);
    expect(send.loading).toBe(true);
    send.onClick();
    expect(props.onSend).not.toHaveBeenCalled();
  });
  it("replaces the keyboard with the emoji panel and ignores delayed keyboard heights", () => {
    let tree = render();
    const controller = { openMentions: vi.fn(), insertText: vi.fn() };
    find(tree, "MentionTextarea").editorRef.current = controller;
    find(tree, "MentionTextarea").onFocus({ detail: { height: 336 } });
    find(render(), "commentPopupEmoji").onClick();
    tree = render();
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce();
    expect(find(tree, "MentionTextarea").focus).toBe(false);
    expect(find(tree, "MentionTextarea").holdKeyboard).toBe(false);
    expect(find(tree, "commentPopupBody").style.bottom).toBe("336px");
    expect(find(tree, "commentPopupEmojiPanel").style.height).toBe("336px");
    const keyboardIcon = find(tree, "commentPopupEmoji").children.props.src;
    expect(find(tree, "commentPopupEmoji").ariaLabel).toBe("切换到键盘");
    find(tree, "MentionTextarea").onKeyboardHeightChange({ detail: { height: 336 } });
    find(tree, "composerEmojiCell").onClick();
    tree = render();
    expect(find(tree, "commentPopupBody").style.bottom).toBe("336px");
    expect(find(tree, "MentionTextarea").focus).toBe(false);
    expect(controller.insertText).toHaveBeenCalledWith("👍");
    find(tree, "commentPopupEmoji").onClick();
    tree = render();
    expect(find(tree, "MentionTextarea").focus).toBe(true);
    expect(find(tree, "MentionTextarea").holdKeyboard).toBe(true);
    find(tree, "MentionTextarea").onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("336px");
    expect(find(tree, "commentPopupEmoji").children.props.src).not.toBe(keyboardIcon);
    expect(elements(tree).some(e => e.props?.className === "commentPopupEmojiPanel")).toBe(false);
    find(tree, "MentionTextarea").onKeyboardHeightChange({ detail: { height: 300 } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("300px");
  });
  it("shows common emojis only inside the first panel tab and blocks insertion while sending", () => {
    let tree = render();
    const controller = { insertText: vi.fn() };
    find(tree, "MentionTextarea").editorRef.current = controller;
    expect(elements(tree).some(e => e.props?.className === 'commentPopupQuickEmojis')).toBe(false);
    expect(elements(tree).some(e => e.props?.className === 'composerEmojiCell')).toBe(false);
    find(tree, 'commentPopupEmoji').onClick();
    tree = render();
    const tabs = elements(tree).filter(e => e.props?.className?.split(' ').includes('composerEmojiTab'));
    expect(tabs.map(tab => tab.props.children.props.children)).toEqual(['常用', '表情', '过早客']);
    expect(tabs[0].props.className).toContain('composerEmojiTab--active');
    expect(elements(tree).filter(e => e.props?.className === 'composerEmojiCell').map(e => e.props.children.props.children)).toEqual(['👍', '😂']);
    expect(elements(tree).filter(e => e.props?.className === 'composerEmojiHeading').map(e => e.props.children)).toEqual(['Emoji', '自定义表情']);
    const nodes = elements(tree);
    expect(nodes.findIndex(e => e.props?.className === 'composerEmojiCell')).toBeLessThan(nodes.findIndex(e => e.props?.className === 'composerEmojiSticker'));
    find(tree, 'composerEmojiSticker').onClick();
    expect(props.onStickersChange).toHaveBeenCalledWith([STICKERS[0]]);
    props.stickers = STICKERS.slice(0, 5);
    props.onStickersChange.mockClear();
    find(render(), 'composerEmojiSticker').onClick();
    expect(props.onStickersChange).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '图片和表情包最多只能添加5个', icon: 'none' });
    find(tree, 'composerEmojiCell').onClick();
    expect(controller.insertText).toHaveBeenCalledWith('👍');
    expect(find(render(), 'MentionTextarea').focus).toBe(false);
    props.sending = true;
    controller.insertText.mockClear();
    find(render(), 'composerEmojiCell').onClick();
    expect(controller.insertText).not.toHaveBeenCalled();
    find(render(), "commentPopupEmoji").onClick();
    expect(elements(render()).some(e => e.props?.className === "commentPopupEmojiPanel")).toBe(true);
    props.sending = false;
    find(render(), 'commentPopupEmoji').onClick();
    expect(elements(render()).some(e => e.props?.className === "commentPopupEmojiPanel")).toBe(false);
    expect(elements(render()).some(e => e.props?.className === 'composerEmojiCell')).toBe(false);
  });
  it("connects mention and emoji tools to the editor and expands more emojis", () => {
    let tree = render();
    const controller = { openMentions: vi.fn(), insertText: vi.fn() };
    find(tree, "MentionTextarea").editorRef.current = controller;
    find(tree, "commentPopupMention").onClick();
    expect(controller.openMentions).toHaveBeenCalledOnce();
    find(tree, "commentPopupEmoji").onClick();
    tree = render();
    elements(tree).filter(e => e.props?.className?.split(' ').includes('composerEmojiTab'))[1].props.onClick();
    tree = render();
    const emojis = elements(tree).filter(e => e.props?.className === "composerEmojiCell");
    expect(emojis).toHaveLength(90);
    const rows = elements(tree).filter(e => e.props?.className === 'composerEmojiRow');
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, -1).every(row => row.props.children.length === 8)).toBe(true);
    expect(rows[11].props.children).toHaveLength(2);
    expect(emojis.map(e => e.props.children.props.children)).toEqual(expect.arrayContaining(["😓", "🍉", "🎁", "🍻", "👍"]));
    find(tree, "composerEmojiCell").onClick();
    expect(controller.insertText).toHaveBeenCalledWith("😊");
    find(tree, "commentPopupMention").onClick();
    expect(elements(render()).some(e => e.props?.className === "commentPopupEmojiPanel")).toBe(false);
  });
  it('shows honest empty sections and refreshes usage when reopening the panel', () => {
    vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: [], stickers: [] });
    find(render(), 'commentPopupEmoji').onClick();
    let tree = render();
    expect(elements(tree).filter(e => e.props?.className === 'composerEmojiEmpty')).toHaveLength(2);
    expect(elements(tree).filter(e => e.props?.className === 'composerEmojiCell')).toHaveLength(0);
    find(tree, 'commentPopupEmoji').onClick();
    vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: ['❤️'], stickers: [] });
    find(render(), 'commentPopupEmoji').onClick();
    tree = render();
    expect(find(tree, 'composerEmojiCell').children.props.children).toBe('❤️');
  });
});


it('records selected emoji and sticker immediately and refreshes common without sending', () => {
  find(render(), 'commentPopupEmoji').onClick();
  const editor = find(render(), 'MentionTextarea').editorRef;
  editor.current = { insertText: vi.fn() };
  vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: ['😂'], stickers: [STICKERS[1]] });
  elements(render()).find(e => e.props?.ariaLabel === '插入表情👍')!.props.onClick();
  expect(recordCommentEmojiUsage).toHaveBeenCalledWith('👍', []);
  expect(elements(render()).some(e => e.props?.ariaLabel === '插入表情😂')).toBe(true);
  find(render(), 'composerEmojiSticker').onClick();
  expect(recordCommentEmojiUsage).toHaveBeenCalledWith('', [STICKERS[1]]);
  expect(props.onSend).not.toHaveBeenCalled();
});
