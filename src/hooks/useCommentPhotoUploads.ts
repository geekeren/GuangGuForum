import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { createImageUploadController, ImageUploadError, uploadImage } from 'guanggu-forum-api';
import { compressCommentPhoto } from '../utils/commentPhotos';
import { isImageCompressionEnabled } from '../utils/imageCompressionPreferences';
import { getCachedUsername } from '../utils/currentUser';
import type { CommentAttachment, CommentPhotoAttachment } from '../utils/commentAttachments';
import { ensureImageHostBound, openImageHostSettings } from '../utils/imageUploadGuard';

export function useCommentPhotoUploads(attachments: CommentAttachment[], setAttachments: Dispatch<SetStateAction<CommentAttachment[]>>, username: string) {
  const jobs = useRef(new Map<string, ReturnType<typeof createImageUploadController>>());
  const owner = useRef(username);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      jobs.current.forEach(job => job.abort());
      jobs.current.clear();
    };
  }, []);

  useEffect(() => {
    if (owner.current !== username) {
      jobs.current.forEach(job => job.abort());
      jobs.current.clear();
      owner.current = username;
      setAttachments(previous => previous.filter(item => item.kind !== 'photo'));
      return;
    }
    const ids = new Set(attachments.map(item => item.id));
    jobs.current.forEach((job, id) => { if (!ids.has(id)) { job.abort(); jobs.current.delete(id); } });
    if (!username) return;
    for (const item of attachments) {
      if (jobs.current.size >= 2) break;
      if (item.kind !== 'photo' || (item.status && item.status !== 'queued') || jobs.current.has(item.id)) continue;
      const controller = createImageUploadController();
      jobs.current.set(item.id, controller);
      const active = () => mounted.current && !controller.signal.aborted && owner.current === username && getCachedUsername() === username;
      const update = (patch: Partial<CommentPhotoAttachment>) => {
        if (!active()) return;
        setAttachments(previous => previous.map(entry => entry.id === item.id && entry.kind === 'photo' ? { ...entry, ...patch } : entry));
      };
      update({ status: 'uploading', phase: 'preparing', progress: null, error: undefined });
      void (async () => {
        try {
          if (!await ensureImageHostBound(active)) {
            update({ status: 'failed', error: '请检查图床设置后点击重试' });
            return;
          }
          const path = item.uploadPath ?? ((item.compress ?? isImageCompressionEnabled()) ? await compressCommentPhoto(item.path) : item.path);
          if (!active()) return;
          update({ uploadPath: path });
          const result = await uploadImage({ filePath: path, uploadId: item.uploadId, signal: controller.signal,
            onUploadId: uploadId => update({ uploadId }), onProgress: progress => update(progress) });
          update({ status: 'complete', url: result.url, progress: 100, phase: 'complete' });
        } catch (error) {
          update({ status: 'failed', error: error instanceof ImageUploadError ? error.message : '图片处理失败，请重试' });
          if (active() && error instanceof ImageUploadError && (error.code === 'not_bound' || error.code === 'invalid_token')) void openImageHostSettings();
        } finally {
          if (jobs.current.get(item.id) === controller) jobs.current.delete(item.id);
          if (active()) setAttachments(previous => [...previous]);
        }
      })();
    }
  }, [attachments, username, setAttachments]);
}
