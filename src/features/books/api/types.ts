export interface BookSearchResult {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  language?: string;
  description?: string;
  formats: {
    type: 'pdf' | 'epub';
    downloadUrl: string;
    sizeBytes?: number;
  }[];
  source: string;
  publicDomain: boolean;
}

export interface ProviderResponse {
  results: BookSearchResult[];
  nextPageToken?: string;
  total?: number;
}
