import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { compressCommentPhoto } from '../commentPhotos';

const files = vi.hoisted(() => ({ getFileInfo: vi.fn() }));
vi.mock('@tarojs/taro', () => ({ default: { getImageInfo: vi.fn(), compressImage: vi.fn(), showToast: vi.fn(), getFileSystemManager: () => files } }));
beforeEach(() => {
  vi.resetAllMocks();
  files.getFileInfo.mockImplementation(({ filePath, success }: any) => success({ size: filePath.includes('original') ? 3276800 : 460800 }));
});

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
    expect(Taro.showToast).toHaveBeenCalledWith({
      title: `压缩前：${width}x${height} px / 3200.0 KB\n压缩后：${targetWidth}x${targetHeight} px / 450.0 KB`,
      icon: 'none', duration: 5000,
    });
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
    expect(Taro.showToast).not.toHaveBeenCalled();
  });
  it('reports actual output dimensions and fractional KB instead of estimates', async () => {
    vi.mocked(Taro.getImageInfo).mockResolvedValueOnce({ width: 4000, height: 3000 } as any)
      .mockResolvedValueOnce({ width: 1918, height: 1438 } as any);
    vi.mocked(Taro.compressImage).mockResolvedValue({ tempFilePath: '/tmp/compressed.jpg' } as any);
    files.getFileInfo.mockImplementation(({ filePath, success }: any) => success({ size: filePath.includes('original') ? 1536 : 512 }));
    await compressCommentPhoto('/tmp/original.jpg');
    expect(Taro.showToast).toHaveBeenCalledWith({
      title: '压缩前：4000x3000 px / 1.5 KB\n压缩后：1918x1438 px / 0.5 KB',
      icon: 'none', duration: 5000,
    });
  });
  it('keeps a successfully compressed image when file size lookup fails', async () => {
    vi.mocked(Taro.getImageInfo).mockResolvedValue({ width: 800, height: 600 } as any);
    vi.mocked(Taro.compressImage).mockResolvedValue({ tempFilePath: '/tmp/compressed.jpg' } as any);
    files.getFileInfo.mockImplementation(({ fail }: any) => fail(new Error('unreadable')));
    expect(await compressCommentPhoto('/tmp/original.jpg')).toBe('/tmp/compressed.jpg');
    expect(Taro.showToast).toHaveBeenCalledWith({
      title: '压缩前：800x600 px / 大小读取失败\n压缩后：800x600 px / 大小读取失败',
      icon: 'none', duration: 5000,
    });
  });
});
