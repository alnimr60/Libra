import axios from "axios";
import { BookSearchResult, IBookProvider, ProviderResponse } from "../types";

export class StandardEbooksProvider implements IBookProvider {
  name = "StandardEbooks";

  async search(query: string, page: number = 1): Promise<ProviderResponse> {
    const url = `https://standardebooks.org/opds/all`;
    try {
      const { data } = await axios.get<any>(url, { params: { query }, timeout: 5000 });
      const results = this.parseOpds(data);
      return { results, total: results.length };
    } catch (e) {
      console.error("StandardEbooks error:", e);
      return { results: [] };
    }
  }

  async getBookDetails(id: string): Promise<BookSearchResult | null> {
    const url = `https://standardebooks.org/ebooks/${id}`;
    
    return {
      id,
      title: id.split("/")[1].replace(/-/g, " "),
      author: id.split("/")[0].replace(/-/g, " "),
      formats: [
        { type: "epub", downloadUrl: `https://standardebooks.org/ebooks/${id}/downloads/${id.replace(/\//g, "_")}.epub?source=feed` }
      ],
      source: this.name,
      publicDomain: true,
    };
  }

  private parseOpds(xml: string): BookSearchResult[] {
    const results: BookSearchResult[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      
      const titleMatch = /<title>([^<]+)/.exec(entry);
      const authorMatch = /<name>([^<]+)/.exec(entry);
      const idMatch = /<id>([^<]+)/.exec(entry);
      
      if (titleMatch && idMatch) {
        const idPath = idMatch[1].replace("https://standardebooks.org/ebooks/", "");
        
        let epubUrl = "";
        const epubMatch = /<link href="([^"]+\.epub(?:\?[^"]*)?)"[^>]+type="application\/epub\+zip"/.exec(entry);
        if (epubMatch) {
          epubUrl = epubMatch[1].startsWith("http") ? epubMatch[1] : "https://standardebooks.org" + epubMatch[1];
        } else {
           epubUrl = `https://standardebooks.org/ebooks/${idPath}/downloads/${idPath.replace(/\//g, "_")}.epub?source=feed`;
        }
        
        results.push({
          id: idPath,
          title: titleMatch[1],
          author: authorMatch ? authorMatch[1] : "Unknown",
          formats: [
            { type: "epub", downloadUrl: epubUrl }
          ],
          source: this.name,
          publicDomain: true
        });
      }
    }
    return results;
  }
}