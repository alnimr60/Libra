import React, { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Rendition, Book as EpubBook } from 'epubjs';
import { motion, AnimatePresence } from 'motion/react';
import { get } from 'idb-keyval';
import { cn } from '../../../lib/utils';
import { Book, Bookmark } from '../../../types';
import { useReader } from '../ReaderContext';
import ReaderShell from '../ReaderShell';

interface EPUBReaderProps {
  book: Book;
  initialPage?: number;
  onPageChange: (page: number, cfi?: string) => void;
  updateBook: (book: Book) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  subitems?: NavItem[];
}

export default function EPUBReader({ 
  book, 
  initialPage,
  onClose, 
  onPageChange, 
  updateBook,
  onUpdateBookmarks
}: EPUBReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [location, setLocation] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [totalPages, setTotalPages] = useState(100); // EPUB pages are dynamic, we use it for slider
  
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const { theme, fontSize, direction } = useReader();

  const themes = {
    light: { body: { color: "#18181b", background: "transparent" } },
    dark: { body: { color: "#d4d4d8", background: "transparent" } },
    sepia: { body: { color: "#433422", background: "transparent" } }
  };

  const applyTheme = useCallback((targetTheme: 'light' | 'dark' | 'sepia') => {
    const rendition = renditionRef.current;
    if (!rendition || !isReady) return;
    
    try {
      const config = themes[targetTheme];
      rendition.themes.register(targetTheme, config);
      rendition.themes.select(targetTheme);
      
      const isRTL = direction === 'rtl';
      rendition.themes.default({
        'body': {
          'padding': '0 40px !important',
          'font-family': 'Inter, system-ui, sans-serif !important',
          'line-height': '1.8 !important',
          'direction': isRTL ? 'rtl !important' : 'ltr !important',
          'text-align': 'justify !important'
        },
        'img': { 'max-width': '100% !important' }
      });
    } catch (e) {
      console.warn("[EPUB_THEME_ERROR]", e);
    }
  }, [direction, isReady]);

  useEffect(() => {
    let isCancelled = false;
    const initBook = async () => {
      try {
        if (!book.fileDataId) throw new Error('No file data ID found');
        const arrayBuffer = await get(book.fileDataId);
        if (!arrayBuffer) throw new Error('File not found in storage');
        
        const epubBook = ePub(arrayBuffer);
        bookRef.current = epubBook;
        
        const navigation = await epubBook.loaded.navigation;
        setToc(navigation.toc || []);

        if (viewerRef.current && !isCancelled) {
          const rendition = epubBook.renderTo(viewerRef.current, {
            width: '100%',
            height: '100%',
            flow: 'paginated',
            manager: 'default',
            spread: 'none'
          });
          
          renditionRef.current = rendition;
          await rendition.display(book.currentCfi);
          
          rendition.on('relocated', (location: any) => {
            if (isCancelled) return;
            setLocation(location);
            const perc = location.start.percentage || 0;
            setProgress(Math.round(perc * 100));
            const approxPage = Math.max(1, Math.ceil(perc * 100));
            onPageChange(approxPage, location.start.cfi);
          });

          setIsReady(true);
          setLoading(false);
        }
      } catch (e) {
        console.error('Error loading EPUB:', e);
        if (!isCancelled) setLoading(false);
      }
    };
    initBook();
    return () => {
      isCancelled = true;
      if (bookRef.current) bookRef.current.destroy();
    };
  }, [book.fileDataId]);

  useEffect(() => {
    if (renditionRef.current && isReady) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize, isReady]);

  useEffect(() => {
    if (isReady) applyTheme(theme);
  }, [theme, applyTheme, isReady]);

  const currentPage = Math.max(1, Math.ceil(progress));

  return (
    <ReaderShell
      book={book}
      onClose={onClose}
      currentPage={currentPage}
      totalPages={100}
      progress={progress}
      onPageChange={(p) => {}}
      onUpdateBookmarks={onUpdateBookmarks}
      onPrev={() => renditionRef.current?.prev()}
      onNext={() => renditionRef.current?.next()}
      onJumpToPage={(p) => {
        const perc = p / 100;
        const cfi = bookRef.current?.locations.cfiFromPercentage(perc);
        if (cfi) renditionRef.current?.display(cfi);
        else renditionRef.current?.display(`epubcfi(/6/2[cover]!/4/2/2[cover-image])`); 
      }}
      title={book.title}
      onToggleNav={() => {}}
    >
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-mono text-[10px] tracking-widest uppercase opacity-40">Loading EPUB Engine</p>
          </div>
        )}
        <motion.div 
          key={location?.start?.cfi || 'initial'}
          initial={{ x: direction === 'ltr' ? 50 : -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="w-full h-full"
        >
          <div 
            ref={viewerRef} 
            className={cn(
              "w-full h-full max-w-2xl mx-auto transition-opacity duration-700",
              loading ? "opacity-0" : "opacity-100"
            )} 
          />
        </motion.div>
      </div>
    </ReaderShell>
  );
}
