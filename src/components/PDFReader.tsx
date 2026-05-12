import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { pdfjs, samplePDFText, detectDirectionFromText } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform, useMotionValueEvent } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2, AlertCircle, Activity } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

// --- TILE ENGINE CONSTANTS ---
const TILE_SIZE = 512;
const MAX_CACHE_MB = 350;
const MAX_CONCURRENT_RENDERS = 2;
const PAGE_LOGICAL_WIDTH = 400;
const PAGE_LOGICAL_HEIGHT = 600;

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

  getUsageMB() {
    return this.currentSizeMB;
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
  if (!item) {
    activeRenderCount--;
    return;
  }
  
  const { task } = item;
  try {
    await task();
  } finally {
    activeRenderCount--;
    processQueue();
  }
}

/**
 * ENGINE CORE: Imperative Tile Controller
 * Handles visibility, lifecycle, and rendering management for a single page.
 */
class PageTileRenderer {
  private tiles = new Map<string, HTMLCanvasElement>();
  private container: HTMLDivElement;
  private pdfPage: pdfjs.PDFPageProxy;
  private pageNumber: number;
  private side: 'left' | 'right';
  private readerDimensionsRef: React.RefObject<{ width: number, height: number }>;

  constructor(
    container: HTMLDivElement, 
    pdfPage: pdfjs.PDFPageProxy, 
    pageNumber: number,
    side: 'left' | 'right',
    readerDimensionsRef: React.RefObject<{ width: number, height: number }>
  ) {
    this.container = container;
    this.pdfPage = pdfPage;
    this.pageNumber = pageNumber;
    this.side = side;
    this.readerDimensionsRef = readerDimensionsRef;
  }

  update(params: {
    scale: number, 
    px: number, 
    py: number, 
    tier: number,
    version: number,
    isGestureActive: boolean
  }) {
    const { scale, px, py, tier, version, isGestureActive } = params;
    const viewport = this.pdfPage.getViewport({ scale: 1 });
    
    // 1. Calculate base layout scale (Fit to 400x600 logical box)
    const fitScale = Math.min(PAGE_LOGICAL_WIDTH / viewport.width, PAGE_LOGICAL_HEIGHT / viewport.height);
    const layoutScale = fitScale * scale;
    
    // 2. Viewport Math (Origin 0,0)
    const vw = this.readerDimensionsRef.current?.width || window.innerWidth;
    const vh = this.readerDimensionsRef.current?.height || window.innerHeight;
    
    // Determine world offset of this page inside the reader
    // (Single mode: center. Double mode: left/right of center)
    const pageOffset = this.side === 'left' ? 0 : PAGE_LOGICAL_WIDTH;
    const worldX = px + (pageOffset * scale);
    const worldY = py;

    // 3. Tile Generation logic
    const zoomedWidth = viewport.width * layoutScale;
    const zoomedHeight = viewport.height * layoutScale;

    const cols = Math.ceil(zoomedWidth / TILE_SIZE);
    const rows = Math.ceil(zoomedHeight / TILE_SIZE);

    const visibleKeys = new Set<string>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = c * TILE_SIZE;
        const ty = r * TILE_SIZE;

        // Clip Check: Is this tile visible in the reader viewport?
        const tileLeft = worldX + tx;
        const tileTop = worldY + ty;
        
        if (
          tileLeft < vw && tileLeft + TILE_SIZE > 0 &&
          tileTop < vh && tileTop + TILE_SIZE > 0
        ) {
          const key = `${this.pageNumber}-${version}-${tier}-${r}-${c}`;
          visibleKeys.add(key);

          if (!this.tiles.has(key)) {
            this.createTile(key, r, c, tier, layoutScale, tx, ty);
          }
        }
      }
    }

    // 4. Cleanup: Remove tiles that are no longer in the visible set
    this.tiles.forEach((canvas, key) => {
      if (!visibleKeys.has(key)) {
        canvas.remove();
        this.tiles.delete(key);
      }
    });

    return visibleKeys.size;
  }

  private async createTile(key: string, row: number, col: number, tier: number, layoutScale: number, tx: number, ty: number) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    canvas.className = 'absolute';
    canvas.style.left = `${tx / layoutScale}px`;
    canvas.style.top = `${ty / layoutScale}px`;
    canvas.style.width = `${TILE_SIZE / layoutScale}px`;
    canvas.style.height = `${TILE_SIZE / layoutScale}px`;
    
    this.container.appendChild(canvas);
    this.tiles.set(key, canvas);

    const cached = globalTileCache.get(key);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    if (cached) {
      ctx.drawImage(cached, 0, 0);
      return;
    }

    // Background placeholder
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Queue the heavy render
    globalRenderQueue.push({
      key,
      task: async () => {
        if (!this.tiles.has(key)) return; // Already unmounted

        const viewport = this.pdfPage.getViewport({ scale: 1 });
        const fitScale = Math.min(PAGE_LOGICAL_WIDTH / viewport.width, PAGE_LOGICAL_HEIGHT / viewport.height);
        
        const renderScale = fitScale * tier;
        const renderViewport = this.pdfPage.getViewport({ 
          scale: renderScale,
          offsetX: -(col * TILE_SIZE * (tier / layoutScale)),
          offsetY: -(row * TILE_SIZE * (tier / layoutScale)),
        });

        const offscreen = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
        const offCtx = offscreen.getContext('2d', { alpha: false })!;
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

        const renderTask = this.pdfPage.render({
          canvasContext: offCtx as any,
          viewport: renderViewport,
        });

        await renderTask.promise;
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

// --- HYBRID READER COMPONENT ---

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
  // 1. STATE & MOTION VALUES (From V1)
  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartInfo = useRef({ x: 0, y: 0, time: 0 });
  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const isAnimatingZoom = useRef(false);
  
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'double'>(window.innerWidth > 1024 ? 'double' : 'single');
  const [readerDimensions, setReaderDimensions] = useState({ width: 0, height: 0 });
  const readerDimensionsRef = useRef({ width: 0, height: 0 });

  // Panning & Zooming
  const [committedScale, setCommittedScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  // High-Res Settle Logic (From V2)
  const [settledScale, setSettledScale] = useState(1.0);
  const [renderTierScale, setRenderTierScale] = useState(1);
  const [renderVersion, setRenderVersion] = useState(0);
  const renderVersionRef = useRef(0);
  const isGestureActiveRef = useRef(false);
  const settleTimerRef = useRef<any>(null);

  const [debugInfo, setDebugInfo] = useState<any>({});
  const updateDebug = (info: any) => setDebugInfo((prev: any) => ({ ...prev, ...info }));

  const setGestureActive = (active: boolean) => {
    isGestureActiveRef.current = active;
    updateDebug({ gestureActive: active });
  };

  // Sync scale to liveScale
  useEffect(() => {
    if (isAnimatingZoom.current) return;
    animate(liveScale, committedScale, {
      type: 'spring',
      stiffness: 300,
      damping: 30
    });
  }, [committedScale]);

  const triggerSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      if (!isPinching.current && !isPanning.current && !isAnimatingZoom.current) {
        setGestureActive(false);
        renderVersionRef.current++;
        setRenderVersion(v => v + 1);
        setSettledScale(committedScale);
        
        let newTier = 1;
        if (committedScale <= 1.5) newTier = 1;
        else if (committedScale <= 3) newTier = 2;
        else if (committedScale <= 6) newTier = 4;
        else if (committedScale <= 12) newTier = 8;
        else newTier = 16;
        
        setRenderTierScale(newTier);
        updateDebug({ tier: newTier });
      }
    }, 150); 
  }, [committedScale]);

  useEffect(() => {
    triggerSettle();
    return () => clearTimeout(settleTimerRef.current);
  }, [committedScale, triggerSettle]);

  // General App State
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(book.readingDirection || 'ltr');
  const [pageIndex, setPageIndex] = useState(0); 
  const [isTemporal, setIsTemporal] = useState(false);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [navigatorTab, setNavigatorTab] = useState<'pages' | 'bookmarks'>('pages');
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);

  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);
  const currentDisplayPage = Math.min(currentPageNumber, numPages);

  const totalSheets = useMemo(() => {
    return viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;
  }, [numPages, viewMode]);

  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, { stiffness: 450, damping: 45, mass: 0.8 });

  const readerContainerRef = useRef<HTMLDivElement>(null);

  // Resize Handling
  useEffect(() => {
    if (!readerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const newDims = { width: entry.contentRect.width, height: entry.contentRect.height };
        setReaderDimensions(newDims);
        readerDimensionsRef.current = newDims;
      }
    });
    observer.observe(readerContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // PDF Loading
  useEffect(() => {
    async function loadPDF() {
      try {
        setIsLoading(true);
        const data = await get(book.fileDataId!);
        if (!data) throw new Error('PDF not found');
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data), stopAtErrors: false, enableXfa: true, cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`, cMapPacked: true });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        if (initialPage) {
          const mode = window.innerWidth > 1024 ? 'double' : 'single';
          setPageIndex(mode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        }
        setIsLoading(false);
      } catch (err: any) {
        setError(err.message);
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [book.fileDataId]);

  // GESTURE HANDLERS (From V1)
  const handlePageChange = (newIndex: number, isJump: boolean = false) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    if (safeIndex === pageIndex) return;
    setPageIndex(safeIndex);
    if (!isJump) onPageChange(viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1);
  };

  useEffect(() => {
    if (!isPanning.current) animate(virtualPage, pageIndex, { type: 'spring', stiffness: 450, damping: 45 });
  }, [pageIndex, virtualPage]);

  const handlePanStart = () => {
    if (isAnimatingZoom.current) return;
    setGestureActive(true);
    panX.stop(); panY.stop(); liveScale.stop();
    isPanning.current = true;
  };

  const handlePanMove = (_: any, info: any) => {
    if (gestureMode.current === GestureMode.SelectingText || isAnimatingZoom.current) return;
    const currentScaleValue = liveScale.get();
    const moveDist = Math.hypot(info.offset.x, info.offset.y);

    if (gestureMode.current === GestureMode.Idle && moveDist > 10) {
      if (currentScaleValue > 1.05) gestureMode.current = GestureMode.PanningZoomedPage;
      else if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) gestureMode.current = GestureMode.SwipingPages;
    }

    if (gestureMode.current === GestureMode.PanningZoomedPage) {
      const contentWidth = viewMode === 'double' ? 800 : 400;
      const zoomedW = contentWidth * currentScaleValue;
      const zoomedH = 600 * currentScaleValue;
      const vw = readerDimensions.width;
      const vh = readerDimensions.height;
      
      let nextX = panX.get() + info.delta.x;
      let nextY = panY.get() + info.delta.y;

      if (zoomedW > vw) nextX = Math.max(vw - zoomedW, Math.min(0, nextX));
      else nextX = (vw - zoomedW) / 2;
      if (zoomedH > vh) nextY = Math.max(vh - zoomedH, Math.min(0, nextY));
      else nextY = (vh - zoomedH) / 2;

      panX.set(nextX);
      panY.set(nextY);
    } else if (gestureMode.current === GestureMode.SwipingPages) {
      const scrollWidth = (viewMode === 'double' ? 800 : 400) + 40;
      const progress = info.offset.x / scrollWidth;
      virtualPage.set(direction === 'rtl' ? pageIndex + progress : pageIndex - progress);
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    isPanning.current = false;
    const mode = gestureMode.current;
    if (mode === GestureMode.PanningZoomedPage) {
      triggerSettle();
    } else if (mode === GestureMode.SwipingPages) {
      const threshold = 50;
      const velocityThreshold = 500;
      let nextIndex = pageIndex;
      if (direction === 'rtl') {
        if (info.offset.x > threshold || info.velocity.x > velocityThreshold) nextIndex++;
        else if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) nextIndex--;
      } else {
        if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) nextIndex++;
        else if (info.offset.x > threshold || info.velocity.x > velocityThreshold) nextIndex--;
      }
      handlePageChange(nextIndex);
    }
    gestureMode.current = GestureMode.Idle;
  };

  // Pinch Zoom (Simplified V1 logic)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && !isAnimatingZoom.current) {
      isPinching.current = true;
      gestureMode.current = GestureMode.PinchZooming;
    }
  };

  const handleTouchEnd = () => {
    isPinching.current = false;
    gestureMode.current = GestureMode.Idle;
    setCommittedScale(liveScale.get());
  };

  // UI Render
  return (
    <motion.div className="fixed inset-0 bg-zinc-950 flex flex-col z-[300] overflow-hidden select-none touch-none">
      {/* Header (V1 style) */}
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }} className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent z-[320] flex items-center px-4 gap-4">
             <button onClick={onClose} className="p-2 text-white/80 hover:bg-white/10 rounded-full"><X className="w-5 h-5"/></button>
             <div className="flex-1 min-w-0"><h3 className="text-white text-sm font-medium truncate">{book.title}</h3></div>
             <button onClick={() => setViewMode(v => v === 'single' ? 'double' : 'single')} className="p-2 text-white/80 hover:bg-white/10 rounded-full"><Maximize2 className="w-5 h-5"/></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Reader Viewport */}
      <div ref={readerContainerRef} className="flex-1 relative flex items-center justify-center overflow-hidden" onPointerDown={(e) => { if (e.detail === 2) setCommittedScale(s => s > 1.1 ? 1 : 2.5); }}>
         {isLoading ? <Loader2 className="w-10 h-10 animate-spin text-white/20"/> : (
           <motion.div className="relative w-full h-full" onPanStart={handlePanStart} onPan={handlePanMove} onPanEnd={handlePanEnd}>
              {Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i).map(sheetIndex => {
                if (sheetIndex < 0 || sheetIndex >= totalSheets) return null;
                return (
                  <ReaderSheet key={sheetIndex} index={sheetIndex} pdf={pdf!} numPages={numPages} viewMode={viewMode} direction={direction} virtualPage={smoothPage} liveScale={liveScale} settledScale={settledScale} renderTierScale={renderTierScale} renderVersion={renderVersion} isGestureActiveRef={isGestureActiveRef} panX={panX} panY={panY} containerDimensions={readerDimensions} isCurrent={sheetIndex === pageIndex} updateDebug={updateDebug} />
                );
              })}
           </motion.div>
         )}
      </div>

      {/* Footer Progress (V1 style) */}
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent z-[320] flex flex-col gap-4">
             <div className="max-w-2xl mx-auto w-full flex items-center gap-4">
               <span className="text-white/40 text-[10px] font-mono">{currentDisplayPage} / {numPages}</span>
               <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-orange-500" style={{ width: `${(currentDisplayPage / numPages) * 100}%` }}/>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- RENDERING SUB-COMPONENTS (Transplanted from V2) ---

const ReaderSheet = React.memo(({ index, pdf, numPages, viewMode, direction, virtualPage, liveScale, settledScale, renderTierScale, renderVersion, isGestureActiveRef, panX, panY, containerDimensions, isCurrent, updateDebug }: any) => {
  const distance = useTransform(virtualPage, (v: number) => index - v);
  const x = useTransform(distance, (d: number) => d * (direction === 'rtl' ? -100 : 100) + (isCurrent ? 0 : 0));
  const opacity = useTransform(distance, (d: number) => Math.abs(d) > 1.5 ? 0 : 1);
  const sheetWidth = viewMode === 'double' ? 800 : 400;

  return (
    <motion.div style={{ opacity, x: useTransform(x, v => `${v}%`), zIndex: useTransform(distance, d => 10 - Math.abs(d)) } as any} className="absolute inset-0 flex items-center justify-center perspective-[1500px]">
       <motion.div style={{ x: panX, y: panY, scale: liveScale, transformOrigin: "0 0", width: sheetWidth, height: 600 } as any} className="relative">
          {viewMode === 'double' ? (
            <>
              <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} tier={renderTierScale} settledScale={settledScale} version={renderVersion} gestureRef={isGestureActiveRef} side="left" panX={panX} panY={panY} liveScale={liveScale} dims={containerDimensions} isVisible={isCurrent} updateDebug={updateDebug}/>
              <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} tier={renderTierScale} settledScale={settledScale} version={renderVersion} gestureRef={isGestureActiveRef} side="right" panX={panX} panY={panY} liveScale={liveScale} dims={containerDimensions} isVisible={isCurrent} updateDebug={updateDebug}/>
            </>
          ) : (
            <SpreadPage pdf={pdf} pageNumber={index + 1} numPages={numPages} tier={renderTierScale} settledScale={settledScale} version={renderVersion} gestureRef={isGestureActiveRef} side="left" panX={panX} panY={panY} liveScale={liveScale} dims={containerDimensions} isVisible={isCurrent} updateDebug={updateDebug}/>
          )}
       </motion.div>
    </motion.div>
  );
});

const SpreadPage = React.memo(({ pdf, pageNumber, numPages, tier, settledScale, version, gestureRef, side, panX, panY, liveScale, dims, isVisible, updateDebug }: any) => {
  if (pageNumber > numPages) return <div className="absolute bg-zinc-800/20" style={{ width: 400, height: 600, left: side === 'right' ? 400 : 0 }}/>;
  return (
    <div className="absolute bg-white overflow-hidden" style={{ width: 400, height: 600, left: side === 'right' ? 400 : 0 }}>
       <PDFPageTileEngine pageNumber={pageNumber} pdf={pdf} tier={tier} settledScale={settledScale} version={version} gestureRef={gestureRef} panX={panX} panY={panY} dims={dims} isVisible={isVisible} updateDebug={updateDebug} side={side}/>
    </div>
  );
});

const PDFPageTileEngine = React.memo(({ pageNumber, pdf, tier, settledScale, version, gestureRef, panX, panY, dims, isVisible, updateDebug, side }: any) => {
  const paletteRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PageTileRenderer | null>(null);
  const readerDimsRef = useRef(dims);
  const [pdfPage, setPdfPage] = useState<any>(null);

  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(page => {
      if (!active) return;
      setPdfPage(page);
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        const viewport = page.getViewport({ scale: Math.min(400/page.getViewport({scale:1}).width, 600/page.getViewport({scale:1}).height) });
        page.getTextContent().then(textContent => {
           if (!active || !textLayerRef.current) return;
           textLayerRef.current.style.setProperty('--scale-factor', viewport.scale.toString());
           pdfjs.renderTextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport, textDivs: [] });
        });
      }
    });
    return () => { active = false; };
  }, [pdf, pageNumber]);

  const run = useCallback(() => {
    if (!isVisible || !pdfPage || !paletteRef.current || !dims.width) return;
    if (!engineRef.current) engineRef.current = new PageTileRenderer(paletteRef.current, pdfPage, pageNumber, side, readerDimsRef);
    engineRef.current.update({ scale: settledScale, px: panX.get(), py: panY.get(), tier, version, isGestureActive: gestureRef.current });
  }, [isVisible, pdfPage, settledScale, tier, version, panX, panY, dims]);

  useLayoutEffect(run, [run]);
  useMotionValueEvent(panX, "change", run);
  useMotionValueEvent(panY, "change", run);

  return (
    <div className="absolute inset-0 w-full h-full">
      <div ref={paletteRef} className="absolute inset-0 z-0" />
      <div ref={textLayerRef} className="absolute inset-0 textLayer z-10" />
    </div>
  );
});
