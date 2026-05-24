export interface BookSearchResult {
  id: string;
  title: string;
  author: string;
  authors?: string;
  coverUrl?: string;
  language?: string;
  description?: string;
  formats: {
    type: "pdf" | "epub";
    downloadUrl: string;
    sizeBytes?: number;
  }[];
  source: string;
  provider?: string;
  publicDomain: boolean;
  downloadable?: boolean;
  downloadUrl?: string;
}

export interface ProviderResponse {
  results: BookSearchResult[];
  nextPageToken?: string;
  total?: number;
}

export interface IBookProvider {
  name: string;
  search(query: string, page?: number): Promise<ProviderResponse>;
  getBookDetails(id: string): Promise<BookSearchResult | null>;
}
