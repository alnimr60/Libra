import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class CervantesProvider implements IBookProvider {
  name = "CervantesVirtual";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://data.cervantesvirtual.com/api/v1/search`;
      const { data } = await axios.get<any>(url, {
        params: { q: query, page: page },
        timeout: 10000,
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      if (!data || !data.results) return { results: [] };

      const results: BookSearchResult[] = data.results.map((book: any) => {
        const title = book.title || "Unknown";
        const author = book.author || "Unknown";

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);

        return {
          id: String(book.id),
          title,
          author,
          authors: author,
          language: "es",
          formats: [
             { type: "epub", downloadUrl: `https://data.cervantesvirtual.com/manifestation/${book.id}/epub` },
             { type: "pdf", downloadUrl: `https://data.cervantesvirtual.com/manifestation/${book.id}/pdf` }
          ],
          source: this.name,
          provider: this.name,
          publicDomain: true,
          downloadable: true,
        };
      });

      return {
        results,
        nextPageToken: data.results.length > 0 ? String(page + 1) : undefined,
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
