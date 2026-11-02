import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { compressCommentPhoto } from '../commentPhotos';

vi.mock('@tarojs/taro', () => ({ default: { getImageInfo: vi.fn(), compressImage: vi.fn() } }));
beforeEach(() => { vi.resetAllMocks(); });

describe('comment photo compression', () => {
  it.each([
    [4000, 3000, 1920, 1440],
    [3000, 4000, 1440, 1920],
    [4000, 4000, 1920, 1920],
    [10000, 100, 1920, 19],
    [100, 10000, 19, 1920],
    [800, 600, 800, 600],
    [1920, 1080, 1920, 1080],
  ])('fits %sx%s within 1920px without upscaling', async (width, height, targetWidth, targetHeight) => {
    vi.mocked(Taro.getImageInfo).mockResolvedValueOnce({ width, height } as any)
      .mockResolvedValueOnce({ width: targetWidth, height: targetHeight } as any);
    vi.mocked(Taro.compressImage).mockResolvedValue({ tempFilePath: '/tmp/compressed.jpg' } as any);
    expect(await compressCommentPhoto('/tmp/original.jpg')).toBe('/tmp/compressed.jpg');
    expect(Taro.compressImage).toHaveBeenCalledWith({ src: '/tmp/original.jpg', quality: 80, compressedWidth: targetWidth, compressedHeight: targetHeight });
    expect(Taro.getImageInfo).toHaveBeenLastCalledWith({ src: '/tmp/compressed.jpg' });
  });
  it.each([[0, 1], [1, 0], [-1, 10], [NaN, 10], [Infinity, 10]])('rejects invalid dimensions %sx%s', async (width, height) => {
    vi.mocked(Taro.getImageInfo).mockResolvedValue({ width, height } as any);
    await expect(compressCommentPhoto('/tmp/original.jpg')).rejects.toThrow('Invalid image dimensions');
    expect(Taro.compressImage).not.toHaveBeenCalled();
  });
  it('does not fall back to the original when native compression fails', async () => {
    vi.mocked(Taro.getImageInfo).mockResolvedValue({ width: 4000, height: 3000 } as any);
    vi.mocked(Taro.compressImage).mockRejectedValue(new Error('unsupported format'));
    await expect(compressCommentPhoto('/tmp/original.png')).rejects.toThrow('unsupported format');
  });
  it('rejects a missing output path', async () => {
    vi.mocked(Taro.getImageInfo).mockResolvedValue({ width: 800, height: 600 } as any);
    vi.mocked(Taro.compressImage).mockResolvedValue({} as any);
    await expect(compressCommentPhoto('/tmp/original.jpg')).rejects.toThrow('Missing compressed image');
  });
  it('rejects runtimes that ignore the requested size limit', async () => {
    vi.mocked(Taro.getImageInfo).mockResolvedValue({ width: 4000, height: 3000 } as any);
    vi.mocked(Taro.compressImage).mockResolvedValue({ tempFilePath: '/tmp/still-large.jpg' } as any);
    await expect(compressCommentPhoto('/tmp/original.jpg')).rejects.toThrow('size limit');
  });
});
