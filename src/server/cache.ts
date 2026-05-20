export class CacheLayer {
  private cache = new Map<string, { data: any; expiry: number }>();

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  set(key: string, data: any, ttlSec: number = 3600) {
    this.cache.set(key, { data, expiry: Date.now() + ttlSec * 1000 });
  }

  delete(key: string) {
    this.cache.delete(key);
  }
}

export const searchCache = new CacheLayer();
