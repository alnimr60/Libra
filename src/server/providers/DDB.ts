import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class DDBProvider implements IBookProvider {
  name = "DDB";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://services.dnb.de/sru/dnb`;
      const { data } = await axios.get<string>(url, {
        params: {
          version: "1.1",
          operation: "searchRetrieve",
          query: `tit="${query}" OR per="${query}"`,
          startRecord: (page - 1) * 20 + 1,
          maximumRecords: 20,
        },
        timeout: 15000,
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      const results: BookSearchResult[] = [];
      // Parse SRU XML response (using regex for simplicity in this environment)
      const recordRegex = /<dc:title>(.*?)<\/dc:title>.*?<dc:creator>(.*?)<\/dc:creator>.*?<dc:identifier>(.*?)<\/dc:identifier>/gs;
      
      let match;
      while ((match = recordRegex.exec(data)) !== null) {
        const title = match[1].trim();
        const author = match[2].trim();
        const identifier = match[3].trim();
        
        // Extract ID from identifier if it's a DDB link
        const idMatch = identifier.match(/item\/([A-Z0-9]+)/);
        const id = idMatch ? idMatch[1] : identifier;

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);

        results.push({
          id,
          title,
          author,
          authors: author,
          language: "de",
          formats: [],
          source: this.name,
          provider: this.name,
          publicDomain: true,
          downloadable: false,
          downloadUrl: identifier.startsWith("http") ? identifier : `https://www.deutsche-digitale-bibliothek.de/item/${id}`
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
