import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class ProjectGutenbergProvider implements IBookProvider {
  name = "ProjectGutenberg";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    const url = `https://gutendex.com/books`;
    try {
      const { data } = await axios.get<any>(url, { params: { search: query, page }, timeout: 15000 });
      if (!data || !data.results) return { results: [] };

      const results = this.mapResults(data.results);

      return {
        results,
        total: data.count,
        nextPageToken: data.next ? String(page + 1) : undefined
      };
    } catch (e) {
      console.error("ProjectGutenberg error:", e);
      return { results: [] };
    }
  }

  async getBookDetails(id: string): Promise<BookSearchResult | null> {
    const url = `https://gutendex.com/books/${id}`;
    try {
      const { data } = await axios.get<any>(url, { timeout: 5000 });
      if (!data) return null;

      const results = this.mapResults([data]);
      return results.length > 0 ? results[0] : null;
    } catch (e) {
      console.error("ProjectGutenberg error:", e);
      return null;
    }
  }

  private mapResults(books: any[]): BookSearchResult[] {
    return books.map((book: any): BookSearchResult => {
      const formats: { type: "pdf" | "epub"; downloadUrl: string }[] = [];
      
      // Gutenberg specific: prefer epub images, then regular epub
      const epubImages = book.formats["application/epub+zip"];
      const epubNoImages = book.formats["application/epub+zip; charset=utf-8"]; // sometimes present
      
      if (epubImages) {
        formats.push({ type: "epub", downloadUrl: epubImages });
      } else if (epubNoImages) {
        formats.push({ type: "epub", downloadUrl: epubNoImages });
      }
      
      const pdf = book.formats["application/pdf"];
      // Gutenberg rarely has PDFs directly in the main formats, but just in case
      if (pdf) {
        formats.push({ type: "pdf", downloadUrl: pdf });
      }

      return {
        id: String(book.id),
        title: book.title,
        author: book.authors.map((a: any) => a.name).join(", "),
        coverUrl: book.formats["image/jpeg"],
        language: book.languages ? book.languages[0] : undefined,
        formats,
        source: this.name,
        publicDomain: true,
      };
    });
  }
}