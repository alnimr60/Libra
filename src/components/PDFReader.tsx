import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { pdfjs, samplePDFText, detectDirectionFromText } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
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

interface TileKey {
  pageIndex: number;
  tier: number;
  row: number;
  col: number;
}

function getTileKey(k: TileKey) {
  return `${k.pageIndex}:${k.tier}:${k.row}:${k.col}`;
}

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
  console.log("[HOOK TRACE] PDFReader render");
  console.log("[PDFReader] Render");

  useEffect(() => {
    console.log("[PDFReader] COMPONENT MOUNTED");
    return () => {
      console.warn("[PDFReader] COMPONENT UNMOUNTED - Is this unexpected during gesture?");
    };
  }, []);
  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartInfo = useRef({ x: 0, y: 0, time: 0 });
  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const isAnimatingZoom = useRef(false);
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [committedScale, setCommittedScale] = useState(1.0);
  const [settledScale, setSettledScale] = useState(1.0);
  const [renderTierScale, setRenderTierScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  // Debug HUD State
  const [debugInfo, setDebugInfo] = useState({
    visibleTiles: 0,
    activeRenders: 0,
    cacheUsageMB: 0,
    tier: 1,
    worldRect: { x: 0, y: 0, w: 0, h: 0 }
  });

  const updateDebug = useCallback((info: Partial<typeof debugInfo>) => {
    setDebugInfo(prev => ({ ...prev, ...info, cacheUsageMB: globalTileCache.getUsageMB() }));
  }, []);

  // Sync state scale to liveScale motion value - INTERACTION ONLY
  useEffect(() => {
    animate(liveScale, committedScale, {
      type: 'spring',
      stiffness: 300,
      damping: 30
    });
  }, [committedScale]);

  // Settlement logic for high-res rendering - RENDERING ONLY
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isPinching.current && !isPanning.current && !isAnimatingZoom.current) {
        console.log("[PDFReader] Settle: Updating states", committedScale);
        setSettledScale(committedScale);
        
        // Discrete tier mapping
        if (committedScale <= 1.5) setRenderTierScale(1);
        else if (committedScale <= 3) setRenderTierScale(2);
        else if (committedScale <= 6) setRenderTierScale(4);
        else if (committedScale <= 12) setRenderTierScale(8);
        else setRenderTierScale(16);
      }
    }, 120); 
    return () => clearTimeout(timer);
  }, [committedScale]);

  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(book.readingDirection || 'ltr');
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  const [pageIndex, setPageIndex] = useState(0); // 0-based for internal math
  const [isTemporal, setIsTemporal] = useState(false);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [navigatorTab, setNavigatorTab] = useState<'pages' | 'bookmarks'>('pages');

  const bookmarks = book.bookmarks || [];
  const currentPageNumber = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const isCurrentlyBookmarked = bookmarks.some(bm => bm.page === currentPageNumber);

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
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const [readerDimensions, setReaderDimensions] = useState({ width: 0, height: 0 });

  const readerDimensionsRef = useRef({ width: 0, height: 0 });
  const pinchRef = useRef({ 
    initialDist: 0, 
    initialScale: 1, 
    initialPanX: 0, 
    initialPanY: 0, 
    midpoint: { x: 0, y: 0 } 
  });

  // Consolidated margins calculation for boundary clamping
  const getMargins = (scale: number) => {
    // Content dimensions are fixed at 400x600 per page
    const contentWidth = viewMode === 'double' ? 800 : 400;
    const contentHeight = 600;
    
    const zoomedWidth = contentWidth * scale;
    const zoomedHeight = contentHeight * scale;
    const viewportWidth = readerDimensionsRef.current.width || window.innerWidth;
    const viewportHeight = readerDimensionsRef.current.height || window.innerHeight;
    
    return {
      h: Math.max(0, (zoomedWidth - viewportWidth) / 2),
      v: Math.max(0, (zoomedHeight - viewportHeight) / 2)
    };
  };

  // Watch scale changes and clamp pan to visible bounds immediately
  useEffect(() => {
    const unsubscribe = liveScale.on("change", (latestScale) => {
      // Don't interfere if user is explicitly pining or pinching
      if (isPinching.current || isPanning.current) return;
      
      const { h, v } = getMargins(latestScale);

      const currentX = panX.get();
      const currentY = panY.get();
      
      let needsFix = false;
      let newX = currentX;
      let newY = currentY;

      if (currentX < -h) { newX = -h; needsFix = true; }
      if (currentX > h) { newX = h; needsFix = true; }
      if (currentY < -v) { newY = -v; needsFix = true; }
      if (currentY > v) { newY = v; needsFix = true; }
      
      if (needsFix) {
        panX.set(newX);
        panY.set(newY);
      }
    });
    return () => unsubscribe();
  }, [viewMode, liveScale, panX, panY]);

  useEffect(() => {
    if (!readerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        console.log("[PDFReader] Recalculating layout dimensions:", entry.contentRect.width, entry.contentRect.height);
        const newDims = {
          width: entry.contentRect.width,
          height: entry.contentRect.height
        };
        setReaderDimensions(newDims);
        readerDimensionsRef.current = newDims;
      }
    });
    observer.observe(readerContainerRef.current);
    return () => observer.disconnect();
  }, []);
  
  const handleReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const arrayBuffer = await file.arrayBuffer();
      
      // Generate a new ID to avoid any potential stale data issues
      const fileId = `pdf_${crypto.randomUUID()}`;
      await set(fileId, arrayBuffer);
      
      // Update the book in the parent state to persist the new link
      updateBook({ 
        ...book, 
        fileDataId: fileId 
      });
      
      setRetryKey(k => k + 1);
    } catch (err: any) {
      console.error('Failed to save to local storage', err);
      alert('Could not save PDF. Please check your browser storage.');
      setIsLoading(false);
    }
  };
  
  const baseWidth = 400; // Simplified

  // Double tap to zoom handler
  const lastTapInfo = useRef({ time: 0, x: 0, y: 0 });
  
  // Motion transforms for UI display - defined at top level to avoid conditional hook calls
  const liveScalePercent = useTransform(liveScale, v => `${Math.round(v * 100)}%`);
  const debugScale = useTransform(liveScale, v => typeof v === 'number' ? v.toFixed(3) : v);
  const debugPanX = useTransform(panX, v => typeof v === 'number' ? v.toFixed(1) : v);
  const debugPanY = useTransform(panY, v => typeof v === 'number' ? v.toFixed(1) : v);

  const handleDoubleTapZoom = (clientX: number, clientY: number) => {
    console.log("[DoubleTap] STEP 1: Entry", { clientX, clientY });
    try {
      if (!readerContainerRef.current) {
        console.warn("[DoubleTapZoom] Abort: No reader container ref");
        return;
      }
      
      // Safety lock: Don't interrupt existing zoom animations or pinch gestures
      if (isAnimatingZoom.current || isPinching.current) {
        console.log("[DoubleTapZoom] Locked: animation or pinch in progress", {
          isAnimatingZoom: isAnimatingZoom.current,
          isPinching: isPinching.current
        });
        return;
      }

      console.log("[DoubleTap] STEP 2: Pre-read scale");
      const currentScaleValue = liveScale.get();
      
      // Diagnostic logging
      console.log("[DoubleTapZoom] Start Event", {
        currentScale: currentScaleValue,
        currentScaleType: typeof currentScaleValue,
        currentScaleFinite: Number.isFinite(currentScaleValue)
      });

      if (!Number.isFinite(currentScaleValue)) {
        console.error("[DoubleTapZoom] CRITICAL ERROR: non-finite current scale.");
        // We no longer silently reset here to catch the true error
        throw new Error(`Non-finite currentScaleValue: ${currentScaleValue}`);
      }

      // Mark as animating zoom BEFORE anything else to lock other gestures
      isAnimatingZoom.current = true;

      console.log("[DoubleTap] STEP 3: Stopping previous animations");
      // Stop all active animations to prevent conflicts during transition
      liveScale.stop();
      panX.stop();
      panY.stop();

      const isZoomedOut = currentScaleValue <= 1.05;
      const targetScale = isZoomedOut ? 2.5 : 1.0;
      
      let targetPanX = 0;
      let targetPanY = 0;

      // Target pan to center on the safe tap point using focal point math
      // worldPoint = (screenPoint - pan) / scale
      // newPan = screenPoint - worldPoint * newScale
      const containerRect = readerContainerRef.current.getBoundingClientRect();
      const screenX = (clientX - containerRect.left) - containerRect.width / 2;
      const screenY = (clientY - containerRect.top) - containerRect.height / 2;
      const worldX = (screenX - panX.get()) / currentScaleValue;
      const worldY = (screenY - panY.get()) / currentScaleValue;

      if (isZoomedOut) {
        targetPanX = screenX - worldX * targetScale;
        targetPanY = screenY - worldY * targetScale;
        
        // Clamp target pan
        const contentWidth = viewMode === 'double' ? 800 : 400;
        const hMargin = Math.max(0, (contentWidth * targetScale - containerRect.width) / 2);
        const vMargin = Math.max(0, (600 * targetScale - containerRect.height) / 2);
        
        targetPanX = Math.max(-hMargin, Math.min(hMargin, targetPanX));
        targetPanY = Math.max(-vMargin, Math.min(vMargin, targetPanY));
      }
      
      console.log("[DoubleTap] STEP 4: Animation setup complete", { targetScale, isZoomedOut, targetPanX, targetPanY });

      // Handle UI controls state change cautiously
      if (isZoomedOut && showControls) {
        setShowControls(false);
      }

      console.log("[DoubleTap] STEP 5: Starting animate()");
      // Start the core imperative animation simultaneously
      const animConfig = { 
        type: 'spring', 
        stiffness: 300, 
        damping: 30
      };
      
      (animate as any)(liveScale, targetScale, animConfig);
      (animate as any)(panX, targetPanX, animConfig);
      (animate as any)(panY, targetPanY, {
        ...(animConfig as any),
        onComplete: () => {
          console.log("[DoubleTap] STEP 6: Animation complete callback start");
          try {
            console.log("[DoubleTapZoom] Animation Complete, Syncing committedScale", { targetScale });
            setCommittedScale(targetScale);
            
            console.log("[DoubleTap] STEP 7: committedScale updated");
            requestAnimationFrame(() => {
              isAnimatingZoom.current = false;
              console.log("[DoubleTapZoom] Lock Released Successfully");
            });
          } catch (syncErr) {
            console.error("[DoubleTapCrash] Error in onComplete sync:", syncErr);
            isAnimatingZoom.current = false;
            throw syncErr;
          }
        }
      });

    } catch (err) {
      console.error("[DoubleTapCrash] CRITICAL FAILURE in handleDoubleTapZoom", err);
      isAnimatingZoom.current = false;
      // Re-throw to ensure the crash is visible to the ErrorBoundary or Global listeners
      throw err;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    try {
      const target = e.target as HTMLElement;
      if (target.closest('button, input')) return;
      
      // Clear any existing long press timer
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      
      // Reset selection if not already in selection mode
      if (gestureMode.current !== GestureMode.SelectingText) {
        // window.getSelection()?.removeAllRanges(); // Optional: clear selection on new tap
      }

      touchStartInfo.current = { x: e.clientX, y: e.clientY, time: Date.now() };

      // Handle Double Tap Zoom
      const now = Date.now();
      const dx = e.clientX - lastTapInfo.current.x;
      const dy = e.clientY - lastTapInfo.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (now - lastTapInfo.current.time < 300 && dist < 15) {
        handleDoubleTapZoom(e.clientX, e.clientY);
        lastTapInfo.current = { time: 0, x: 0, y: 0 };
        return;
      } else {
        lastTapInfo.current = { time: now, x: e.clientX, y: e.clientY };
      }

      // Long press detection for text
      const isText = target.tagName.toLowerCase() === 'span' || target.closest('.textLayer span');
      if (isText) {
        longPressTimer.current = setTimeout(() => {
          if (gestureMode.current === GestureMode.Idle) {
            console.log("[PDFReader] Entering SelectingText mode via long press");
            gestureMode.current = GestureMode.SelectingText;
            // Trigger a small vibration if possible
            if (navigator.vibrate) navigator.vibrate(50);
          }
        }, 500);
      }
    } catch (err) {
      console.error("[GestureCrash] Error in handlePointerDown:", err);
      throw err;
    }
  };
  
  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, {
    stiffness: 450,
    damping: 45,
    mass: 0.8
  });

  // Toggle direction manually
  const toggleDirection = () => {
    setDirection(prev => {
      const next = prev === 'ltr' ? 'rtl' : 'ltr';
      updateBook({ 
        ...book, 
        readingDirection: next,
        directionDetected: true // Manual override marks as completed
      });
      return next;
    });
  };

  // Automatic reading direction detection
  useEffect(() => {
    if (!pdf || book.directionDetected) {
      if (book.directionDetected) {
        console.log(`[DirectionDetection] already detected for "${book.title}", skipping.`);
      }
      return;
    }

    const runDetection = async () => {
      console.log(`[DirectionDetection] Starting detection for "${book.title}"`);
      try {
        const text = await samplePDFText(pdf);
        const detected = detectDirectionFromText(text);
        
        console.log(`[DirectionDetection] Final decision for "${book.title}": ${detected.toUpperCase()}`);
        
        // Update local state
        setDirection(detected);
        
        // Persist result
        updateBook({
          ...book,
          readingDirection: detected,
          directionDetected: true
        });
      } catch (err) {
        console.error(`[DirectionDetection] Failed to run detection:`, err);
      }
    };

    runDetection();
  }, [pdf, book.id, book.directionDetected]);

  // Keep virtualPage in sync with state
  useEffect(() => {
    if (!isDragging) {
      animate(virtualPage, pageIndex, {
        type: 'spring',
        stiffness: 450,
        damping: 45
      });
    }
  }, [pageIndex, isDragging, virtualPage]);

  const handlePanStart = (e: any, info: any) => {
    try {
      // If we are already in a specific mode, don't re-evaluate
      if (gestureMode.current !== GestureMode.Idle || isAnimatingZoom.current) return;
      
      // Stop any running animations
      panX.stop();
      panY.stop();
      liveScale.stop();
      
      isPanning.current = true;
      // We stay Idle until movement threshold is met or long-press triggers
    } catch (err) {
      console.error("[GestureCrash] Error in handlePanStart:", err);
      throw err;
    }
  };

  const handlePanMove = (_: any, info: any) => {
    try {
      // If in SelectingText, browsers handle everything
      if (gestureMode.current === GestureMode.SelectingText || isAnimatingZoom.current) return;

      // Movement threshold check to cancel long press
      const moveDist = Math.sqrt(Math.pow(info.offset.x, 2) + Math.pow(info.offset.y, 2));
      if (moveDist > 10 && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const currentScaleValue = liveScale.get();

      // Determine mode if still Idle
      if (gestureMode.current === GestureMode.Idle && moveDist > 10) {
        if (currentScaleValue > 1.05) {
          gestureMode.current = GestureMode.PanningZoomedPage;
        } else if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
          gestureMode.current = GestureMode.SwipingPages;
        }
        setIsDragging(true);
      }

      if (gestureMode.current === GestureMode.PanningZoomedPage) {
        const currentScaleValue = liveScale.get();
        // PANNING MODE (clamped)
        const contentWidth = viewMode === 'double' ? 800 : 400;
        const zoomedWidth = contentWidth * currentScaleValue;
        const zoomedHeight = 600 * currentScaleValue;
        const viewportWidth = readerDimensions.width;
        const viewportHeight = readerDimensions.height;
        
        const hMargin = Math.max(0, (zoomedWidth - viewportWidth) / 2);
        const vMargin = Math.max(0, (zoomedHeight - viewportHeight) / 2);

        const nextX = panX.get() + info.delta.x;
        const nextY = panY.get() + info.delta.y;

        const clampedX = Math.max(-hMargin, Math.min(hMargin, nextX));
        const clampedY = Math.max(-vMargin, Math.min(vMargin, nextY));

        panX.set(clampedX);
        panY.set(clampedY);
      } else if (gestureMode.current === GestureMode.SwipingPages) {
        // SWIPE MODE
        const scrollWidth = window.innerWidth;
        const progress = info.offset.x / scrollWidth;
        
        if (direction === 'rtl') {
          virtualPage.set(pageIndex + progress);
        } else {
          virtualPage.set(pageIndex - progress);
        }
      }
    } catch (err) {
      console.error("[GestureCrash] Error in handlePanMove:", err);
      throw err;
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    try {
      isPanning.current = false;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      if (gestureMode.current === GestureMode.SelectingText) {
        // Keep mode until touchend manually? Usually browsers handle selection handles.
        // We reset on handleTouchEnd/pointerup
        return;
      }

      const mode = gestureMode.current;
      if (mode === GestureMode.PanningZoomedPage) {
        setIsDragging(false);
        const currentScaleValue = liveScale.get();
        // INERTIAL PANNING
        const velocityX = info.velocity.x;
        const velocityY = info.velocity.y;
        
        const contentWidth = viewMode === 'double' ? 800 : 400;
        const zoomedWidth = contentWidth * currentScaleValue;
        const zoomedHeight = 600 * currentScaleValue;
        const viewportWidth = readerDimensions.width;
        const viewportHeight = readerDimensions.height;
        
        const hMargin = Math.max(0, (zoomedWidth - viewportWidth) / 2);
        const vMargin = Math.max(0, (zoomedHeight - viewportHeight) / 2);

        animate(panX, panX.get() + velocityX * 0.1, {
          type: 'spring',
          stiffness: 100,
          damping: 30,
          restDelta: 0.5,
          onUpdate: (v) => {
            if (v < -hMargin) panX.set(-hMargin);
            if (v > hMargin) panX.set(hMargin);
          }
        });
        animate(panY, panY.get() + velocityY * 0.1, {
          type: 'spring',
          stiffness: 100,
          damping: 30,
          restDelta: 0.5,
          onUpdate: (v) => {
            if (v < -vMargin) panY.set(-vMargin);
            if (v > vMargin) panY.set(vMargin);
          }
        });
      } else if (mode === GestureMode.SwipingPages) {
        setIsDragging(false);
        const offset = info.offset.x;
        const velocity = info.velocity.x;
        const threshold = 50;
        const velocityThreshold = 500;
        
        let nextIndex = pageIndex;
        if (direction === 'rtl') {
          if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex + 1;
          else if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex - 1;
        } else {
          if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex + 1;
          else if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex - 1;
        }
        handlePageChange(Math.max(0, Math.min(nextIndex, totalSheets - 1)));
      }

      gestureMode.current = GestureMode.Idle;
    } catch (err) {
      console.error("[GestureCrash] Error in handlePanEnd:", err);
      throw err;
    }
  };


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
        if (!fileDataId) {
          throw new Error('No PDF file attached to this book. You can manually track your progress from the Library tab by editing the book details.');
        }
        
        const data = await get(fileDataId);
        
        if (!data) {
          throw new Error('This book\'s PDF file could not be found in local storage. This can happen if browser data was cleared. Please re-select the PDF file.');
        }
        
    const loadingTask = pdfjs.getDocument({ 
      data: new Uint8Array(data),
      stopAtErrors: false,
      enableXfa: true,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      disableRange: true,
      disableStream: true
    });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setDirection(book.readingDirection || 'ltr');

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
  }, [fileDataId, retryKey]);

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
  
  const handlePageChange = (newIndex: number, isJump: boolean = false) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    if (safeIndex === pageIndex) return;
    
    setPageIndex(safeIndex);
    
    if (typeof window !== 'undefined' && 'vibrate' in navigator && !isJump) {
      navigator.vibrate(10);
    }
    
    if (isJump) {
      setIsTemporal(true);
    } else if (!isTemporal) {
      // Auto update progress if not in temporal mode
      const displayPage = viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1;
      onPageChange(Math.min(displayPage, numPages));
    }
  };

  const handleSyncProgress = () => {
    const displayPage = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
    onPageChange(Math.min(displayPage, numPages));
    setIsTemporal(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && !isAnimatingZoom.current) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      
      gestureMode.current = GestureMode.PinchZooming;
      isPinching.current = true;
      setIsDragging(false);
      
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      
      if (!readerContainerRef.current) return;
      const rect = readerContainerRef.current.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      pinchRef.current = {
        initialDist: dist,
        initialScale: liveScale.get(),
        initialPanX: panX.get(),
        initialPanY: panY.get(),
        midpoint: { x: midX - centerX, y: midY - centerY }
      };
      
      liveScale.stop();
      panX.stop();
      panY.stop();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (gestureMode.current === GestureMode.PinchZooming && e.touches.length === 2 && !isAnimatingZoom.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      
      const scaleDelta = dist / pinchRef.current.initialDist;
      let nextScale = pinchRef.current.initialScale * scaleDelta;
      
      // Real-time clamping for architecture limits (0.5 to 10 for safety during pinch)
      nextScale = Math.max(0.5, Math.min(6, nextScale)); 
      
      liveScale.set(nextScale);
      
      const actualScaleDelta = nextScale / pinchRef.current.initialScale;
      const p_v = pinchRef.current.midpoint;
      
      // Focal point zoom: NewPan = FocalPoint - (FocalPoint - OldPan) * ScaleRatio
      const nextPanX = p_v.x - (p_v.x - pinchRef.current.initialPanX) * actualScaleDelta;
      const nextPanY = p_v.y - (p_v.y - pinchRef.current.initialPanY) * actualScaleDelta;
      
      const contentWidth = viewMode === 'double' ? 800 : 400;
      const zoomedWidth = contentWidth * nextScale;
      const zoomedHeight = 600 * nextScale;
      const containerW = readerDimensionsRef.current.width || window.innerWidth;
      const containerH = readerDimensionsRef.current.height || window.innerHeight;
      
      const hMargin = Math.max(0, (zoomedWidth - containerW) / 2);
      const vMargin = Math.max(0, (zoomedHeight - containerH) / 2);
      
      panX.set(Math.max(-hMargin, Math.min(hMargin, nextPanX)));
      panY.set(Math.max(-vMargin, Math.min(vMargin, nextPanY)));
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (gestureMode.current === GestureMode.PinchZooming) {
      const finalScale = Math.max(0.5, Math.min(5, liveScale.get()));
      setCommittedScale(finalScale);
      isPinching.current = false;
      gestureMode.current = GestureMode.Idle;
    } else if (gestureMode.current === GestureMode.SelectingText) {
      // If we were selecting, reset mode on touch end to Allow new gestures
      gestureMode.current = GestureMode.Idle;
    }
  };

  const currentDisplayPage = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
  const showSyncButton = isTemporal && Math.min(currentDisplayPage, numPages) !== book.currentPage;

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col overflow-hidden transition-all duration-500"
    >
      <AnimatePresence>
        {isNavigatorOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-zinc-950/90 backdrop-blur-3xl flex items-center justify-center p-6 select-none"
            onClick={() => setIsNavigatorOpen(false)}
            dir={direction === 'rtl' ? 'rtl' : 'ltr'}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="w-full max-w-sm flex flex-col items-center gap-8 px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex bg-white/5 p-1 rounded-2xl w-full">
                <button 
                  onClick={() => setNavigatorTab('pages')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                    navigatorTab === 'pages' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                  )}
                >
                  Pages
                </button>
                <button 
                  onClick={() => setNavigatorTab('bookmarks')}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    navigatorTab === 'bookmarks' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                  )}
                >
                  Bookmarks
                  {bookmarks.length > 0 && (
                    <span className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[8px]",
                      navigatorTab === 'bookmarks' ? "bg-black text-white" : "bg-white/20 text-white"
                    )}>
                      {bookmarks.length}
                    </span>
                  )}
                </button>
              </div>

              {navigatorTab === 'pages' ? (
                <div className="w-full flex flex-col items-center gap-12 py-4">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.6em] select-none">Navigation</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-9xl font-serif text-white tracking-tighter leading-none select-none">
                        {pageIndex + 1}
                      </span>
                      <span className="text-xl font-serif text-white/10 select-none">/ {totalSheets}</span>
                    </div>
                  </div>
                  
                  <div className="w-full space-y-6">
                    <input 
                      type="range"
                      min={0}
                      max={totalSheets - 1}
                      value={pageIndex}
                      onChange={(e) => handlePageChange(parseInt(e.target.value, 10), true)}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer hover:accent-orange-500 transition-colors"
                      dir={direction === 'rtl' ? 'rtl' : 'ltr'}
                    />
                    <div className="flex justify-between text-[8px] font-mono text-white/10 uppercase tracking-widest px-1">
                      <span>Start</span>
                      <span>End</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-h-[40vh] overflow-y-auto no-scrollbar py-2 space-y-2">
                  {bookmarks.length === 0 ? (
                    <div className="py-12 text-center">
                      <BookmarkIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                      <p className="text-xs text-white/20 font-mono uppercase tracking-widest leading-relaxed">
                        No bookmarks found<br/>in this volume.
                      </p>
                    </div>
                  ) : (
                    bookmarks
                      .sort((a, b) => a.page - b.page)
                      .map((bm) => (
                      <div 
                        key={bm.id}
                        className="group flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all"
                      >
                        <button 
                          onClick={() => {
                            const newIndex = viewMode === 'double' ? Math.floor((bm.page - 1) / 2) : bm.page - 1;
                            handlePageChange(newIndex, true);
                            setIsNavigatorOpen(false);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-baseline gap-3">
                            <span className="text-3xl font-serif text-white tracking-tighter">P{bm.page}</span>
                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">
                              {new Date(bm.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </button>
                        <button 
                          onClick={() => onUpdateBookmarks(bookmarks.filter(b => b.id !== bm.id))}
                          className="p-2 text-white/10 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button 
                onClick={() => setIsNavigatorOpen(false)}
                className="group p-8 rounded-full bg-white/5 border border-white/10 hover:bg-white hover:text-black transition-all active:scale-95 flex items-center justify-center shadow-2xl mt-4"
              >
                <Check className="w-8 h-8" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reader Controls Top */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -120 }}
            animate={{ y: 0 }}
            exit={{ y: -120 }}
            style={{ paddingTop: `${insets.top + (isLandscape ? 8 : 16)}px` }}
            dir={direction === 'rtl' ? "rtl" : "ltr"}
            className={cn(
              "fixed top-0 left-0 right-0 flex items-center justify-between gap-4 text-white/70 border-b border-white/5 bg-zinc-950/90 backdrop-blur-2xl z-[310] transition-all select-none",
              isLandscape ? "p-2 px-6 pb-2" : "p-4 pb-4"
            )}
          >
            <div className="flex items-center gap-2 md:gap-4 font-mono">
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-75">
                <X className={cn(isLandscape ? "w-5 h-5" : "w-6 h-6")} />
              </button>
              
              <button 
                onClick={toggleDirection}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all active:scale-95",
                  direction === 'rtl' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/5"
                )}
              >
                <Languages className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">{direction}</span>
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setIsNavigatorOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 transition-all active:scale-95 group"
              >
                <div className="text-[10px] md:text-sm tracking-tighter font-mono">
                  <span className="text-white font-bold">
                    {viewMode === 'double' ? `${(pageIndex * 2) + 1}${ (pageIndex * 2) + 2 <= numPages ? '-' + ((pageIndex * 2) + 2) : '' }` : pageIndex + 1}
                  </span> 
                  <span className="opacity-20 mx-2">/</span> 
                  <span className="opacity-40">{numPages}</span>
                </div>
                <Navigation className="w-3 h-3 text-orange-500 opacity-40 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleBookmark(); }}
                className={cn(
                  "p-2.5 rounded-full border transition-all active:scale-75 shadow-lg",
                  isCurrentlyBookmarked 
                    ? "bg-orange-500 text-white border-orange-400" 
                    : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                )}
              >
                <BookmarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className={cn(
                "flex items-center gap-1 bg-white/5 rounded-full border border-white/10 shadow-lg pointer-events-auto",
                isLandscape ? "px-1 py-0.5" : "px-2 py-1"
              )}>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const next = Math.max(0.5, committedScale - 0.5);
                    setCommittedScale(next);
                  }} 
                  className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
                >
                  <Minus className={cn(isLandscape ? "w-3 h-3" : "w-4 h-4")} />
                </button>
                <div className="flex flex-col items-center min-w-[36px]">
                  <motion.span className="text-[10px] font-mono font-bold leading-none text-center select-none text-white">
                    {liveScalePercent}
                  </motion.span>
                </div>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const next = Math.min(5, committedScale + 0.5);
                    setCommittedScale(next);
                  }} 
                  className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
                >
                  <Plus className={cn(isLandscape ? "w-3 h-3" : "w-4 h-4")} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Viewport */}
      <div 
        ref={readerContainerRef}
        className="flex-1 relative bg-zinc-900 border-4 border-yellow-500"
        style={{ touchAction: 'none', overflow: 'visible' }}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          // If text is selected, do not trigger page turn or click actions
          if (window.getSelection()?.toString().trim().length) {
            return;
          }

          if ((e.target as HTMLElement).closest('.textLayer')) return;

          // If controls are shown, clicking hides them. If hidden, clicking might show them OR turn page.
          if (!showControls) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            if (x < width * 0.25) {
              // Clicked left quarter
              handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1);
              return;
            } else if (x > width * 0.75) {
              // Clicked right quarter
              handlePageChange(direction === 'ltr' ? pageIndex + 1 : pageIndex - 1);
              return;
            }
          }
          if (showControls) {
            setShowControls(false);
          } else {
            setShowControls(true);
          }
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
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="cursor-pointer px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-white text-sm transition-colors flex items-center justify-center">
                <span>Select PDF again</span>
                <input 
                  type="file" 
                  accept="application/pdf"
                  className="hidden" 
                  onChange={handleReupload}
                />
              </label>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm transition-colors"
              >
                Close Reader
              </button>
            </div>
          </div>
        ) : (
          <motion.div 
            className="relative w-full h-full"
            onPanStart={handlePanStart}
            onPan={handlePanMove}
            onPanEnd={handlePanEnd}
          >
            {/* Windowed view of pages */}
            {(() => {
              // Freeze virtualization indices during zoom to prevent component remounts/recycling mid-animation
              const indices = Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i);
              return indices.map(sheetIndex => {
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
                    liveScale={liveScale}
                    renderTierScale={renderTierScale}
                    settledScale={settledScale}
                    committedScale={committedScale}
                    isLandscape={isLandscape}
                    containerDimensions={readerDimensions}
                    readerDimensionsRef={readerDimensionsRef}
                    panX={panX}
                    panY={panY}
                    isCurrent={sheetIndex === pageIndex}
                    updateDebug={updateDebug}
                  />
                );
              });
            })()}
          </motion.div>
        )}
      </div>

      {/* Debug Overlay */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 right-4 z-[999] bg-black/90 text-zinc-400 p-4 rounded-xl font-mono text-[9px] pointer-events-none border border-white/10 flex flex-col gap-2 shadow-2xl min-w-[180px]">
          <div className="flex items-center gap-2 text-orange-500 mb-1 border-b border-white/5 pb-2">
            <Activity className="w-3 h-3" />
            <span className="uppercase tracking-[0.2em] font-bold">Engine HUD</span>
          </div>
          
          <div className="grid grid-cols-2 gap-y-1 gap-x-4">
            <span className="opacity-40 uppercase">Scale:</span>
            <motion.span className="text-white text-right">{debugScale}</motion.span>
            
            <span className="opacity-40 uppercase">Pan X/Y:</span>
            <div className="flex justify-end gap-1 text-white">
              <motion.span>{debugPanX}</motion.span>
              <span className="opacity-20">/</span>
              <motion.span>{debugPanY}</motion.span>
            </div>

            <span className="opacity-40 uppercase">TIER:</span>
            <span className="text-white text-right">{debugInfo.tier}x</span>

            <span className="opacity-40 uppercase">TILES:</span>
            <span className="text-white text-right font-bold">{debugInfo.visibleTiles} visible</span>

            <span className="opacity-40 uppercase">RENDER:</span>
            <span className={cn("text-right font-bold", debugInfo.activeRenders > 0 ? "text-orange-500" : "text-green-500")}>
              {debugInfo.activeRenders} active
            </span>

            <span className="opacity-40 uppercase">CACHE:</span>
            <span className="text-white text-right">{debugInfo.cacheUsageMB.toFixed(1)} MB</span>
          </div>

          <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-1">
             <div className="flex justify-between">
                <span className="opacity-40 uppercase">View:</span>
                <span className="text-white/60">{viewMode.toUpperCase()}</span>
             </div>
             <div className="flex justify-between">
                <span className="opacity-40 uppercase">Device:</span>
                <span className="text-white/60">DPR {window.devicePixelRatio}</span>
             </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {false && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[450]"
          >
            <button
              onClick={() => {
                // handleDoneSelecting
              }}
              className="px-6 py-3 bg-orange-500 text-white rounded-full font-mono text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 transition-transform flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Done Selecting
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Footer */}
      <AnimatePresence>
        {showControls && !isLoading && !error && (
          <motion.div 
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            dir={direction === 'rtl' ? "rtl" : "ltr"}
            style={{ paddingBottom: `${insets.bottom + (isLandscape ? 8 : 16)}px` }}
            className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-zinc-950/90 backdrop-blur-2xl shadow-2xl border-t border-white/5 z-[310] select-none"
          >
            <div className="max-w-2xl mx-auto flex items-center gap-6">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full relative overflow-hidden">
                <motion.div 
                  className="absolute inset-y-0 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                  animate={{ 
                    left: direction === 'rtl' ? "auto" : 0,
                    right: direction === 'rtl' ? 0 : "auto",
                    width: `${((pageIndex + 1) / totalSheets) * 100}%` 
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>

              <AnimatePresence>
                {showSyncButton && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: 20 }}
                    onClick={(e) => { e.stopPropagation(); handleSyncProgress(); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Sync to Page {currentDisplayPage}</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const ReaderSheet = React.memo(function ReaderSheet({ 
  index, 
  pdf, 
  numPages, 
  viewMode, 
  direction, 
  virtualPage, 
  liveScale, 
  renderTierScale,
  settledScale,
  committedScale,
  isLandscape,
  containerDimensions,
  readerDimensionsRef, // Pass ref
  panX,
  panY,
  isCurrent,
  updateDebug
}: { 
  index: number, 
  pdf: pdfjs.PDFDocumentProxy, 
  numPages: number, 
  viewMode: 'single' | 'double',
  direction: 'ltr' | 'rtl',
  virtualPage: any,
  liveScale: any,
  renderTierScale: number,
  settledScale: number,
  committedScale: number,
  isLandscape: boolean,
  containerDimensions: { width: number, height: number },
  readerDimensionsRef: React.RefObject<{ width: number, height: number }>,
  panX: any,
  panY: any,
  isCurrent: boolean,
  updateDebug: (info: any) => void
}) {
  console.log(`[HOOK TRACE] ReaderSheet render index: ${index}`);
  const distance = useTransform(virtualPage, (v: number) => index - v);
  
  const x = useTransform(distance, (d: number) => {
    const multiplier = direction === 'rtl' ? -100 : 100;
    return d * multiplier;
  });
  
  const zIndex = useTransform(distance, (d: number) => 10 - Math.abs(Math.round(d)));
  const rotateY = useTransform(distance, (d: number) => d * (direction === 'rtl' ? -10 : 10));
  const transitionScale = useTransform(distance, (d: number) => 1 - (Math.abs(d) * 0.05));
  const totalScale = useTransform([liveScale, transitionScale], ([s, ts]) => {
    const combined = (s as number) * (ts as number);
    return combined;
  });
  
  const opacity = useTransform(distance, (d: number) => {
    if (d <= -1.5 || d >= 1.5) return 0;
    if (d <= -0.5) return (d + 1.5);
    if (d >= 0.5) return (1.5 - d);
    return 1;
  });
  
  const visibility = useTransform(distance, (d: number) => Math.abs(d) <= 1.5 ? 'visible' : 'hidden');
  const cameraLayerRef = useRef<HTMLDivElement>(null);

  const sheetWidth = viewMode === 'double' ? 800 : 400;

  return (
    <motion.div
      style={{ 
        opacity, 
        visibility, 
        zIndex,
        x,
        rotateY,
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
        willChange: 'transform'
      } as any}
      className={cn(
        "absolute inset-0 flex items-center justify-center select-none bg-blue-900/10",
        "border-2 border-dashed border-white/10 overflow-hidden"
      )}
    >
          <motion.div 
            id={`sheet-${index}-camera-layer`}
            ref={cameraLayerRef}
            style={{ 
              x: panX,
              y: panY,
              left: '50%',
              top: '50%',
              marginLeft: -sheetWidth / 2,
              marginTop: -300,
              scale: liveScale,
              transformOrigin: "0 0",
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
              width: sheetWidth,
              height: 600,
              willChange: 'transform',
              pointerEvents: 'none'
            } as any}
            className="absolute"
          >
            {viewMode === 'double' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} renderTierScale={renderTierScale} settledScale={settledScale} side="left" direction={direction} panX={panX} panY={panY} liveScale={liveScale} containerDimensions={containerDimensions} readerDimensionsRef={readerDimensionsRef} viewMode={viewMode} updateDebug={updateDebug} isVisible={isCurrent} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} renderTierScale={renderTierScale} settledScale={settledScale} side="right" direction={direction} panX={panX} panY={panY} liveScale={liveScale} containerDimensions={containerDimensions} readerDimensionsRef={readerDimensionsRef} viewMode={viewMode} updateDebug={updateDebug} isVisible={isCurrent} />
              </>
            ) : (
              <SpreadPage pdf={pdf} pageNumber={index + 1} numPages={numPages} renderTierScale={renderTierScale} settledScale={settledScale} side="left" direction={direction} panX={panX} panY={panY} liveScale={liveScale} containerDimensions={containerDimensions} readerDimensionsRef={readerDimensionsRef} viewMode={viewMode} updateDebug={updateDebug} isVisible={isCurrent} />
            )}
        </motion.div>
    </motion.div>
  );
});

const SpreadPage = React.memo(function SpreadPage({ 
  pdf, 
  pageNumber, 
  numPages, 
  renderTierScale,
  settledScale,
  side, 
  direction, 
  panX, 
  panY, 
  liveScale, 
  containerDimensions,
  readerDimensionsRef,
  viewMode,
  updateDebug,
  isVisible
}: { 
  pdf: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  numPages: number, 
  renderTierScale: number,
  settledScale: number,
  side: 'left' | 'right', 
  direction: 'ltr' | 'rtl',
  panX: any, 
  panY: any,
  liveScale: any,
  containerDimensions: { width: number, height: number },
  readerDimensionsRef: React.RefObject<{ width: number, height: number }>,
  viewMode: 'single' | 'double',
  updateDebug: (info: any) => void,
  isVisible: boolean
}) {
  const isOutOfBounds = pageNumber > numPages;
  
  if (isOutOfBounds) {
    return (
      <div 
        className="bg-zinc-800 absolute top-0" 
        style={{ 
          width: 400, 
          height: 600, 
          opacity: 0.1,
          left: side === 'right' ? 400 : 0
        }} 
      />
    );
  }

  return (
    <div 
      className={cn(
        "bg-white absolute top-0 overflow-hidden",
        side === 'left' ? "rounded-l-md" : "rounded-r-md"
      )}
      style={{ 
        width: 400,
        height: 600,
        left: side === 'right' ? 400 : 0,
        zIndex: side === 'right' ? 1 : 2
      }}
    >
      <PDFPageTileEngine 
        pageNumber={pageNumber} 
        pdf={pdf} 
        renderTierScale={renderTierScale}
        settledScale={settledScale}
        panX={panX} 
        panY={panY} 
        liveScale={liveScale} 
        containerDimensions={containerDimensions}
        readerDimensionsRef={readerDimensionsRef}
        isVisible={isVisible}
        updateDebug={updateDebug}
        side={side}
      />
    </div>
  );
});

// --- NEW TILE ENGINE COMPONENTS ---

const PDFPageTileEngine = React.memo(({ 
  pageNumber, 
  pdf, 
  renderTierScale,
  settledScale,
  panX, 
  panY, 
  liveScale, 
  containerDimensions,
  readerDimensionsRef,
  isVisible,
  updateDebug,
  side
}: {
  pageNumber: number,
  pdf: pdfjs.PDFDocumentProxy,
  renderTierScale: number,
  settledScale: number,
  panX: any,
  panY: any,
  liveScale: any,
  containerDimensions: { width: number, height: number },
  readerDimensionsRef: React.RefObject<{ width: number, height: number }>,
  isVisible: boolean,
  updateDebug: (info: any) => void,
  side: 'left' | 'right'
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const palette = useRef<HTMLDivElement>(null);
  const pdfPageRef = useRef<pdfjs.PDFPageProxy | null>(null);
  const tilesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Fixed tier selection logic
  const tier = renderTierScale;

  // Load PDF page proxy
  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(page => {
      if (active) pdfPageRef.current = page;
    });
    return () => { active = false; };
  }, [pdf, pageNumber]);

  // Tile rendering logic
  const renderTile = useCallback(async (t: TileKey) => {
    const page = pdfPageRef.current;
    if (!page || !palette.current) return;

    const key = getTileKey(t);
    const cached = globalTileCache.get(key);
    
    // Find or create canvas for this tile position
    let canvas = tilesRef.current.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      canvas.style.position = 'absolute';
      
      const dpr = window.devicePixelRatio || 1;
      const viewportBase = pdfPageRef.current.getViewport({ scale: 1 });
      const fitScale = Math.min(400 / viewportBase.width, 600 / viewportBase.height);
      const logicalTileDim = TILE_SIZE / (fitScale * t.tier * dpr);
      
      canvas.style.width = `${Math.round(logicalTileDim)}px`;
      canvas.style.height = `${Math.round(logicalTileDim)}px`;
      canvas.style.left = `${Math.round(t.col * logicalTileDim)}px`;
      canvas.style.top = `${Math.round(t.row * logicalTileDim)}px`;
      
      canvas.dataset.tileKey = key;
      canvas.style.opacity = '0';
      canvas.style.transition = 'opacity 0.25s ease-out';
      canvas.style.zIndex = String(t.tier); // Higher tier on top
      
      palette.current.appendChild(canvas);
      tilesRef.current.set(key, canvas);
    }

    if (cached) {
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(cached, 0, 0);
      canvas.style.opacity = '1';
      return;
    }

    // Queue render task
    globalRenderQueue.push({
      key,
      task: async () => {
        if (!pdfPageRef.current) return;
        
        const dpr = window.devicePixelRatio || 1;
        const viewportBase = pdfPageRef.current.getViewport({ scale: 1 });
        const fitScale = Math.min(400 / viewportBase.width, 600 / viewportBase.height);
        
        const targetRenderScale = fitScale * t.tier * dpr;
        const viewport = pdfPageRef.current.getViewport({ scale: targetRenderScale });

        const offscreen = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

        const transform = [
          1, 0, 0, 1,
          -t.col * TILE_SIZE,
          -t.row * TILE_SIZE
        ];

        try {
          await pdfPageRef.current.render({
            canvasContext: ctx as any,
            viewport: viewport,
            transform: transform,
            intent: 'display'
          }).promise;

          const bitmap = offscreen.transferToImageBitmap();
          globalTileCache.set(key, bitmap);
          
          const oncomingCtx = canvas!.getContext('2d');
          oncomingCtx?.drawImage(bitmap, 0, 0);
          
          // Progressive fade in
          requestAnimationFrame(() => {
             if (canvas) canvas.style.opacity = '1';
          });
        } catch (e) {
          // ignore cancellations
        }
      }
    });
    processQueue();
  }, [pageNumber]);

  // Intersection logic: which tiles are visible?
  useEffect(() => {
    if (!isVisible || !surfaceRef.current) return;

    const checkVisibility = () => {
      const container = readerDimensionsRef.current;
      if (!container || !container.width || !pdfPageRef.current) return;

      // CRITICAL: Use settledScale for layout/visibility
      const scale = settledScale;
      const px = panX.get();
      const py = panY.get();

      const vw = container.width;
      const vh = container.height;
      
      const offsetX = side === 'right' ? 400 : 0;
      
      // World point = (ScreenPoint - Pan) / Scale - PageOffset
      const worldLeft = (-vw/2 - px) / scale - offsetX;
      const worldRight = (vw/2 - px) / scale - offsetX;
      const worldTop = (-vh/2 - py) / scale;
      const worldBottom = (vh/2 - py) / scale;

      const pageW = 400;
      const pageH = 600;

      const visL = Math.max(0, worldLeft);
      const visR = Math.min(pageW, worldRight);
      const visT = Math.max(0, worldTop);
      const visB = Math.min(pageH, worldBottom);

      if (visR <= visL || visB <= visT) {
        updateDebug({ visibleTiles: 0 });
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const viewportBase = pdfPageRef.current.getViewport({ scale: 1 });
      const fitScale = Math.min(400 / viewportBase.width, 600 / viewportBase.height);
      const logicalTileDim = TILE_SIZE / (fitScale * tier * dpr);
      
      const startCol = Math.floor(visL / logicalTileDim) - 1;
      const endCol = Math.ceil(visR / logicalTileDim) + 1;
      const startRow = Math.floor(visT / logicalTileDim) - 1;
      const endRow = Math.ceil(visB / logicalTileDim) + 1;

      const visibleKeys = new Set<string>();
      let count = 0;

      for (let r = Math.max(0, startRow); r < endRow; r++) {
        for (let c = Math.max(0, startCol); c < endCol; c++) {
          const tKey: TileKey = { pageIndex: pageNumber, tier, row: r, col: c };
          const key = getTileKey(tKey);
          visibleKeys.add(key);
          renderTile(tKey);
          count++;
        }
      }

      // Cleanup: Keep all tiles (any tier) that overlap the current viewport.
      // This prevents "white flashes" during refinement.
      tilesRef.current.forEach((canvas, key) => {
        const parts = key.split(':');
        const tTier = parseInt(parts[1], 10);
        const tRow = parseInt(parts[2], 10);
        const tCol = parseInt(parts[3], 10);
        
        const dpr = window.devicePixelRatio || 1;
        const viewportBase = pdfPageRef.current!.getViewport({ scale: 1 });
        const fitScale = Math.min(400 / viewportBase.width, 600 / viewportBase.height);
        const tLogicalDim = TILE_SIZE / (fitScale * tTier * dpr);
        
        const tL = tCol * tLogicalDim;
        const tR = tL + tLogicalDim;
        const tT = tRow * tLogicalDim;
        const tB = tT + tLogicalDim;
        
        // Check overlap with current visible bounds
        const isActuallyVisible = !(tR < visL || tL > visR || tB < visT || tT > visB);
        
        if (!isActuallyVisible) {
          canvas.remove();
          tilesRef.current.delete(key);
        }
      });

      updateDebug({ 
        visibleTiles: count, 
        tier,
        activeRenders: activeRenderCount + globalRenderQueue.length
      });
    };

    // Subscribe to pan changes only if they settle or are significant?
    // Actually the user said: "DO NOT recalculate visible tiles during active pinch or zoom"
    // So settledScale as a dependency is enough for zoom.
    // What about panning? If I pan 1000px, I want new tiles.
    // The user said: "PHASE 1 — ACTIVE GESTURE: camera-layer transform only. NO tile recalculation"
    // So panning during zoom (pinch) should not recalc.
    // But what about normal panning (drag)?
    // Usually, drag panning should recalc tiles for responsiveness.
    // But the user's "STRICT SEPARATION" implies we only recalc after settle.
    
    // I'll add a listener to panX/panY but maybe throttled? 
    // Or just rely on settledScale for now as requested.
    
    checkVisibility();

  }, [isVisible, tier, pageNumber, renderTile, side, updateDebug, settledScale, panX, panY, readerDimensionsRef]);

  return (
    <div 
      ref={surfaceRef} 
      className="absolute inset-0 w-full h-full pointer-events-none ltr"
      style={{ width: 400, height: 600 }}
    >
      <div 
        ref={palette}
        className="absolute inset-0 origin-top-left"
        style={{ transformOrigin: '0 0' }}
      />
    </div>
  );
});

