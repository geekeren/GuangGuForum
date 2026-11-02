import Taro from '@tarojs/taro';

export const MAX_COMMENT_PHOTO_DIMENSION = 1920;

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
  return result.tempFilePath;
}
