import { ProviderResponse, BookSearchResult } from './types';

export const apiClient = {
  search: async (query: string, page: number = 1): Promise<ProviderResponse> => {
    const url = `/api/search?q=${encodeURIComponent(query)}&page=${page}`;
    console.log("[FRONTEND_SEARCH_URL]", url);
    try {
      const response = await fetch(url);
      console.log("[FRONTEND_SEARCH_RESPONSE]", response.status);
      
      const body = await response.json();
      console.log("[FRONTEND_SEARCH_BODY]", body);

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      return body;
    } catch (err) {
      console.error("[FRONTEND_SEARCH_ERROR]", err);
      throw err;
    }
  },
  
  getBook: async (id: string, provider: string): Promise<BookSearchResult> => {
    const url = `/api/book/${encodeURIComponent(id)}?provider=${encodeURIComponent(provider)}`;
    console.log("[FETCH_START]", url);
    try {
      const res = await fetch(url);
      console.log("[FETCH_OK]", url, res.status);
      if (!res.ok) throw new Error(`Failed to fetch book details: ${res.statusText}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("[FETCH_FAIL]", url, err);
      throw err;
    }
  },

  getDownloadUrl: (provider: string, id: string, format: 'pdf' | 'epub'): string => {
    return `/api/download/${encodeURIComponent(provider)}/${encodeURIComponent(id)}?format=${format}`;
  }
};
