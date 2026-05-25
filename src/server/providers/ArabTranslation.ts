import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class ArabTranslationProvider implements IBookProvider {
  name = "ArabTranslation";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://www.caus.org.lb/`;
      const { data } = await axios.get<string>(url, {
        params: { s: query },
        timeout: 25000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://www.caus.org.lb/"
        }
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      const results: BookSearchResult[] = [];
      // Basic regex for CAUS search results - matches product links and regular post links
      const bookRegex = /<h3[^>]*class="[^"]*title[^"]*"[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gs;
      
      let match;
      while ((match = bookRegex.exec(data)) !== null) {
        const productUrl = match[1];
        const title = match[2].trim();
        const id = productUrl.split('/').filter(Boolean).pop() || "unknown";

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);

        results.push({
          id,
          title,
          author: "Center for Arab Unity Studies",
          authors: "Center for Arab Unity Studies",
          language: "ar",
          formats: [], // Scraper doesn't easily find download links on search page
          source: this.name,
          provider: this.name,
          publicDomain: false,
          downloadable: false,
          downloadUrl: productUrl
        });
      }

      return {
        results,
        nextPageToken: results.length > 0 ? String(page + 1) : undefined,
      };
    } catch (e: any) {
      console.error(`[PROVIDER_BINARY_REJECTED] provider=${this.name} reason="${e.message}"`);
      return { results: [] };
    }
  }

  async getBookDetails(id: string): Promise<BookSearchResult | null> {
    return null;
  }
}
