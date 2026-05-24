import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class DOABProvider implements IBookProvider {
  name = "DOAB";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://directory.doabooks.org/rest/search`;
      const { data } = await axios.get<any>(url, {
        params: { query: query, expand: "metadata,bitstreams", limit: 20, offset: (page - 1) * 20 },
        timeout: 10000,
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      if (!data || !data.length) return { results: [] };

      const results: BookSearchResult[] = data.map((item: any) => {
        let title = "Unknown";
        let author = "Unknown";
        let language = "en";
        let externalUrl = `https://directory.doabooks.org/handle/${item.handle}`;
        
        if (item.metadata) {
          const tMatch = item.metadata.find((m: any) => m.key === "dc.title");
          if (tMatch) title = tMatch.value;
          
          const aMatch = item.metadata.find((m: any) => m.key === "dc.contributor.author");
          if (aMatch) author = aMatch.value;

          const lMatch = item.metadata.find((m: any) => m.key === "dc.language.iso");
          if (lMatch) language = lMatch.value;
        }

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${title}"`);

        const formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];
        let downloadable = false;

        if (item.bitstreams) {
           for (const bit of item.bitstreams) {
             if (bit.bundleName === "ORIGINAL") {
               const lowerName = bit.name.toLowerCase();
               if (lowerName.endsWith(".pdf")) {
                 formats.push({ type: "pdf", downloadUrl: `https://directory.doabooks.org${bit.retrieveLink}` });
                 downloadable = true;
               } else if (lowerName.endsWith(".epub")) {
                 formats.push({ type: "epub", downloadUrl: `https://directory.doabooks.org${bit.retrieveLink}` });
                 downloadable = true;
               }
             }
           }
        }

        if (downloadable && formats.length > 0) {
           console.log(`[PROVIDER_BINARY_RESOLVED] provider=${this.name} title="${title}" mimetype="application/${formats[0].type}"`);
        } else {
           console.log(`[PROVIDER_EXTERNAL_ONLY] provider=${this.name} title="${title}" reason="No direct download links found"`);
        }

        return {
          id: item.uuid || item.handle,
          title,
          author,
          authors: author,
          language,
          formats,
          source: this.name,
          provider: this.name,
          publicDomain: true, // open access
          downloadable,
          downloadUrl: externalUrl,
        };
      });

      return {
        results,
        nextPageToken: data.length === 20 ? String(page + 1) : undefined,
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
