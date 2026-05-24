import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class DDBProvider implements IBookProvider {
  name = "DDB";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://api.deutsche-digitale-bibliothek.de/search`;
      const { data } = await axios.get<any>(url, {
        params: {
          query: `title:(${query}) OR person:(${query})`,
          offset: (page - 1) * 20,
          rows: 20,
        },
        timeout: 10000,
        headers: {
          // A valid API key would be required in reality
          "Authorization": `Bearer DUMMY_API_KEY`
        }
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      if (!data || !data.results || !data.results.docs) return { results: [] };

      const results: BookSearchResult[] = data.results.docs.map((book: any) => {
        const title = book.title || "Unbekannter Titel";
        const author = book.subtitle || ""; // Usually author in subtitle
        
        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);
        
        // If external links are present
        const hasExternal = book.providerUrl;

        if (!hasExternal) {
           console.log(`[PROVIDER_EXTERNAL_ONLY] provider=${this.name} title="${title}" reason="Only metadata available"`);
        }

        return {
          id: String(book.id),
          title,
          author,
          authors: author,
          language: "de",
          formats: [],
          source: this.name,
          provider: this.name,
          publicDomain: true,
          downloadable: false,
          downloadUrl: book.providerUrl || `https://www.deutsche-digitale-bibliothek.de/item/${book.id}`
        };
      });

      return {
        results,
        nextPageToken: data.results.docs.length > 0 ? String(page + 1) : undefined,
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
