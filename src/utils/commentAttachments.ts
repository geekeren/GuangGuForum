import type { Sticker } from './stickers';
import type { ImageUploadProgress } from 'guanggu-forum-api';

export type CommentPhotoAttachment = {
  id: string; kind: 'photo'; path: string; uploadPath?: string; uploadId?: string;
  status?: 'queued' | 'uploading' | 'complete' | 'failed';
  progress?: number | null; phase?: ImageUploadProgress['phase']; url?: string; error?: string;
  compress?: boolean;
};

export type CommentAttachment =
  | { id: string; kind: 'sticker'; sticker: Sticker }
  | CommentPhotoAttachment;

let nextId = 0;
const attachmentId = () => `attachment-${Date.now()}-${nextId++}`;

export const stickerAttachment = (sticker: Sticker): CommentAttachment => ({ id: attachmentId(), kind: 'sticker', sticker });
export const photoAttachment = (path: string, compress?: boolean): CommentAttachment => ({ id: attachmentId(), kind: 'photo', path, status: 'queued', compress });

export function buildAttachmentComment(value: string, selected: CommentAttachment[]): string {
  const images = selected.map(item => {
    const url = item.kind === 'sticker' ? item.sticker.url : item.status === 'complete' ? item.url : undefined;
    if (!url) throw new Error('图片尚未完成上传');
    const safeUrl = url.replace(/[()\s<>]/g, character => character === '(' ? '%28' : character === ')' ? '%29' : encodeURIComponent(character));
    const name = item.kind === 'sticker' ? item.sticker.name : '图片';
    return `![${name}](${safeUrl})`;
  });
  return [value, ...images].filter(Boolean).join('\n\n');
}
