import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class OpenLibraryProvider implements IBookProvider {
  name = "OpenLibrary";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    const limit = 20;
    const url = `https://openlibrary.org/search.json`;
    try {
      const { data } = await axios.get<any>(url, { 
        params: { q: query, limit, page, has_fulltext: "true" }, 
        timeout: 5000 
      });
      
      if (!data || !data.docs) return { results: [] };

      const results = await this.mapResults(data.docs);

      return {
        results,
        total: data.numFound,
      };
    } catch (e) {
      console.error("OpenLibrary error:", e);
      return { results: [] };
    }
  }

  async getBookDetails(id: string): Promise<BookSearchResult | null> {
    const url = `https://openlibrary.org/search.json`;
    try {
      console.log(`[OPEN_LIBRARY_METADATA_FETCH] id=${id}`);
      const query = `key:"/works/${id}" OR key:"/books/${id}" OR key:"/editions/${id}"`;
      const { data } = await axios.get<any>(url, { params: { q: query, limit: 1 }, timeout: 5000 });
      
      if (!data || !data.docs || data.docs.length === 0) {
        const fallbackRes = await axios.get<any>(url, { params: { q: id, limit: 1 }, timeout: 5000 });
        if (!fallbackRes.data || !fallbackRes.data.docs || fallbackRes.data.docs.length === 0) {
          return null;
        }
        data.docs = fallbackRes.data.docs;
      }

      const doc = data.docs[0];
      const iaIds = doc.ia;
      let formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];

      if (iaIds && iaIds.length > 0) {
        formats = await this.resolveIAFormats(iaIds[0]);
      }

      const results = await this.mapResults(data.docs);
      if (results.length > 0) {
        const book = results[0];
        // Override formats with resolved ones
        if (formats.length > 0) {
          book.formats = formats;
        }
        return book;
      }
      return null;
    } catch (e) {
      console.error("OpenLibrary error:", e);
      return null;
    }
  }

  private async resolveIAFormats(iaId: string): Promise<{ type: "pdf" | "epub"; downloadUrl: string }[]> {
    try {
      const { data } = await axios.get<any>(`https://archive.org/metadata/${iaId}`, { timeout: 5000 });
      if (!data || !data.files) return [];
      
      const formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];
      const files = data.files;

      const pdfFile = files.find((f: any) => 
        f.name.toLowerCase().endsWith('.pdf') && 
        !f.name.toLowerCase().includes('_text.pdf')
      ) || files.find((f: any) => f.name.toLowerCase().endsWith('.pdf'));

      const epubFile = files.find((f: any) => f.name.toLowerCase().endsWith('.epub'));

      if (pdfFile) {
        formats.push({ type: "pdf", downloadUrl: `https://archive.org/download/${iaId}/${pdfFile.name}` });
      }
      if (epubFile) {
        formats.push({ type: "epub", downloadUrl: `https://archive.org/download/${iaId}/${epubFile.name}` });
      }
      return formats;
    } catch (e) {
      console.error(`[OL_IA_RESOLVE_FAIL] iaId=${iaId}`, e);
      return [];
    }
  }

  private async mapResults(docs: any[]): Promise<BookSearchResult[]> {
    const results = await Promise.all(docs.map(async (doc: any): Promise<BookSearchResult | null> => {
      const iaId = doc.ia ? doc.ia[0] : null;
      let formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];
      
      if (iaId) {
        const canDownload = doc.public_scan_b || doc.has_fulltext || (doc.availability && doc.availability.status === 'open');
        if (canDownload) {
          // Resolve actual filenames from IA metadata to avoid fabrication
          try {
            const metaRes = await axios.get<any>(`https://archive.org/metadata/${iaId}`, { timeout: 3000 });
            const files = metaRes.data?.files || [];
            
            const pdfFile = files.find((f: any) => 
              f.name.toLowerCase().endsWith('.pdf') && 
              !f.name.toLowerCase().includes('_text.pdf') &&
              !f.name.toLowerCase().includes('_bw.pdf')
            ) || files.find((f: any) => f.name.toLowerCase().endsWith('.pdf'));

            const epubFile = files.find((f: any) => f.name.toLowerCase().endsWith('.epub'));

            if (pdfFile) {
              formats.push({ type: "pdf", downloadUrl: `https://archive.org/download/${iaId}/${pdfFile.name}` });
            }
            if (epubFile) {
              formats.push({ type: "epub", downloadUrl: `https://archive.org/download/${iaId}/${epubFile.name}` });
            }
          } catch (e) {
            console.warn(`[OL_SEARCH_IA_METADATA_FAIL] iaId=${iaId}`, e.message);
          }
        }
      }

      const key = doc.key ? doc.key.replace("/works/", "").replace("/books/", "").replace("/editions/", "") : null;
      if (!key) return null;

      return {
        id: key,
        title: doc.title,
        author: Array.isArray(doc.author_name) ? doc.author_name.join(", ") : "Unknown",
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
        language: Array.isArray(doc.language) ? doc.language[0] : undefined,
        formats,
        source: this.name,
        publicDomain: doc.public_scan_b || false,
      };
    }));

    return results.filter((result): result is BookSearchResult => result !== null);
  }
}
