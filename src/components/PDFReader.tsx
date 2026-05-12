import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { pdfjs, samplePDFText, detectDirectionFromText } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform, useMotionValueEvent } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2, AlertCircle } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

// --- TILE ENGINE CONSTANTS ---
const TILE_SIZE = 512;
const MAX_CACHE_MB = 450; // Increased for premium smoothness
const MAX_CONCURRENT_RENDERS = 2;

// --- TILE ENGINE CLASSES ---

class TileLRUCache {
  private cache = new Map<string, { bitmap: ImageBitmap, size: number }>();
  private order: string[] = [];
  private currentSizeMB = 0;

  get(key: string) {
    const item = this.cache.get(key);
    if (item) {
      this.order = this.order.filter(k => k !== key);
      this.order.push(key);
      return item.bitmap;
    }
    return null;
  }

  set(key: string, bitmap: ImageBitmap) {
    const size = (bitmap.width * bitmap.height * 4) / (1024 * 1024);
    if (this.cache.has(key)) {
      this.currentSizeMB -= this.cache.get(key)!.size;
    }
    
    while (this.currentSizeMB + size > MAX_CACHE_MB && this.order.length > 0) {
      const oldestKey = this.order.shift()!;
      const oldestItem = this.cache.get(oldestKey);
      if (oldestItem) {
        this.currentSizeMB -= oldestItem.size;
        oldestItem.bitmap.close();
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { bitmap, size });
    this.order.push(key);
    this.currentSizeMB += size;
  }

  clear() {
    this.cache.forEach(item => item.bitmap.close());
    this.cache.clear();
    this.order = [];
    this.currentSizeMB = 0;
  }
}

const globalTileCache = new TileLRUCache();
const globalRenderQueue: { key: string, task: () => Promise<void> }[] = [];
let activeRenderCount = 0;

async function processQueue() {
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS || globalRenderQueue.length === 0) return;
  activeRenderCount++;
  const item = globalRenderQueue.shift();
  if (!item) { activeRenderCount--; return; }
  try { await item.task(); } finally { activeRenderCount--; processQueue(); }
}

class PageTileRenderer {
  private tiles = new Map<string, HTMLCanvasElement>();
  private container: HTMLDivElement;
  private pdfPage: pdfjs.PDFPageProxy;
  private pageNumber: number;
  private logicalWidth: number;
  private logicalHeight: number;

  constructor(container: HTMLDivElement, pdfPage: pdfjs.PDFPageProxy, pageNumber: number, width: number, height: number) {
    this.container = container;
    this.pdfPage = pdfPage;
    this.pageNumber = pageNumber;
    this.logicalWidth = width;
    this.logicalHeight = height;
  }

  update(params: { scale: number, px: number, py: number, tier: number, version: number, vw: number, vh: number, worldOffsetX: number }) {
    const { scale, px, py, tier, version, vw, vh, worldOffsetX } = params;
    
    // Core logic: Map the logical page coordinate to the current reader viewport
    const zoomedWidth = this.logicalWidth * scale;
    const zoomedHeight = this.logicalHeight * scale;

    const cols = Math.ceil(zoomedWidth / TILE_SIZE);
    const rows = Math.ceil(zoomedHeight / TILE_SIZE);

    const visibleKeys = new Set<string>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = c * TILE_SIZE;
        const ty = r * TILE_SIZE;

        // Visibility check relative to reader container
        const tileLeft = px + worldOffsetX + tx;
        const tileTop = py + ty;
        
        if (tileLeft < vw && tileLeft + TILE_SIZE > 0 && tileTop < vh && tileTop + TILE_SIZE > 0) {
          const key = `${this.pageNumber}-${version}-${tier}-${r}-${c}`;
          visibleKeys.add(key);

          if (!this.tiles.has(key)) {
            this.createTile(key, r, c, tier, scale, tx, ty);
          }
        }
      }
    }

    this.tiles.forEach((canvas, key) => {
      if (!visibleKeys.has(key)) {
        canvas.remove();
        this.tiles.delete(key);
      }
    });
  }

  private async createTile(key: string, row: number, col: number, tier: number, currentScale: number, tx: number, ty: number) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    canvas.className = 'absolute';
    // Style coordinates in logical pixels (container space)
    canvas.style.left = `${tx / currentScale}px`;
    canvas.style.top = `${ty / currentScale}px`;
    canvas.style.width = `${TILE_SIZE / currentScale}px`;
    canvas.style.height = `${TILE_SIZE / currentScale}px`;
    
    this.container.appendChild(canvas);
    this.tiles.set(key, canvas);

    const cached = globalTileCache.get(key);
    const ctx = canvas.getContext('2d', { alpha: false })!;

    if (cached) {
      ctx.drawImage(cached, 0, 0);
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    globalRenderQueue.push({
      key,
      task: async () => {
        if (!this.tiles.has(key)) return;

        const viewport = this.pdfPage.getViewport({ scale: 1 });
        const fitScale = this.logicalWidth / viewport.width;
        const renderScale = fitScale * tier;
        
        const renderViewport = this.pdfPage.getViewport({ 
          scale: renderScale,
          offsetX: -(col * TILE_SIZE * (tier / currentScale)),
          offsetY: -(row * TILE_SIZE * (tier / currentScale)),
        });

        const offscreen = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
        const offCtx = offscreen.getContext('2d', { alpha: false })!;
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

        await this.pdfPage.render({ canvasContext: offCtx as any, viewport: renderViewport }).promise;
        const bitmap = offscreen.transferToImageBitmap();
        globalTileCache.set(key, bitmap);
        
        if (this.tiles.has(key)) {
          ctx.drawImage(bitmap, 0, 0);
        }
      }
    });

    processQueue();
  }

  destroy() {
    this.tiles.forEach(c => c.remove());
    this.tiles.clear();
  }
}

// --- READER COMPONENT (V1 Structure) ---

interface PDFReaderProps {
  book: Book;
  initialPage: number;
  onPageChange: (page: number) => void;
  updateBook: (book: Book) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

enum GestureMode {
  Idle = 'Idle',
  SwipingPages = 'SwipingPages',
  PanningZoomedPage = 'PanningZoomedPage',
  PinchZooming = 'PinchZooming',
  SelectingText = 'SelectingText'
}

export default function PDFReader({ book, initialPage, onPageChange, updateBook, onUpdateBookmarks, onClose }: PDFReaderProps) {
  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartInfo = useRef({ x: 0, y: 0, time: 0 });
  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const isAnimatingZoom = useRef(false);
  
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  const [readerDimensions, setReaderDimensions] = useState({ width: 0, height: 0 });
  const readerDimensionsRef = useRef({ width: 0, height: 0 });

  const [committedScale, setCommittedScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  // Resolution Tiers
  const [settledScale, setSettledScale] = useState(1.0);
  const [renderTierScale, setRenderTierScale] = useState(1);
  const [renderVersion, setRenderVersion] = useState(0);
  const settleTimerRef = useRef<any>(null);

  const triggerSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      if (!isPinching.current && !isPanning.current && !isAnimatingZoom.current) {
        setRenderVersion(v => v + 1);
        setSettledScale(committedScale);
        
        let newTier = 1;
        if (committedScale <= 1.2) newTier = 1;
        else if (committedScale <= 2.5) newTier = 2;
        else if (committedScale <= 5) newTier = 4;
        else newTier = 8;
        
        setRenderTierScale(newTier);
      }
    }, 120); 
  }, [committedScale]);

  useEffect(() => {
    triggerSettle();
    return () => clearTimeout(settleTimerRef.current);
  }, [committedScale, triggerSettle]);

  useEffect(() => {
    animate(liveScale, committedScale, { type: 'spring', stiffness: 300, damping: 30 });
    if (committedScale <= 1.05) {
      animate(panX, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [committedScale]);

  const [isLoading, setIsLoading] = useState(true);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(book.readingDirection || 'ltr');
  const [pageIndex, setPageIndex] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);
  const totalSheets = useMemo(() => viewMode === 'double' ? Math.ceil(numPages / 2) : numPages, [numPages, viewMode]);

  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, { stiffness: 450, damping: 45, mass: 0.8 });

  const readerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!readerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const dims = { width: entry.contentRect.width, height: entry.contentRect.height };
        setReaderDimensions(dims);
        readerDimensionsRef.current = dims;
      }
    });
    observer.observe(readerContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function loadPDF() {
      try {
        setIsLoading(true);
        const data = await get(book.fileDataId!);
        if (!data) throw new Error('PDF data not found');
        const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(data), stopAtErrors: false, enableXfa: true, cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`, cMapPacked: true }).promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        if (initialPage) {
          setPageIndex(viewMode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        }
        setIsLoading(false);
      } catch (err: any) {
        setError(err.message);
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [book.fileDataId]);

  // Gestures (V1 Logic)
  const handlePageChange = (newIndex: number) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    setPageIndex(safeIndex);
    onPageChange(viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1);
  };

  useEffect(() => {
    if (!isPanning.current) animate(virtualPage, pageIndex, { type: 'spring', stiffness: 450, damping: 45 });
  }, [pageIndex, virtualPage]);

  const handlePanStart = () => {
    if (isAnimatingZoom.current) return;
    panX.stop(); panY.stop(); liveScale.stop();
    isPanning.current = true;
  };

  const handlePanMove = (_: any, info: any) => {
    if (gestureMode.current === GestureMode.SelectingText || isAnimatingZoom.current) return;
    const currentScale = liveScale.get();
    if (gestureMode.current === GestureMode.Idle && Math.hypot(info.offset.x, info.offset.y) > 10) {
      if (currentScale > 1.05) gestureMode.current = GestureMode.PanningZoomedPage;
      else if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) gestureMode.current = GestureMode.SwipingPages;
    }

    if (gestureMode.current === GestureMode.PanningZoomedPage) {
      panX.set(panX.get() + info.delta.x);
      panY.set(panY.get() + info.delta.y);
    } else if (gestureMode.current === GestureMode.SwipingPages) {
      const scrollWidth = (viewMode === 'double' ? 800 : 400);
      virtualPage.set(direction === 'rtl' ? pageIndex + (info.offset.x / scrollWidth) : pageIndex - (info.offset.x / scrollWidth));
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    isPanning.current = false;
    if (gestureMode.current === GestureMode.SwipingPages) {
      const threshold = 50;
      let nextIndex = pageIndex;
      if (direction === 'rtl') {
        if (info.offset.x > threshold) nextIndex++;
        else if (info.offset.x < -threshold) nextIndex--;
      } else {
        if (info.offset.x < -threshold) nextIndex++;
        else if (info.offset.x > threshold) nextIndex--;
      }
      handlePageChange(nextIndex);
    }
    gestureMode.current = GestureMode.Idle;
    triggerSettle();
  };

  const toggleBookmark = () => {
    if (isCurrentlyBookmarked) onUpdateBookmarks(bookmarks.filter(bm => bm.page !== currentPageNumber));
    else onUpdateBookmarks([...bookmarks, { id: Math.random().toString(36).substr(2, 9), page: currentPageNumber, createdAt: new Date().toISOString() }]);
  };

  return (
    <motion.div className="fixed inset-0 bg-zinc-950 flex flex-col z-[300] overflow-hidden select-none touch-none">
      {/* HUD HEADER */}
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }} className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent z-[320] flex items-center px-4 gap-4">
             <button onClick={onClose} className="p-2 text-white/80 hover:bg-white/10 rounded-full"><X className="w-5 h-5"/></button>
             <div className="flex-1 min-w-0"><h3 className="text-white text-sm font-medium truncate">{book.title}</h3></div>
             <div className="flex items-center gap-2">
                <button onClick={toggleBookmark} className={cn("p-2 rounded-full transition-colors", isCurrentlyBookmarked ? "text-orange-500 bg-orange-500/10" : "text-white/60 hover:bg-white/10")}>
                   <BookmarkIcon className="w-5 h-5" fill={isCurrentlyBookmarked ? "currentColor" : "none"}/>
                </button>
                <button onClick={() => setViewMode(v => v === 'single' ? 'double' : 'single')} className="p-2 text-white/80 hover:bg-white/10 rounded-full"><Maximize2 className="w-5 h-5"/></button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEWPORT */}
      <div ref={readerContainerRef} className="flex-1 relative flex items-center justify-center overflow-hidden" 
           onPointerDown={(e) => { if (e.detail === 2) setCommittedScale(s => s > 1.1 ? 1 : 2.5); }}
           onClick={() => setShowControls(s => !s)}>
         {isLoading ? <Loader2 className="w-10 h-10 animate-spin text-white/20"/> : (
           <motion.div className="relative w-full h-full" onPanStart={handlePanStart} onPan={handlePanMove} onPanEnd={handlePanEnd}>
              {Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i).map(sheetIndex => {
                if (sheetIndex < 0 || sheetIndex >= totalSheets) return null;
                return (
                  <ReaderSheet key={sheetIndex} index={sheetIndex} pdf={pdf!} numPages={numPages} viewMode={viewMode} direction={direction} virtualPage={smoothPage} liveScale={liveScale} settledScale={settledScale} renderTierScale={renderTierScale} renderVersion={renderVersion} panX={panX} panY={panY} dims={readerDimensions} isCurrent={sheetIndex === pageIndex} />
                );
              })}
           </motion.div>
         )}
      </div>

      {/* FOOTER */}
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent z-[320] flex flex-col gap-4">
             <div className="max-w-2xl mx-auto w-full flex flex-col gap-2">
               <div className="flex justify-between text-white/40 text-[10px] font-mono">
                 <span>Page {currentPageNumber}</span>
                 <span>{numPages} Pages</span>
               </div>
               <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${(currentPageNumber / numPages) * 100}%` }}/>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- SUB-COMPONENTS ---

const ReaderSheet = React.memo(({ index, pdf, numPages, viewMode, direction, virtualPage, liveScale, settledScale, renderTierScale, renderVersion, panX, panY, dims, isCurrent }: any) => {
  const distance = useTransform(virtualPage, (v: number) => index - v);
  const x = useTransform(distance, (d: number) => d * (direction === 'rtl' ? -100 : 100));
  const opacity = useTransform(distance, (d: number) => Math.abs(d) > 1.5 ? 0 : 1);

  // Dynamic layout math from V1
  const baseWidth = useMemo(() => {
    if (dims.width === 0) return 400;
    const padding = viewMode === 'double' ? 0.95 : 0.9;
    const idealW = (dims.height * 0.9 * 0.707) * (viewMode === 'double' ? 2 : 1);
    const finalW = Math.min(idealW, dims.width * padding);
    return viewMode === 'double' ? finalW / 2 : finalW;
  }, [viewMode, dims]);

  return (
    <motion.div style={{ opacity, x: useTransform(x, v => `${v}%`), zIndex: useTransform(distance, d => 10 - Math.abs(d)) } as any} className="absolute inset-0 flex items-center justify-center">
       <motion.div style={{ x: panX, y: panY, scale: liveScale, transformOrigin: "center center", width: 'fit-content' } as any} className="flex flex-row origin-center">
          {viewMode === 'double' ? (
            <>
              <PDFPageWrapper pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={baseWidth} tier={renderTierScale} settledScale={settledScale} version={renderVersion} panX={panX} panY={panY} liveScale={liveScale} dims={dims} isVisible={isCurrent} side="left"/>
              <PDFPageWrapper pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={baseWidth} tier={renderTierScale} settledScale={settledScale} version={renderVersion} panX={panX} panY={panY} liveScale={liveScale} dims={dims} isVisible={isCurrent} side="right"/>
            </>
          ) : (
            <PDFPageWrapper pdf={pdf} pageNumber={index + 1} numPages={numPages} width={baseWidth} tier={renderTierScale} settledScale={settledScale} version={renderVersion} panX={panX} panY={panY} liveScale={liveScale} dims={dims} isVisible={isCurrent} side="center"/>
          )}
       </motion.div>
    </motion.div>
  );
});

const PDFPageWrapper = React.memo(({ pdf, pageNumber, numPages, width, tier, settledScale, version, panX, panY, liveScale, dims, isVisible, side }: any) => {
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (pageNumber > numPages) return;
    pdf.getPage(pageNumber).then(p => {
      const v = p.getViewport({ scale: 1 });
      setPageSize({ width: v.width, height: v.height });
    });
  }, [pdf, pageNumber]);

  if (pageNumber > numPages) return <div className="bg-zinc-800/20" style={{ width, height: width * 1.414 }}/>;
  
  const height = width * (pageSize.height / pageSize.width || 1.414);
  const worldOffsetX = side === 'left' ? -width : side === 'right' ? 0 : -width/2;

  return (
    <div className="bg-white relative overflow-hidden" style={{ width, height }}>
       <PDFPageTileEngine pageNumber={pageNumber} pdf={pdf} width={width} height={height} tier={tier} settledScale={settledScale} version={version} panX={panX} panY={panY} liveScale={liveScale} dims={dims} isVisible={isVisible} worldOffsetX={worldOffsetX}/>
    </div>
  );
});

const PDFPageTileEngine = React.memo(({ pageNumber, pdf, width, height, tier, settledScale, version, panX, panY, liveScale, dims, isVisible, worldOffsetX }: any) => {
  const paletteRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PageTileRenderer | null>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);

  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(page => {
      if (!active) return;
      setPdfPage(page);
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        const viewport = page.getViewport({ scale: width / page.getViewport({scale:1}).width });
        page.getTextContent().then(textContent => {
           if (!active || !textLayerRef.current) return;
           textLayerRef.current.style.setProperty('--scale-factor', viewport.scale.toString());
           pdfjs.renderTextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport, textDivs: [] });
        });
      }
    });
    return () => { active = false; };
  }, [pdf, pageNumber, width]);

  const run = useCallback(() => {
    if (!isVisible || !pdfPage || !paletteRef.current || !dims.width) return;
    if (!engineRef.current) engineRef.current = new PageTileRenderer(paletteRef.current, pdfPage, pageNumber, width, height);
    
    // Calculate precise center-based world offset
    const vw = dims.width;
    const vh = dims.height;
    const px = panX.get() + (vw / 2);
    const py = panY.get() + (vh / 2) - (height * settledScale / 2);

    engineRef.current.update({ scale: settledScale, px, py, tier, version, vw, vh, worldOffsetX: worldOffsetX * settledScale });
  }, [isVisible, pdfPage, settledScale, tier, version, panX, panY, dims, width, height, worldOffsetX]);

  useLayoutEffect(run, [run]);
  useMotionValueEvent(panX, "change", run);
  useMotionValueEvent(panY, "change", run);

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      <div ref={paletteRef} className="absolute inset-0 z-0" />
      <div ref={textLayerRef} className="absolute inset-0 textLayer z-10 pointer-events-auto select-text" />
    </div>
  );
});
