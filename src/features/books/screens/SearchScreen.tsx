import React, { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, Loader2, BookOpen, AlertCircle, Download, CheckCircle, FileText } from 'lucide-react';
import { apiClient } from '../api/apiClient';
import { useDownloads } from '../downloads/DownloadContext';
import { cn } from '../../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { BookSearchResult } from '../api/types';
import { useDebounce } from '../../../hooks/useDebounce';

interface SearchScreenProps {
  isRTL: boolean;
  t: any;
}

export default function SearchScreen({ isRTL, t }: SearchScreenProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  const { downloads, startDownload } = useDownloads();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['bookSearch', debouncedSearch],
    queryFn: ({ pageParam = 1 }) => apiClient.search(debouncedSearch, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage && lastPage.nextPageToken ? parseInt(lastPage.nextPageToken) : undefined,
    enabled: debouncedSearch.length > 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 100;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-12 pb-4 bg-zinc-50 flex-shrink-0 relative z-10 dark:bg-zinc-950">
        <h1 className={cn("text-3xl font-serif tracking-tight text-zinc-900 dark:text-zinc-50 mb-6", isRTL ? "font-bold" : "font-medium")}>
          Discover
        </h1>
        
        <div className="relative group">
          <Search className={cn("absolute top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-orange-500 transition-colors", isRTL ? "right-4" : "left-4")} />
          <input
            type="text"
            placeholder="Search titles, authors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "w-full h-14 bg-zinc-100 dark:bg-zinc-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-base transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600",
              isRTL ? "pr-12 pl-4 text-right" : "pl-12 pr-4 text-left"
            )}
            dir={isRTL ? "rtl" : "ltr"}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-6" onScroll={handleScroll}>
        {debouncedSearch.length <= 2 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-600 opacity-60">
            <BookOpen className="w-16 h-16 mb-4 stroke-1" />
            <p className="font-mono text-xs uppercase tracking-widest text-center">Search for new adventures</p>
          </div>
        ) : status === 'pending' ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="font-mono text-xs uppercase tracking-widest">Searching libraries...</p>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-400 px-6">
            <AlertCircle className="w-10 h-10 mb-4" />
            <p className="font-mono text-xs uppercase tracking-widest text-center">Failed to fetch results.</p>
            <p className="font-mono text-[10px] text-zinc-500 mt-2 text-center">{error?.message}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.pages.map((page, i) => (
              <React.Fragment key={i}>
                {page.results.map((book: BookSearchResult) => (
                  <BookCard 
                    key={book.id} 
                    book={book} 
                    downloadState={downloads[book.id]} 
                    onDownload={(format) => startDownload(book, format)} 
                    isRTL={isRTL} 
                  />
                ))}
              </React.Fragment>
            ))}
            
            {isFetchingNextPage && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            )}
            
            {!hasNextPage && data.pages[0].results.length > 0 && (
              <div className="text-center py-10 text-zinc-400 font-mono text-[10px] uppercase tracking-widest opacity-60">
                End of Results
              </div>
            )}

            {data.pages[0].results.length === 0 && (
              <div className="text-center py-20 text-zinc-400 opacity-60">
                <p className="font-mono text-xs uppercase tracking-widest">No books found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const BookCard = React.memo(
  ({ book, downloadState, onDownload, isRTL }: { book: BookSearchResult, downloadState?: any, onDownload: (f: 'pdf' | 'epub') => void, isRTL: boolean }) => {
    
    const status = downloadState?.status;
    const progress = downloadState?.progress || 0;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-zinc-100 dark:border-white/5 flex gap-4 transition-all hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)]", isRTL ? "flex-row-reverse text-right" : "flex-row text-left")}
      >
        <div className="w-20 h-28 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden shadow-inner flex-shrink-0 relative flex items-center justify-center">
          {book.coverUrl ? (
            <img 
              src={book.coverUrl} 
              alt={book.title} 
              className="w-full h-full object-cover" 
              loading="lazy" 
              onError={(e: any) => {
                console.error("[IMAGE_FETCH_FAIL]", book.coverUrl);
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement.querySelector('.placeholder-icon').classList.remove('hidden');
              }}
            />
          ) : null}
          <BookOpen className={cn("placeholder-icon w-8 h-8 text-zinc-300 dark:text-zinc-600", book.coverUrl ? "hidden" : "")} />
        </div>
        
        <div className="flex-1 flex flex-col min-w-0 py-1">
          <h3 className="font-serif text-base font-medium leading-tight text-zinc-900 dark:text-zinc-50 line-clamp-2 mb-1">{book.title}</h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 truncate mb-3">{book.author}</p>
          
          <div className={cn("flex flex-wrap gap-2 mb-auto", isRTL ? "justify-start flex-row-reverse" : "")}>
            <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded flex items-center gap-1 text-zinc-500 font-mono text-[9px] uppercase tracking-wider">
              {book.source}
            </span>
            {book.publicDomain && (
              <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded font-mono text-[9px] uppercase tracking-wider">
                Public Domain
              </span>
            )}
          </div>

          <div className={cn("flex gap-2 mt-4", isRTL ? "flex-row-reverse" : "flex-row")}>
            {status === 'downloading' ? (
              <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 h-8 rounded-lg overflow-hidden relative">
                <div 
                  className="absolute top-0 bottom-0 left-0 bg-orange-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-zinc-900 dark:text-zinc-100 mix-blend-difference uppercase tracking-widest">
                  {Math.round(progress)}%
                </span>
              </div>
            ) : status === 'completed' ? (
              <div className="flex-1 h-8 bg-black dark:bg-white text-white dark:text-black rounded-lg flex items-center justify-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold">Added</span>
              </div>
            ) : status === 'error' ? (
              <div className="flex flex-col w-full gap-2 transition-all duration-300">
                <div className="flex-1 min-h-[2rem] px-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[9px] font-mono leading-tight text-red-600 dark:text-red-400 uppercase tracking-tight">
                    {downloadState.error || "Import failed"}
                  </span>
                </div>
                {downloadState.downloadUrl && (
                  <button
                    onClick={() => window.open(downloadState.downloadUrl, "_blank", "noopener,noreferrer")}
                    className="h-8 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold">Open externally</span>
                  </button>
                )}
                <button
                  onClick={() => onDownload(downloadState.format)}
                  className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  Retry Import
                </button>
              </div>
            ) : book.formats.length === 0 ? (
              <div className="flex-1 h-8 bg-zinc-50 dark:bg-zinc-900/50 border border-dashed border-zinc-200 dark:border-white/10 rounded-lg flex items-center justify-center gap-2">
                <AlertCircle className="w-3 h-3 text-zinc-400" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest leading-none">Unavailable for direct download</span>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                {book.formats.map(format => (
                  <button
                    key={format.type}
                    onClick={() => onDownload(format.type as 'pdf' | 'epub')}
                    className="flex-1 h-8 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold">{format.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  },
  (prev, next) => prev.book.id === next.book.id && prev.downloadState?.status === next.downloadState?.status && prev.downloadState?.progress === next.downloadState?.progress
);
