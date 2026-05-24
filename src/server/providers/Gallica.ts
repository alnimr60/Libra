import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class GallicaProvider implements IBookProvider {
  name = "Gallica";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://gallica.bnf.fr/SRU`;
      // SRU API query
      const sruQuery = `(dc.title all "${query}" or dc.creator all "${query}") and (dc.type adj "monographie" or dc.type adj "printed serial")`;
      const { data } = await axios.get<string>(url, {
        params: {
          operation: "searchRetrieve",
          version: "1.2",
          query: sruQuery,
          startRecord: (page - 1) * 15 + 1,
          maximumRecords: 15,
        },
        timeout: 15000,
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      const results: BookSearchResult[] = [];
      const recordRegex = /<dc:identifier>(https:\/\/gallica\.bnf\.fr\/ark:\/\w+\/\w+)<\/dc:identifier>.*?<dc:title>(.*?)<\/dc:title>.*?<dc:creator>(.*?)<\/dc:creator>/gs;
      
      let match;
      while ((match = recordRegex.exec(data)) !== null) {
        const idUrl = match[1];
        const id = idUrl.split("/ark:/")[1]; // e.g. 12148/bpt6k12345
        const title = match[2].trim();
        const author = match[3].trim();

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);

        const formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [
          { type: "pdf", downloadUrl: `${idUrl}/f1.pdf` },
          { type: "epub", downloadUrl: `${idUrl}.epub` } // Gallica has generic epub endpoints
        ];

        results.push({
          id,
          title,
          author,
          authors: author,
          language: "fr",
          coverUrl: `${idUrl}/f1.highres`,
          formats,
          source: this.name,
          provider: this.name,
          publicDomain: true,
          downloadable: true,
        });

        console.log(`[PROVIDER_BINARY_RESOLVED] provider=${this.name} title="${title}" mimetype="application/pdf"`);
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
