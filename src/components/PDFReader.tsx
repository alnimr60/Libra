import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Maximize2, Minimize2, Loader2, Plus, Minus } from 'lucide-react';
import { get } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book } from '../types';

interface PDFReaderProps {
  book: Book;
  initialPage: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

export default function PDFReader({ book, initialPage, onPageChange, onClose }: PDFReaderProps) {
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  const [pageIndex, setPageIndex] = useState(0); // 0-based for internal math
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [renderScale, setRenderScale] = useState(scale);
  const visualScale = useRef(scale);
  
  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, {
    stiffness: 300,
    damping: 35,
    mass: 0.8
  });

  // Keep virtualPage in sync with state
  useEffect(() => {
    if (!isDragging) {
      animate(virtualPage, pageIndex, {
        type: 'spring',
        stiffness: 300,
        damping: 35
      });
    }
  }, [pageIndex, isDragging, virtualPage]);

  const handlePanStart = () => {
    if (scale > 1.1) return;
    setIsDragging(true);
  };

  const handlePanMove = (_: any, info: any) => {
    if (scale > 1.1 || !isDragging) return;
    const scrollWidth = window.innerWidth;
    const progress = info.offset.x / scrollWidth;
    
    if (direction === 'rtl') {
      virtualPage.set(pageIndex + progress);
    } else {
      virtualPage.set(pageIndex - progress);
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    if (scale > 1.1 || !isDragging) return;
    setIsDragging(false);
    
    const scrollWidth = window.innerWidth;
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    
    const threshold = 50;
    const velocityThreshold = 500;
    
    let nextIndex = pageIndex;
    
    if (direction === 'ltr') {
      if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex + 1;
      else if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex - 1;
    } else {
      if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex + 1;
      else if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex - 1;
    }
    
    handlePageChange(Math.max(0, Math.min(nextIndex, totalSheets - 1)));
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setRenderScale(scale);
    }, 400); // Slightly longer for resolution to settle
    return () => clearTimeout(timer);
  }, [scale]);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 600);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    if (isLandscape) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowControls(true);
    }
  }, [isLandscape, pageIndex]);

  useEffect(() => {
    async function loadPDF() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await get(fileDataId);
        if (!data) throw new Error('This book\'s PDF file could not be found. Try re-adding the book.');
        
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);

        // Improved Direction Detection
        try {
          const rtlRegex = /[\u0600-\u06FF\u0590-\u05FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
          let detectedDirection: 'ltr' | 'rtl' = rtlRegex.test(book.title) ? 'rtl' : 'ltr';
          
          if (detectedDirection === 'ltr') {
            // Check first few pages to be sure
            const pagesToCheck = Math.min(3, pdfDoc.numPages);
            for (let i = 1; i <= pagesToCheck; i++) {
              const page = await pdfDoc.getPage(i);
              const textContent = await page.getTextContent();
              const text = textContent.items.map((item: any) => (item as any).str).join('');
              if (rtlRegex.test(text)) {
                detectedDirection = 'rtl';
                break;
              }
            }
          }
          setDirection(detectedDirection);
        } catch (e) {
          console.warn('PDFReader: Direction detection failed, defaulting to LTR');
        }

        // Set initial page index
        if (initialPage) {
          const mode = window.innerWidth > 1024 ? 'double' : 'single';
          setPageIndex(mode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error('PDFReader: Error loading PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [fileDataId]);

  // Adjust viewMode based on screen size
  useEffect(() => {
    const handleResize = () => {
      setViewMode(window.innerWidth > 1024 ? 'double' : 'single');
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;
  
  const handlePageChange = (newIndex: number) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    if (safeIndex === pageIndex) return;
    
    setPageIndex(safeIndex);
    
    // Calculate display page for parent progress tracking
    const displayPage = viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1;
    onPageChange(Math.min(displayPage, numPages));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handlePageChange(direction === 'ltr' ? pageIndex + 1 : pageIndex - 1);
      if (e.key === 'ArrowLeft') handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageIndex, totalSheets, direction, viewMode]);

  const touchStateRef = useRef({ initialDist: 0, initialScale: 1 });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-[300] bg-zinc-950 flex flex-col overflow-hidden transition-all duration-500",
        direction === 'rtl' ? "rtl" : "ltr"
      )}
    >
      {/* Reader Controls Top */}
      <motion.div 
        animate={{ y: showControls ? 0 : -100 }}
        className={cn(
          "flex items-center justify-between gap-4 text-white/70 border-b border-white/5 bg-zinc-900/90 backdrop-blur-xl z-[310] transition-all",
          isLandscape ? "p-2" : "p-4"
        )}
      >
        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-75">
            <X className={cn(isLandscape ? "w-5 h-5" : "w-6 h-6")} />
          </button>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <div className="text-[10px] md:text-xs font-mono tracking-tighter">
            <span className="text-white font-bold">
              {viewMode === 'double' ? `${(pageIndex * 2) + 1}${ (pageIndex * 2) + 2 <= numPages ? '-' + ((pageIndex * 2) + 2) : '' }` : pageIndex + 1}
            </span> 
            <span className="opacity-30 mx-1">/</span> 
            <span className="opacity-40">{numPages}</span>
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-1 bg-white/5 rounded-full border border-white/10 shadow-lg pointer-events-auto",
          isLandscape ? "px-1 py-0.5 scale-90" : "px-2 py-1"
        )}>
          <button 
            onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.2, s - 0.2)); }} 
            className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
            title="Zoom Out"
          >
            <Minus className={cn(isLandscape ? "w-4 h-4" : "w-5 h-5")} />
          </button>
          <div className="flex flex-col items-center min-w-[32px]">
            <span className="text-[8px] font-mono leading-none text-white/40 mb-0.5">ZOOM</span>
            <span className="text-[10px] font-mono font-bold leading-none text-center select-none text-white">{Math.round(scale * 100)}%</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.2)); }} 
            className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
            title="Zoom In"
          >
            <Plus className={cn(isLandscape ? "w-4 h-4" : "w-5 h-5")} />
          </button>
        </div>

        <button 
          onClick={() => setIsFullscreen(!isFullscreen)} 
          className={cn("p-2 rounded-full transition-colors active:scale-75", isFullscreen ? "bg-orange-500 text-white" : "hover:bg-white/10")}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </motion.div>

      {/* Main Viewport */}
      <div 
        onClick={() => isLandscape && setShowControls(!showControls)}
        className="flex-1 relative flex items-center justify-center bg-zinc-900/40 overflow-hidden"
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const dist = Math.hypot(
              e.touches[0].pageX - e.touches[1].pageX,
              e.touches[0].pageY - e.touches[1].pageY
            );
            touchStateRef.current = { initialDist: dist, initialScale: scale };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && touchStateRef.current.initialDist > 0) {
            const dist = Math.hypot(
              e.touches[0].pageX - e.touches[1].pageX,
              e.touches[0].pageY - e.touches[1].pageY
            );
            const newScale = Math.min(5, Math.max(0.2, touchStateRef.current.initialScale * (dist / touchStateRef.current.initialDist)));
            setScale(newScale);
          }
        }}
        onTouchEnd={() => {
          touchStateRef.current.initialDist = 0;
        }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-white/40">
            <Loader2 className="w-12 h-12 animate-spin" />
            <p className="text-sm font-mono uppercase tracking-widest">Optimizing View...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-6 py-20 text-center px-10">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
               <X className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <p className="text-white font-medium">Error Loading PDF</p>
              <p className="text-white/40 text-sm max-w-xs">{error}</p>
            </div>
            <button 
              onClick={onClose}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm transition-colors"
            >
              Close Reader
            </button>
          </div>
        ) : (
          <motion.div 
            className="relative w-full h-full"
            onPanStart={handlePanStart}
            onPan={handlePanMove}
            onPanEnd={handlePanEnd}
          >
            {/* Windowed view of pages */}
            {Array.from({ length: 5 }, (_, i) => pageIndex - 2 + i).map(sheetIndex => {
              if (sheetIndex < 0 || sheetIndex >= totalSheets) return null;
              
              return (
                <ReaderSheet 
                  key={sheetIndex}
                  index={sheetIndex}
                  pdf={pdf!}
                  numPages={numPages}
                  viewMode={viewMode}
                  direction={direction}
                  virtualPage={smoothPage}
                  scale={scale}
                  renderScale={renderScale}
                  isLandscape={isLandscape}
                />
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Progress Footer */}
      {!isLoading && !error && (
        <motion.div 
          animate={{ y: showControls ? 0 : 100 }}
          className="p-2 md:p-4 bg-zinc-900/80 backdrop-blur-md shadow-2xl border-t border-white/5 z-[310]"
        >
          <div className="max-w-md mx-auto h-1 bg-white/10 rounded-full relative overflow-hidden">
            <motion.div 
              className="absolute inset-y-0 bg-orange-500"
              animate={{ 
                left: direction === 'rtl' ? "auto" : 0,
                right: direction === 'rtl' ? 0 : "auto",
                width: `${((pageIndex + 1) / totalSheets) * 100}%` 
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function ReaderSheet({ 
  index, 
  pdf, 
  numPages, 
  viewMode, 
  direction, 
  virtualPage, 
  scale, 
  renderScale, 
  isLandscape 
}: { 
  index: number, 
  pdf: pdfjs.PDFDocumentProxy, 
  numPages: number, 
  viewMode: 'single' | 'double',
  direction: 'ltr' | 'rtl',
  virtualPage: any,
  scale: number,
  renderScale: number,
  isLandscape: boolean,
  key?: React.Key
}) {
  const distance = useTransform(virtualPage, (v: number) => index - v);
  
  // Transform distance into horizontal position
  // In RTL, we want negative distance to be on the right, positive on the left
  const x = useTransform(distance, (d: number) => {
    const factor = direction === 'rtl' ? -100 : 100;
    return `${d * factor}%`;
  });
  
  // Fast fade for non-visible sheets to save render cycles
  const opacity = useTransform(distance, [-1.1, -0.8, 0, 0.8, 1.1], [0, 1, 1, 1, 0]);
  const visibility = useTransform(distance, (d: number) => Math.abs(d) > 1.5 ? 'hidden' : 'visible');

  return (
    <motion.div
      style={{ x, opacity, visibility }}
      className={cn(
        "absolute inset-0 flex p-4 md:p-8 overflow-auto custom-scrollbar",
        viewMode === 'double' ? "flex-row" : "flex-col",
        scale > 1.1 ? "items-start justify-start cursor-move" : "items-center justify-center cursor-grab active:cursor-grabbing"
      )}
    >
      <div 
        className={cn(
          "flex flex-shrink-0 gap-0 lg:gap-4 my-auto",
          viewMode === 'double' ? "flex-row" : "flex-col",
          scale > 1.1 ? "m-auto" : "mx-auto"
        )}
      >
        {viewMode === 'double' ? (
          <>
            {direction === 'rtl' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} scale={scale} renderScale={renderScale} side="left" isLandscape={isLandscape} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} scale={scale} renderScale={renderScale} side="right" isLandscape={isLandscape} />
              </>
            ) : (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} scale={scale} renderScale={renderScale} side="left" isLandscape={isLandscape} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} scale={scale} renderScale={renderScale} side="right" isLandscape={isLandscape} />
              </>
            )}
          </>
        ) : (
          <div 
            className="flex-shrink-0 h-auto shadow-2xl bg-white relative"
            style={{ 
              width: isLandscape ? `${(scale * 100) * 0.707}vh` : `${85 * scale}vw`,
              maxHeight: '90vh',
              aspectRatio: '0.707',
              transition: 'width 0.1s ease-out'
            }}
          >
            <PDFPage pageNumber={index + 1} pdf={pdf} scale={renderScale} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SpreadPage({ pdf, pageNumber, numPages, scale, renderScale, side, isLandscape }: { pdf: pdfjs.PDFDocumentProxy, pageNumber: number, numPages: number, scale: number, renderScale: number, side: 'left' | 'right', isLandscape?: boolean }) {
  if (pageNumber > numPages) return <div className="flex-shrink-0" style={{ width: isLandscape ? `${(scale * 50) * 0.707}vh` : `${45 * scale}vw`, aspectRatio: '0.707' }} />;
  
  return (
    <div 
      className={cn(
        "flex-shrink-0 h-auto shadow-2xl bg-white relative flex items-center justify-center",
        side === 'left' ? "rounded-l-sm" : "rounded-r-sm"
      )}
      style={{ 
        width: isLandscape ? `${(scale * 50) * 0.707}vh` : `${45 * scale}vw`,
        aspectRatio: '0.707',
        transition: 'width 0.1s ease-out'
      }}
    >
      {/* Decorative center seam shadow */}
      <div className={cn(
        "absolute inset-y-0 w-8 z-10 pointer-events-none opacity-20",
        side === 'left' ? "right-0 bg-gradient-to-l from-black via-black/20 to-transparent" : "left-0 bg-gradient-to-r from-black via-black/20 to-transparent"
      )} />
      <PDFPage pageNumber={pageNumber} pdf={pdf} scale={renderScale} />
    </div>
  );
}

interface PDFPageProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  scale: number;
}

const PDFPage: React.FC<PDFPageProps> = ({ pageNumber, pdf, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const render = async () => {
      if (!canvasRef.current) return;

      try {
        const page = await pdf.getPage(pageNumber);
        if (!isMounted || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: Math.min(3, scale * 1.5) });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });

        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          // If there's an ongoing task, cancel it
          if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
          }

          renderTaskRef.current = page.render({
            canvasContext: context,
            viewport: viewport,
          } as any);
          
          await renderTaskRef.current.promise;
        }
      } catch (error: any) {
        if (error.name === 'RenderingCancelledException') return;
        console.error(`Error rendering page ${pageNumber}:`, error);
      }
    };

    render();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="w-full h-auto"
      />
    </div>
  );
};
