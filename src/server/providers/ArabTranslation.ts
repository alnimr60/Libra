import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class ArabTranslationProvider implements IBookProvider {
  name = "ArabTranslation";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    try {
      const url = `https://caus.org.lb/api/search`;
      const { data } = await axios.get<any>(url, {
        params: { q: query, p: page },
        timeout: 10000,
      });

      console.log(`[PROVIDER_SEARCH] provider=${this.name} query="${query}"`);

      if (!data || !data.results) return { results: [] };

      const results: BookSearchResult[] = data.results.map((book: any) => {
        const normalizedTitle = (book.title || "").trim();
        const normalizedAuthor = (book.author || "").trim();
        const isDownloadable = !!book.public_download_url;

        console.log(`[PROVIDER_RESULT_NORMALIZED] provider=${this.name} title="${normalizedTitle}"`);

        if (!isDownloadable) {
           console.log(`[PROVIDER_EXTERNAL_ONLY] provider=${this.name} title="${normalizedTitle}" reason="No direct download available"`);
        } else {
           console.log(`[PROVIDER_BINARY_RESOLVED] provider=${this.name} title="${normalizedTitle}" mimetype="application/pdf"`);
        }

        return {
          id: String(book.id),
          title: normalizedTitle,
          author: normalizedAuthor,
          authors: normalizedAuthor,
          language: "ar",
          coverUrl: book.cover_url,
          formats: isDownloadable && book.public_download_url ? [
            { type: "pdf", downloadUrl: book.public_download_url }
          ] : [],
          source: this.name,
          provider: this.name,
          publicDomain: isDownloadable,
          downloadable: isDownloadable,
          downloadUrl: book.external_url || `https://caus.org.lb/book/${book.id}`
        };
      });

      return {
        results,
        nextPageToken: data.next ? String(page + 1) : undefined,
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
