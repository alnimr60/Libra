import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { pdfjs } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2 } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

// --- TILE ENGINE TYPES ---
interface TileKey {
  pageNumber: number;
  row: number;
  col: number;
  resolutionScale: number;
}

interface TileData {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  lastUsed: number;
}

// --- CONSTANTS ---
const TILE_SIZE = 512;
const MAX_TILE_CACHE = 120; // Approx 120MB - 200MB of tiles

// --- TILE CACHE MANAGER ---
class TileLRUCache {
  private cache = new Map<string, TileData>();

  get(key: string): TileData | undefined {
    const data = this.cache.get(key);
    if (data) {
      data.lastUsed = Date.now();
    }
    return data;
  }

  set(key: string, canvas: HTMLCanvasElement | OffscreenCanvas) {
    if (this.cache.size >= MAX_TILE_CACHE) {
      // Remove oldest
      let oldestKey = '';
      let oldestTime = Infinity;
      this.cache.forEach((val, k) => {
        if (val.lastUsed < oldestTime) {
          oldestTime = val.lastUsed;
          oldestKey = k;
        }
      });
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { canvas, lastUsed: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

const tileCache = new TileLRUCache();

// --- PREMIUM PDF READER COMPONENT ---
interface PremiumPDFReaderProps {
  book: Book;
  initialPage: number;
  onPageChange: (page: number) => void;
  updateBook: (book: Book) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

export default function PremiumPDFReader({ book, initialPage, onPageChange, updateBook, onUpdateBookmarks, onClose }: PremiumPDFReaderProps) {
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  
  // --- CAMERA STATE ---
  const [scale, setScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const [pageIndex, setPageIndex] = useState(0);

  // --- UI STATE ---
  const [isLoading, setIsLoading] = useState(true);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(book.readingDirection || 'ltr');
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  const [showControls, setShowControls] = useState(true);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [navigatorTab, setNavigatorTab] = useState<'pages' | 'bookmarks'>('pages');
  const [isSelectingText, setIsSelectingText] = useState(false);
  const [isTemporal, setIsTemporal] = useState(false);

  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);

  // Sync scale to motion value
  useEffect(() => {
    animate(liveScale, scale, { type: 'spring', stiffness: 300, damping: 30 });
    if (scale <= 1.1) {
      animate(panX, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [scale, liveScale, panX, panY]);

  // Load PDF
  useEffect(() => {
    async function loadPDF() {
      try {
        setIsLoading(true);
        if (!fileDataId) throw new Error('No PDF file.');
        const data = await get(fileDataId);
        if (!data) throw new Error('PDF file not found.');
        
        const loadingTask = pdfjs.getDocument({ 
          data: new Uint8Array(data),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
          cMapPacked: true,
        });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        
        if (initialPage) {
          const mode = window.innerWidth > 1024 ? 'double' : 'single';
          setPageIndex(mode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        }
        setIsLoading(false);
      } catch (err: any) {
        console.error('PDF Load Error:', err);
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [fileDataId]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => setViewMode(window.innerWidth > 1024 ? 'double' : 'single');
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;

  const handlePageChange = (newIndex: number, isJump: boolean = false) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    if (safeIndex === pageIndex) return;
    setPageIndex(safeIndex);
    if (isJump) setIsTemporal(true);
    const displayPage = viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1;
    onPageChange(Math.min(displayPage, numPages));
  };

  const toggleBookmark = () => {
    if (isCurrentlyBookmarked) {
      onUpdateBookmarks(bookmarks.filter(bm => bm.page !== currentPageNumber));
    } else {
      const newBookmark: Bookmark = {
        id: Math.random().toString(36).substr(2, 9),
        page: currentPageNumber,
        createdAt: new Date().toISOString()
      };
      onUpdateBookmarks([...bookmarks, newBookmark]);
    }
  };

  // --- GESTURE HANDLING ---
  const lastTap = useRef<number>(0);
  const handleViewportClick = (e: React.MouseEvent) => {
    if (isSelectingText) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setScale(scale > 1.2 ? 1.0 : 2.5);
      if (scale <= 1.2) setShowControls(false);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;

    if (!showControls) {
      const x = e.clientX / window.innerWidth;
      if (x < 0.2) handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1);
      else if (x > 0.8) handlePageChange(direction === 'ltr' ? pageIndex + 1 : pageIndex - 1);
      else setShowControls(true);
    } else {
      setShowControls(false);
    }
  };

  const handlePan = (e: any, info: any) => {
    if (isSelectingText) return;
    if (scale > 1.1) {
      panX.set(panX.get() + info.delta.x);
      panY.set(panY.get() + info.delta.y);
    } else {
      // Horizontal swipe logic handled by ReaderSheet animations
    }
  };

  const handlePanEnd = (e: any, info: any) => {
    if (isSelectingText) return;
    if (scale <= 1.1) {
      const threshold = 50;
      const velocity = info.velocity.x;
      const offset = info.offset.x;
      if (Math.abs(offset) > threshold || Math.abs(velocity) > 500) {
        if (direction === 'rtl') {
          if (offset > 0 || velocity > 500) handlePageChange(pageIndex + 1);
          else handlePageChange(pageIndex - 1);
        } else {
          if (offset < 0 || velocity < -500) handlePageChange(pageIndex + 1);
          else handlePageChange(pageIndex - 1);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col overflow-hidden select-none">
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            style={{ paddingTop: `${insets.top + 16}px` }}
            className="fixed top-0 left-0 right-0 z-[310] flex items-center justify-between p-4 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5"
          >
            <div className="flex items-center gap-4">
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-6 h-6 text-white" /></button>
              <button onClick={() => setDirection(d => d === 'ltr' ? 'rtl' : 'ltr')} className="px-3 py-1 bg-white/5 rounded-full text-[10px] text-white/50 font-bold uppercase">{direction}</button>
              <button onClick={() => setIsNavigatorOpen(true)} className="px-4 py-1.5 bg-white/10 rounded-full text-white text-sm font-mono">{pageIndex + 1} / {totalSheets}</button>
            </div>
            <div className="flex items-center gap-2 bg-white/5 rounded-full px-2">
              <button onClick={() => setScale(s => Math.max(1, s - 0.5))} className="p-2 text-white/50 hover:text-white"><Minus className="w-4 h-4" /></button>
              <span className="text-[10px] text-white font-mono min-w-[30px] text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(5, s + 0.5))} className="p-2 text-white/50 hover:text-white"><Plus className="w-4 h-4" /></button>
              <button onClick={toggleBookmark} className={cn("p-2 rounded-full", isCurrentlyBookmarked ? "text-orange-500" : "text-white/20")}><BookmarkIcon className="w-4 h-4 fill-current" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="flex-1 relative overflow-hidden"
        onClick={handleViewportClick}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-white/20" /></div>
        ) : (
          <motion.div 
            className="w-full h-full"
            onPan={handlePan}
            onPanEnd={handlePanEnd}
          >
            {Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i).map(idx => {
              if (idx < 0 || idx >= totalSheets) return null;
              return (
                <ReaderSheet 
                  key={idx} index={idx} pdf={pdf!} numPages={numPages} viewMode={viewMode} direction={direction}
                  focusIndex={pageIndex} liveScale={liveScale} panX={panX} panY={panY}
                  isSelectingText={isSelectingText} setIsSelectingText={setIsSelectingText}
                />
              );
            })}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showControls && !isLoading && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            style={{ paddingBottom: `${insets.bottom + 16}px` }}
            className="fixed bottom-0 left-0 right-0 z-[310] p-6 bg-zinc-950/80 backdrop-blur-xl border-t border-white/5"
          >
            <div className="max-w-2xl mx-auto h-1 bg-white/10 rounded-full relative">
              <motion.div 
                className="absolute inset-y-0 bg-orange-500 rounded-full"
                animate={{ width: `${((pageIndex + 1) / totalSheets) * 100}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigator Modal */}
      <AnimatePresence>
        {isNavigatorOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-zinc-950/90 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => setIsNavigatorOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-white/5 border border-white/10 rounded-[2rem] p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex gap-2 mb-8 bg-black/20 p-1 rounded-xl">
                <button onClick={() => setNavigatorTab('pages')} className={cn("flex-1 py-2 rounded-lg text-[10px] uppercase font-bold", navigatorTab === 'pages' ? "bg-white text-black" : "text-white/40")}>Pages</button>
                <button onClick={() => setNavigatorTab('bookmarks')} className={cn("flex-1 py-2 rounded-lg text-[10px] uppercase font-bold", navigatorTab === 'bookmarks' ? "bg-white text-black" : "text-white/40")}>Bookmarks</button>
              </div>
              {navigatorTab === 'pages' ? (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="text-7xl font-serif text-white">{pageIndex + 1}</div>
                    <div className="text-xs text-white/20 uppercase font-mono tracking-widest mt-2">of {totalSheets}</div>
                  </div>
                  <input type="range" min={0} max={totalSheets-1} value={pageIndex} onChange={e => handlePageChange(parseInt(e.target.value))} className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white" />
                </div>
              ) : (
                <div className="max-h-[40vh] overflow-y-auto space-y-2 no-scrollbar">
                  {bookmarks.length === 0 ? <p className="text-center py-10 text-white/20 text-[10px] uppercase tracking-widest">Empty</p> : 
                    bookmarks.map(bm => (
                      <div key={bm.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                        <button onClick={() => { handlePageChange(viewMode === 'double' ? Math.floor((bm.page-1)/2) : bm.page-1, true); setIsNavigatorOpen(false); }} className="text-white font-serif">Page {bm.page}</button>
                        <button onClick={() => onUpdateBookmarks(bookmarks.filter(b => b.id !== bm.id))} className="text-white/10 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))
                  }
                </div>
              )}
              <button onClick={() => setIsNavigatorOpen(false)} className="w-full mt-8 py-4 bg-white text-black rounded-2xl font-bold uppercase text-[10px] tracking-widest">Done</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReaderSheet({ index, pdf, numPages, viewMode, direction, focusIndex, liveScale, panX, panY, isSelectingText, setIsSelectingText }: any) {
  const diff = index - focusIndex;
  const xOffset = useTransform(liveScale, s => {
    const isFocused = index === focusIndex;
    if (isFocused) return panX.get();
    // Non-focused sheets are offset based on direction
    const multiplier = direction === 'rtl' ? -100 : 100;
    return `${diff * multiplier}%`;
  });

  // Animated swipe positions
  const springX = useSpring(useTransform(new useMotionValue(diff), d => d * (direction === 'rtl' ? -100 : 100) + '%'), { stiffness: 300, damping: 30 });
  
  // When not zoomed, we use the carousel swipe animation
  // When zoomed, we lock the non-active pages away and use pan logic
  const isZoomed = useMotionValue(false);
  useEffect(() => {
    isZoomed.set(liveScale.get() > 1.1);
  }, [liveScale]);

  const x = useTransform([liveScale, panX], ([s, px]: any) => {
    if (s > 1.1) {
      if (index === focusIndex) return px;
      return direction === 'rtl' ? (diff > 0 ? '150%' : '-150%') : (diff > 0 ? '150%' : '-150%');
    }
    return `${diff * (direction === 'rtl' ? -100 : 100)}%`;
  });

  const zIndex = 10 - Math.abs(diff);
  const opacity = Math.abs(diff) > 1 ? 0 : 1;

  return (
    <motion.div 
      style={{ x, zIndex, opacity }} 
      className="absolute inset-0 flex items-center justify-center p-4 md:p-12 pointer-events-none"
    >
      <motion.div 
        style={{ scale: index === focusIndex ? liveScale : 1, y: index === focusIndex ? panY : 0, transformOrigin: 'center' }}
        className="flex gap-0 md:gap-4 pointer-events-auto"
      >
        {viewMode === 'double' ? (
          <>
            <PageTileRenderer pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} isSelectingText={isSelectingText} setIsSelectingText={setIsSelectingText} liveScale={liveScale} />
            <PageTileRenderer pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} isSelectingText={isSelectingText} setIsSelectingText={setIsSelectingText} liveScale={liveScale} />
          </>
        ) : (
          <PageTileRenderer pdf={pdf} pageNumber={index + 1} numPages={numPages} isSelectingText={isSelectingText} setIsSelectingText={setIsSelectingText} liveScale={liveScale} />
        )}
      </motion.div>
    </motion.div>
  );
}

function PageTileRenderer({ pdf, pageNumber, numPages, isSelectingText, setIsSelectingText, liveScale }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 400, h: 600 });
  const renderScale = useRef(2);

  // We re-render the canvas when the scale settles to a higher value
  useEffect(() => {
    const s = liveScale.get();
    if (s > 2.5 && renderScale.current < 4) {
      renderScale.current = 4;
      render();
    } else if (s <= 1.2 && renderScale.current > 2) {
      renderScale.current = 2;
      render();
    }
  }, [liveScale]);

  const render = async () => {
    if (pageNumber > numPages) return;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: renderScale.current });
    
    setDimensions({ w: viewport.width / renderScale.current, h: viewport.height / renderScale.current });
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }

    if (textLayerRef.current) {
      textLayerRef.current.innerHTML = '';
      const textContent = await page.getTextContent();
      const textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport });
      await textLayer.render();
    }
    setIsReady(true);
  };

  useEffect(() => {
    let mounted = true;
    render();
    return () => { mounted = false; };
  }, [pdf, pageNumber]);

  if (pageNumber > numPages) return null;

  return (
    <div 
      ref={containerRef}
      className="relative bg-white shadow-[0_30px_60px_rgba(0,0,0,0.3)] overflow-hidden" 
      style={{ width: `${dimensions.w}px`, height: `${dimensions.h}px` }}
    >
      <canvas ref={canvasRef} className="w-full h-full pointer-events-none select-none" />
      <div 
        ref={textLayerRef} 
        className={cn("textLayer absolute inset-0 select-text transition-opacity duration-500", isReady ? "opacity-100" : "opacity-0")}
        onPointerDown={e => {
          if ((e.target as HTMLElement).tagName === 'SPAN') {
            setIsSelectingText(true);
            // Long press logic can be added here if needed
          }
        }}
        onPointerUp={() => setIsSelectingText(false)}
      />
    </div>
  );
}
