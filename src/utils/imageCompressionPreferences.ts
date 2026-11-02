import { cacheService, CacheCategory } from './CacheService';

export const IMAGE_COMPRESSION_KEY = 'image_compression_enabled';

export function isImageCompressionEnabled(): boolean {
  return cacheService.get<unknown>(IMAGE_COMPRESSION_KEY) !== false;
}

export function setImageCompressionEnabled(enabled: boolean): boolean {
  return cacheService.set(IMAGE_COMPRESSION_KEY, enabled, { category: CacheCategory.System });
}
