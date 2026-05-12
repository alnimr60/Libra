import React, { useState, useEffect, useRef, useMemo } from 'react';
import { pdfjs } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Loader2, Bookmark as BookmarkIcon, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { get } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

export default function PremiumPDFReader({ book, initialPage, onPageChange, onUpdateBookmarks, onClose }: any) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'double'>(window.innerWidth > 1024 ? 'double' : 'single');
  
  // Camera State
  const zoom = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const smoothZoom = useSpring(zoom, { stiffness: 200, damping: 30 });
  const smoothPanX = useSpring(panX, { stiffness: 200, damping: 30 });
  const smoothPanY = useSpring(panY, { stiffness: 200, damping: 30 });
  
  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);
  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;

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
    // Reset camera
    zoom.set(1);
    panX.set(0);
    panY.set(0);
  };

  const toggleZoom = () => {
    if (zoom.get() > 1.1) {
      animate(zoom, 1);
      animate(panX, 0);
      animate(panY, 0);
    } else {
      animate(zoom, 2.5);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-[#0A0A0A] flex flex-col overflow-hidden touch-none select-none">
      {/* HUD */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            style={{ paddingTop: `${insets.top + 16}px` }}
            className="fixed top-0 left-0 right-0 z-[350] flex items-center justify-between p-6 bg-black/40 backdrop-blur-2xl border-b border-white/5"
          >
            <button onClick={onClose} className="p-3 bg-white/5 rounded-full text-white/60 hover:text-white transition-colors"><X /></button>
            <div className="flex flex-col items-center">
               <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] mb-1">{book.title}</span>
               <div className="px-6 py-1 bg-white/10 rounded-full text-white font-serif text-sm">
                 {pageIndex + 1} <span className="mx-2 opacity-20">/</span> {totalSheets}
               </div>
            </div>
            <button 
              onClick={() => {
                if (isCurrentlyBookmarked) onUpdateBookmarks(bookmarks.filter(b => b.page !== currentPageNumber));
                else onUpdateBookmarks([...bookmarks, { id: Math.random().toString(36), page: currentPageNumber, createdAt: new Date().toISOString() }]);
              }}
              className={cn("p-3 rounded-full transition-all", isCurrentlyBookmarked ? "text-orange-500 bg-orange-500/10" : "text-white/20 bg-white/5")}
            >
              <BookmarkIcon className={cn("w-5 h-5", isCurrentlyBookmarked && "fill-current")} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Viewport */}
      <div 
        className="flex-1 relative flex items-center justify-center cursor-grab active:cursor-grabbing"
        onDoubleClick={toggleZoom}
        onClick={() => setShowControls(!showControls)}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-orange-500 w-12 h-12" />
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Initialising Premium Engine...</span>
          </div>
        ) : (
          <div className="w-full h-full relative">
             <motion.div 
               className="w-full h-full flex items-center justify-center p-8"
               style={{ scale: smoothZoom, x: smoothPanX, y: smoothPanY }}
               drag={zoom.get() > 1.1}
               dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
               dragElastic={0.1}
             >
               <AnimatePresence mode="popLayout" initial={false}>
                 <motion.div 
                   key={pageIndex}
                   initial={{ x: 600, opacity: 0, scale: 0.95 }}
                   animate={{ x: 0, opacity: 1, scale: 1 }}
                   exit={{ x: -600, opacity: 0, scale: 0.95 }}
                   transition={{ type: 'spring', damping: 28, stiffness: 180 }}
                   className="flex gap-1 md:gap-8 items-center"
                 >
                    {/* The Main Pages */}
                    {viewMode === 'double' ? (
                      <>
                        <PageRenderer pdf={pdf!} pageNum={(pageIndex * 2) + 1} numPages={numPages} isZoomed={zoom.get() > 1.1} />
                        <PageRenderer pdf={pdf!} pageNum={(pageIndex * 2) + 2} numPages={numPages} isZoomed={zoom.get() > 1.1} />
                      </>
                    ) : (
                      <PageRenderer pdf={pdf!} pageNum={pageIndex + 1} numPages={numPages} isZoomed={zoom.get() > 1.1} />
                    )}
                 </motion.div>
               </AnimatePresence>
             </motion.div>

             {/* Navigation Overlay (Invisible zones for tapping) */}
             <div className="absolute inset-y-0 left-0 w-[15%] z-[320]" onClick={(e) => { e.stopPropagation(); handlePageChange(pageIndex - 1); }} />
             <div className="absolute inset-y-0 right-0 w-[15%] z-[320]" onClick={(e) => { e.stopPropagation(); handlePageChange(pageIndex + 1); }} />
          </div>
        )}
      </div>

      {/* Progress Bar HUD */}
      <AnimatePresence>
        {showControls && !isLoading && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            style={{ paddingBottom: `${insets.bottom + 24}px` }}
            className="fixed bottom-0 left-0 right-0 z-[350] px-12"
          >
            <div className="max-w-md mx-auto">
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mb-4">
                <motion.div 
                  className="h-full bg-orange-500" 
                  initial={{ width: 0 }}
                  animate={{ width: `${((pageIndex + 1) / totalSheets) * 100}%` }} 
                />
              </div>
              <div className="flex justify-between items-center text-[8px] font-mono text-white/30 uppercase tracking-widest">
                <span>Volume Start</span>
                <span className="text-white/60">{Math.round(((pageIndex + 1) / totalSheets) * 100)}% Complete</span>
                <span>The End</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PageRenderer({ pdf, pageNum, numPages, isZoomed }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (pageNum > numPages) return;
    let active = true;
    async function render() {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 3 }); // Forced High-Res 3.0x
      
      const maxWidth = window.innerWidth * 0.92;
      const maxHeight = window.innerHeight * 0.82;
      const fitScale = Math.min(maxWidth / (viewport.width/3), maxHeight / (viewport.height/3));
      
      const w = (viewport.width / 3) * fitScale;
      const h = (viewport.height / 3) * fitScale;
      if (active) setDim({ w, h });

      const canvas = canvasRef.current;
      if (canvas && active) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }

      if (textLayerRef.current && active) {
        textLayerRef.current.innerHTML = '';
        const textContent = await page.getTextContent();
        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerRef.current,
          viewport: page.getViewport({ scale: 3 * fitScale })
        });
        await textLayer.render();
      }
      if (active) setIsReady(true);
    }
    render();
    return () => { active = false; };
  }, [pdf, pageNum]);

  if (pageNum > numPages) return null;

  return (
    <div 
      className={cn(
        "relative bg-white shadow-[0_40px_100px_rgba(0,0,0,0.5)] transition-opacity duration-700",
        isReady ? "opacity-100" : "opacity-0"
      )}
      style={{ width: dim.w, height: dim.h }}
      onClick={(e) => e.stopPropagation()} // Prevent HUD toggle when clicking page
    >
      <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />
      <div 
        ref={textLayerRef} 
        className="textLayer absolute inset-0 select-text z-20" 
        style={{ 
          mixBlendMode: 'multiply', 
          opacity: 1,
          color: 'transparent'
        }}
      />
    </div>
  );
}
