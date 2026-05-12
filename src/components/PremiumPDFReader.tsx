import React, { useState, useEffect, useRef, useMemo } from 'react';
import { pdfjs } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Loader2, Plus, Minus, Bookmark as BookmarkIcon, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { get } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

interface PremiumPDFReaderProps {
  book: Book;
  initialPage: number;
  onPageChange: (page: number) => void;
  updateBook: (book: Book) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

export default function PremiumPDFReader({ book, initialPage, onPageChange, updateBook, onUpdateBookmarks, onClose }: PremiumPDFReaderProps) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'double'>(window.innerWidth > 1024 ? 'double' : 'single');
  
  // Camera State
  const scale = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const springScale = useSpring(scale, { stiffness: 300, damping: 30 });
  
  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);
  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;

  // Load PDF
  useEffect(() => {
    async function load() {
      try {
        if (!book.fileDataId) return;
        const data = await get(book.fileDataId);
        if (!data) return;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
        const doc = await loadingTask.promise;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPageIndex(viewMode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        setIsLoading(false);
      } catch (e) {
        console.error(e);
        setIsLoading(false);
      }
    }
    load();
  }, [book.fileDataId]);

  const handlePageChange = (newIdx: number) => {
    const idx = Math.max(0, Math.min(newIdx, totalSheets - 1));
    if (idx === pageIndex) return;
    setPageIndex(idx);
    const p = viewMode === 'double' ? (idx * 2) + 1 : idx + 1;
    onPageChange(Math.min(p, numPages));
    // Reset camera on page turn
    animate(scale, 1);
    animate(panX, 0);
    animate(panY, 0);
  };

  const toggleZoom = () => {
    if (scale.get() > 1.1) {
      animate(scale, 1);
      animate(panX, 0);
      animate(panY, 0);
    } else {
      animate(scale, 2.5);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col overflow-hidden touch-none select-none">
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            style={{ paddingTop: `${insets.top + 16}px` }}
            className="fixed top-0 left-0 right-0 z-[350] flex items-center justify-between p-4 bg-black/60 backdrop-blur-xl border-b border-white/5"
          >
            <button onClick={onClose} className="p-2 text-white"><X /></button>
            <div className="flex items-center gap-4 bg-white/10 px-4 py-1.5 rounded-full text-white font-mono text-sm">
              {pageIndex + 1} / {totalSheets}
            </div>
            <button 
              onClick={() => {
                if (isCurrentlyBookmarked) onUpdateBookmarks(bookmarks.filter(b => b.page !== currentPageNumber));
                else onUpdateBookmarks([...bookmarks, { id: Math.random().toString(36), page: currentPageNumber, createdAt: new Date().toISOString() }]);
              }}
              className={cn("p-2", isCurrentlyBookmarked ? "text-orange-500" : "text-white/40")}
            >
              <BookmarkIcon className="fill-current" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="flex-1 relative flex items-center justify-center"
        onClick={(e) => {
          if (e.detail === 2) toggleZoom();
          else setShowControls(!showControls);
        }}
      >
        {isLoading ? <Loader2 className="animate-spin text-white/20 w-10 h-10" /> : (
          <div className="w-full h-full relative overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.div 
                key={pageIndex}
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -300, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute inset-0 flex items-center justify-center p-4"
              >
                <motion.div 
                  style={{ scale: springScale, x: panX, y: panY }}
                  drag={scale.get() > 1.1}
                  dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
                  className="relative flex gap-4"
                >
                  {viewMode === 'double' ? (
                    <>
                      <PageRenderer pdf={pdf!} pageNum={(pageIndex * 2) + 1} numPages={numPages} />
                      <PageRenderer pdf={pdf!} pageNum={(pageIndex * 2) + 2} numPages={numPages} />
                    </>
                  ) : (
                    <PageRenderer pdf={pdf!} pageNum={pageIndex + 1} numPages={numPages} />
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
            
            {/* Peek Sliders */}
            <button 
              onClick={(e) => { e.stopPropagation(); handlePageChange(pageIndex - 1); }}
              className="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-center group"
            >
              <ChevronLeft className="text-white/0 group-hover:text-white/40 transition-colors w-8 h-8" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handlePageChange(pageIndex + 1); }}
              className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center group"
            >
              <ChevronRight className="text-white/0 group-hover:text-white/40 transition-colors w-8 h-8" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PageRenderer({ pdf, pageNum, numPages }: { pdf: pdfjs.PDFDocumentProxy, pageNum: number, numPages: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (pageNum > numPages) return;
    async function render() {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 }); // High DPI by default
      
      // Calculate fit
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.8;
      const fitScale = Math.min(maxWidth / (viewport.width/2), maxHeight / (viewport.height/2));
      
      const w = (viewport.width / 2) * fitScale;
      const h = (viewport.height / 2) * fitScale;
      setDimensions({ w, h });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      }

      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        const textContent = await page.getTextContent();
        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerRef.current,
          viewport: page.getViewport({ scale: 2 * fitScale })
        });
        await textLayer.render();
      }
    }
    render();
  }, [pdf, pageNum]);

  if (pageNum > numPages) return null;

  return (
    <div 
      className="relative bg-white shadow-2xl overflow-hidden"
      style={{ width: dimensions.w, height: dimensions.h }}
    >
      <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />
      <div 
        ref={textLayerRef} 
        className="textLayer absolute inset-0 select-text z-10 opacity-0 hover:opacity-100 transition-opacity" 
        style={{ pointerEvents: 'auto' }}
      />
    </div>
  );
}
