import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class ShamelaProvider implements IBookProvider {
  name = "Shamela";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://shamela.ws/search`;
      const { data } = await axios.get<string>(url, { 
        params: { q: query, page }, 
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      
      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      const results: BookSearchResult[] = [];
      // Example regex for Shamela search results
      // <a href="https://shamela.ws/book/1234">Title</a> ... <a href="https://shamela.ws/author/567">Author</a>
      const bookRegex = /href="https:\/\/shamela\.ws\/book\/(\d+)"[^>]*>([^<]+)<\/a>.*?href="https:\/\/shamela\.ws\/author\/\d+"[^>]*>([^<]+)<\/a>/gs;
      
      let match;
      while ((match = bookRegex.exec(data)) !== null) {
        const id = match[1];
        const title = match[2].trim();
        const author = match[3].trim();

        // Normalize Arabic metadata (remove diacritics)
        const normalizedTitle = title.replace(/[\u064B-\u065F]/g, "").trim(); 
        const normalizedAuthor = author.replace(/[\u064B-\u065F]/g, "").trim();

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${normalizedTitle}"`);

        results.push({
          id,
          title: normalizedTitle,
          author: normalizedAuthor,
          language: "ar",
          formats: [
            { type: "epub", downloadUrl: `https://shamela.ws/book/${id}/epub` }
          ],
          source: this.name,
          publicDomain: true,
        });
      }

      return {
        results,
        nextPageToken: results.length > 0 ? String(page + 1) : undefined
      };
    } catch (e: any) {
      console.error(`[PROVIDER_BINARY_REJECTED] provider=${this.name} reason="${e.message}"`);
      return { results: [] };
    }
  }

  async getBookDetails(id: string): Promise<BookSearchResult | null> {
    return {
      id,
      title: "Unknown",
      author: "Unknown",
      language: "ar",
      formats: [
        { type: "epub", downloadUrl: `https://shamela.ws/books/${id}/epub` }
      ],
      source: this.name,
      publicDomain: true,
    };
  }
}
