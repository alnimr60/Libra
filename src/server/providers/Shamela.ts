import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class ShamelaProvider implements IBookProvider {
  name = "Shamela";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://shamela.ws/index.php/api/search`;
      const { data } = await axios.post<any>(url, { q: query, page }, { timeout: 10000 });
      
      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      if (!data || !data.results) return { results: [] };

      const results: BookSearchResult[] = data.results.map((book: any) => {
        // Normalize Arabic metadata
        const normalizedTitle = (book.title || "").replace(/[\u064B-\u065F]/g, "").trim(); 
        const normalizedAuthor = (book.author || "").replace(/[\u064B-\u065F]/g, "").trim();

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${normalizedTitle}"`);

        return {
          id: String(book.id),
          title: normalizedTitle,
          author: normalizedAuthor,
          language: "ar",
          formats: [
            { type: "epub", downloadUrl: `https://shamela.ws/books/${book.id}/epub` }
          ],
          source: this.name,
          publicDomain: true,
        };
      });

      return {
        results,
        nextPageToken: data.has_next ? String(page + 1) : undefined
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
