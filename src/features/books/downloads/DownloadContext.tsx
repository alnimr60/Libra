import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { BookSearchResult } from '../api/types';
import { apiClient } from '../api/apiClient';
import { v4 as uuidv4 } from 'uuid';
import { Book } from '../../../types';

export interface DownloadState {
  id: string; // The result ID
  bookMetadata: BookSearchResult;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number; // 0-100
  error?: string;
  format: 'pdf' | 'epub';
  downloadUrl?: string; // Fallback external URL
}

interface DownloadContextType {
  downloads: Record<string, DownloadState>;
  startDownload: (book: BookSearchResult, format: 'pdf' | 'epub') => void;
  cancelDownload: (id: string) => void;
  removeDownload: (id: string) => void;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export const useDownloads = () => {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloads must be used within a DownloadProvider');
  return ctx;
};

interface DownloadProviderProps {
  children: ReactNode;
  onBookDownloaded: (book: Book) => void;
}

export const DownloadProvider = ({ children, onBookDownloaded }: DownloadProviderProps) => {
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  // Persist/restore downloads from IDB
  useEffect(() => {
    const restoreDownloads = async () => {
      const saved = await get<Record<string, DownloadState>>('saved-downloads');
      if (saved) setDownloads(saved);
      
      // CACHE BUSTING: Clean up corrupted files one-time on load
      const hasCleaned = await get('has-cleaned-corrupted-v2');
      if (!hasCleaned) {
        console.log("[MAINTENANCE] Scanning library for corrupted files...");
        try {
          // Get all saved books in the library (if they are stored in 'saved-books' or similar)
          // Actually, let's look at how books are stored in the library.
          const books = await get<Book[]>('library-books');
          if (books) {
            let corruptedCount = 0;
            const validBooks: Book[] = [];
            
            for (const book of books) {
              const fileData = await get<ArrayBuffer>(book.fileDataId);
              if (fileData) {
                const head = new Uint8Array(fileData.slice(0, 5));
                const headText = Array.from(head).map(b => String.fromCharCode(b)).join('');
                
                const isPdf = book.fileName.toLowerCase().endsWith('.pdf');
                const isEpub = book.fileName.toLowerCase().endsWith('.epub');
                
                const isValid = (isPdf && headText.startsWith('%PDF-')) || (isEpub && headText.startsWith('PK'));
                
                if (!isValid) {
                  console.warn(`[MAINTENANCE] Deleting corrupted book: ${book.title} (${book.id})`);
                  // We don't delete from IDB immediately here to be safe, just filter out of library
                  corruptedCount++;
                  continue;
                }
              }
              validBooks.push(book);
            }
            
            if (corruptedCount > 0) {
              console.log(`[MAINTENANCE] Removed ${corruptedCount} corrupted books.`);
              set('library-books', validBooks);
              onBookDownloaded({} as Book); // Trigger a refresh if possible (hacky)
            }
          }
          await set('has-cleaned-corrupted-v2', true);
        } catch (e) {
          console.error("[MAINTENANCE_ERROR]", e);
        }
      }
    };
    restoreDownloads();
  }, []);

  useEffect(() => {
    set('saved-downloads', downloads).catch(console.error);
  }, [downloads]);

  // Using a map to track active AbortControllers
  const activeDownloads = useRef<Record<string, AbortController>>({});

  const startDownload = async (book: BookSearchResult, format: 'pdf' | 'epub') => {
    if (downloads[book.id]?.status === 'downloading') return;

    const controller = new AbortController();
    activeDownloads.current[book.id] = controller;

    setDownloads(prev => ({
      ...prev,
      [book.id]: {
        id: book.id,
        bookMetadata: book,
        status: 'pending',
        progress: 0,
        format,
        downloadUrl: book.formats.find(f => f.type === format)?.downloadUrl
      }
    }));

    const traceId = crypto.randomUUID();
    const proxyUrl = `${apiClient.getDownloadUrl(book.source, book.id, format)}&traceId=${traceId}`;
    
    try {
      console.log(`[TRACE][${traceId}][FRONTEND_START]`, proxyUrl);
      
      const response = await fetch(proxyUrl, { signal: controller.signal });
      
      if (!response.ok) {
        let errorMsg = 'Download failed';
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorData.error || errorMsg;
        } catch (e) {
          errorMsg = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      console.log(`[TRACE][${traceId}][FRONTEND_RESPONSE_OK]`, {
        status: response.status,
        type: response.headers.get('Content-Type'),
        length: response.headers.get('Content-Length')
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to initialize download stream");

      const contentLength = +(response.headers.get('Content-Length') || 0);
      let receivedLength = 0;
      let chunks = [];

      while(true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        if (contentLength > 0) {
           const progress = (receivedLength / contentLength) * 100;
           setDownloads(prev => ({
              ...prev,
              [book.id]: { ...prev[book.id], progress, status: 'downloading' }
            }));
        }
      }

      console.log(`[TRACE][${traceId}][IMPORT_START]`, { size: receivedLength });

      // Concatenate chunks
      let chunksAll = new Uint8Array(receivedLength);
      let position = 0;
      for(let chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
      }
      
      const arrayBuffer = chunksAll.buffer;
      const blob = new Blob([arrayBuffer]);

      // 4. MAGIC BYTE VERIFICATION
      console.log(`[TRACE][${traceId}][VERIFYING] size=${blob.size} format=${format}`);
      
      if (blob.size < 100) {
        throw new Error("Downloaded file is too small to be a valid book.");
      }

      const firstBytes = new Uint8Array(arrayBuffer.slice(0, 10));
      const firstChars = Array.from(firstBytes).map(b => String.fromCharCode(b)).join('');
      
      if (format === 'pdf') {
        if (!firstChars.startsWith('%PDF-')) {
          console.error(`[TRACE][${traceId}][CORRUPTION_DETECTED] Expected PDF magic bytes, got:`, firstChars.substring(0, 5));
          throw new Error("Invalid file content: Not a valid PDF document.");
        }
      } else if (format === 'epub') {
        if (!firstChars.startsWith('PK')) {
          console.error(`[TRACE][${traceId}][CORRUPTION_DETECTED] Expected ZIP/EPUB magic bytes, got:`, firstChars.substring(0, 2));
          throw new Error("Invalid file content: Not a valid EPUB (ZIP) archive.");
        }
      }

      // Generate a new unique ID for the library
      const newBookId = uuidv4();
      const fileDataId = `file-${newBookId}`;
      
      console.log(`[TRACE][${traceId}][STORING] idbKey=${fileDataId}`);
      // Store in IndexedDB
      await set(fileDataId, arrayBuffer);
      
      const newBook: Book = {
        id: newBookId,
        title: book.title,
        author: book.author || 'Unknown',
        coverUrl: book.coverUrl,
        fileDataId,
        fileName: `${book.title}.${format}`,
        status: 'To-Be-Read',
        addedAt: new Date().toISOString(),
        currentPage: 1,
        totalPages: 100,
        tags: [],
        readingDirection: 'ltr'
      };

      onBookDownloaded(newBook);

      setDownloads(prev => ({
        ...prev,
        [book.id]: { ...prev[book.id], status: 'completed', progress: 100 }
      }));

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Download aborted');
        return;
      }
      console.error("[DOWNLOAD_IMPORT_FAIL]", error);
      
      setDownloads(prev => ({
        ...prev,
        [book.id]: { 
          ...prev[book.id], 
          status: 'error', 
          error: error.message,
          // If we had a downloadUrl from a previous step, keep it for fallback
          downloadUrl: prev[book.id]?.downloadUrl 
        }
      }));
    } finally {
      delete activeDownloads.current[book.id];
    }
  };

  const cancelDownload = (id: string) => {
    if (activeDownloads.current[id]) {
      activeDownloads.current[id].abort();
    }
    removeDownload(id);
  };

  const removeDownload = (id: string) => {
    setDownloads(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  return (
    <DownloadContext.Provider value={{ downloads, startDownload, cancelDownload, removeDownload }}>
      {children}
    </DownloadContext.Provider>
  );
};
