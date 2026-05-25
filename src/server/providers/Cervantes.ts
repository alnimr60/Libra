import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class CervantesProvider implements IBookProvider {
  name = "CervantesVirtual";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://www.cervantesvirtual.com/buscador/`;
      const { data } = await axios.get<string>(url, {
        params: { q: query, 'p': page }, // Cervantes often uses p or page
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      const results: BookSearchResult[] = [];
      // Example regex for Cervantes search results
      // <a href="/obra/el-quijote-1234">El Quijote</a> ... by <a ...>Cervantes</a>
      const bookRegex = /href="\/obra\/([^"]+)"[^>]*>([^<]+)<\/a>/gs;
      
      let match;
      while ((match = bookRegex.exec(data)) !== null) {
        const id = match[1];
        const title = match[2].trim();

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);

        results.push({
          id,
          title,
          author: "Unknown Author", // Scraper enhancement needed for authors
          authors: "Unknown Author",
          language: "es",
          formats: [
             { type: "pdf", downloadUrl: `https://www.cervantesvirtual.com/obra/${id}.pdf` }
          ],
          source: this.name,
          provider: this.name,
          publicDomain: true,
          downloadable: true,
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
