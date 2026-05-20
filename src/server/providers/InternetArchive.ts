import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class InternetArchiveProvider implements IBookProvider {
  name = "InternetArchive";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    const rows = 20;
    const url = `https://archive.org/advancedsearch.php`;
    const params = {
      q: `(${query}) AND mediatype:(texts) AND -access-restricted-item:true`,
      fl: "identifier,title,creator,description,language,publicdate",
      sort: "downloads desc",
      rows,
      page,
      output: "json",
    };

    try {
      const { data } = await axios.get<any>(url, { params, timeout: 5000 });
      if (!data?.response?.docs) {
        return { results: [], total: 0 };
      }

      const docs = data.response.docs;
      const results: BookSearchResult[] = await Promise.all(docs.map(async (doc: any): Promise<BookSearchResult> => {
        // We can do a quick check to see if common files exist without a full metadata fetch if we want to be super fast,
        // but a full metadata fetch ensures no "fabrication".
        // To keep search fast, we'll do metadata fetches in parallel.
        const id = doc.identifier;
        let formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];
        
        try {
          const metaRes = await axios.get<any>(`https://archive.org/metadata/${id}`, { timeout: 3000 });
          const files = metaRes.data?.files || [];
          
          const pdfFile = files.find((f: any) => 
            f.name.toLowerCase().endsWith('.pdf') && 
            !f.name.toLowerCase().includes('_text.pdf') &&
            !f.name.toLowerCase().includes('_bw.pdf')
          ) || files.find((f: any) => f.name.toLowerCase().endsWith('.pdf'));

          const epubFile = files.find((f: any) => f.name.toLowerCase().endsWith('.epub'));

          if (pdfFile) {
            formats.push({ type: "pdf", downloadUrl: `https://archive.org/download/${id}/${pdfFile.name}` });
          }
          if (epubFile) {
            formats.push({ type: "epub", downloadUrl: `https://archive.org/download/${id}/${epubFile.name}` });
          }
        } catch (e) {
          console.warn(`[IA_SEARCH_METADATA_FAIL] id=${id}`, e.message);
          // If metadata fetch fails, we return no formats (Verified = 0)
        }

        return {
          id: doc.identifier,
          title: doc.title || "Unknown Title",
          author: Array.isArray(doc.creator) ? doc.creator.join(", ") : doc.creator || "Unknown Author",
          coverUrl: `https://archive.org/services/img/${doc.identifier}`,
          language: Array.isArray(doc.language) ? doc.language[0] : doc.language,
          description: Array.isArray(doc.description) ? doc.description[0] : doc.description,
          source: this.name,
          publicDomain: true,
          formats
        };
      }));

      return {
        results,
        total: data.response.numFound
      };
    } catch (e) {
      console.error("InternetArchive error:", e);
      return { results: [] };
    }
  }

  async getBookDetails(id: string): Promise<BookSearchResult | null> {
    const url = `https://archive.org/metadata/${id}`;
    try {
      const { data } = await axios.get<any>(url, { timeout: 8000 });
      if (!data || !data.metadata) return null;

      const doc = data.metadata;
      const files = data.files || [];
      
      console.log(`[IA_METADATA_FETCH] id=${id} files_count=${files.length}`);
      
      // Filter out files that are usually metadata or sidecars
      const bookFiles = files.filter((f: any) => {
        const name = f.name.toLowerCase();
        return name.endsWith('.pdf') || name.endsWith('.epub');
      });

      console.log(`[IA_BOOK_FILES]`, bookFiles.map((f: any) => ({ name: f.name, format: f.format, size: f.size })));

      const formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];

      // Find the best PDF and EPUB files from the actual file list
      const pdfFile = files.find((f: any) => 
        f.name.toLowerCase().endsWith('.pdf') && 
        !f.name.toLowerCase().includes('_text.pdf') &&
        !f.name.toLowerCase().includes('_bw.pdf')
      ) || files.find((f: any) => f.name.toLowerCase().endsWith('.pdf'));

      const epubFile = files.find((f: any) => f.name.toLowerCase().endsWith('.epub'));

      if (pdfFile) {
        formats.push({
          type: "pdf",
          downloadUrl: `https://archive.org/download/${id}/${pdfFile.name}`,
        });
      }
      if (epubFile) {
        formats.push({
          type: "epub",
          downloadUrl: `https://archive.org/download/${id}/${epubFile.name}`,
        });
      }

      // Check for restricted status
      const isRestricted = doc['access-restricted-item'] === 'true' || data.is_dark === true;
      if (isRestricted && formats.length > 0) {
        console.warn(`[IA_RESTRICTED_ITEM] Item ${id} is restricted. Downloads might fail.`);
      }

      console.log(`[IA_RESOLVE_FINAL] id=${id} pdf=${pdfFile?.name} epub=${epubFile?.name} formats=${formats.length}`);

      return {
        id: doc.identifier,
        title: doc.title || "Unknown Title",
        author: Array.isArray(doc.creator) ? doc.creator.join(", ") : doc.creator || "Unknown Author",
        coverUrl: `https://archive.org/services/img/${doc.identifier}`,
        language: Array.isArray(doc.language) ? doc.language[0] : doc.language,
        description: Array.isArray(doc.description) ? doc.description[0] : doc.description,
        source: this.name,
        publicDomain: true,
        formats
      }
    } catch (e) {
      console.error("InternetArchive error:", e);
      return null;
    }
  }
}
