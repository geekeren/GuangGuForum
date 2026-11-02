import Taro from '@tarojs/taro';

export const MAX_COMMENT_PHOTO_DIMENSION = 1920;

async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const size = await new Promise<number>((resolve, reject) => {
      Taro.getFileSystemManager().getFileInfo({
        filePath,
        success: result => resolve(result.size),
        fail: reject,
      });
    });
    if (!Number.isFinite(size) || size <= 0) return null;
    return size;
  } catch {
    return null;
  }
}

export async function compressCommentPhoto(src: string): Promise<string> {
  const { width, height } = await Taro.getImageInfo({ src });
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions');
  }
  const scale = Math.min(1, MAX_COMMENT_PHOTO_DIMENSION / width, MAX_COMMENT_PHOTO_DIMENSION / height);
  const result = await Taro.compressImage({
    src,
    quality: 80,
    compressedWidth: Math.max(1, Math.floor(width * scale)),
    compressedHeight: Math.max(1, Math.floor(height * scale)),
  });
  if (!result.tempFilePath) throw new Error('Missing compressed image');
  // Older runtimes may ignore resize options. Never accept an oversized result.
  const output = await Taro.getImageInfo({ src: result.tempFilePath });
  if (!Number.isFinite(output.width) || !Number.isFinite(output.height)
    || output.width <= 0 || output.height <= 0
    || output.width > MAX_COMMENT_PHOTO_DIMENSION || output.height > MAX_COMMENT_PHOTO_DIMENSION) {
    throw new Error('Image compression did not satisfy the size limit');
  }
  const [originalSize, compressedSize] = await Promise.all([
    getFileSize(src),
    getFileSize(result.tempFilePath),
  ]);
  const reduction = originalSize && compressedSize ? Math.round((1 - compressedSize / originalSize) * 100) : null;
  const title = reduction === null ? '图片已压缩，大小读取失败'
    : `${reduction >= 0 ? '压缩' : '增大'} ${Math.abs(reduction)}%，${Math.round(originalSize! / 1024)}K -> ${Math.round(compressedSize! / 1024)}K`;
  void Taro.showToast({
    title,
    icon: 'none',
    duration: 3000,
  });
  return result.tempFilePath;
}
