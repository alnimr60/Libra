import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2, AlertCircle } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';

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
  console.log("[PDFReader] Render");
  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartInfo = useRef({ x: 0, y: 0, time: 0 });
  const isPinching = useRef(false); // Keep for compatibility with debug overlay for now
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [committedScale, setCommittedScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  // Sync state scale to liveScale motion value
  useEffect(() => {
    animate(liveScale, committedScale, {
      type: 'spring',
      stiffness: 300,
      damping: 30
    });
    
    // Reset panning smoothly when zooming out significantly or switching modes
    if (committedScale <= 1.05) {
      animate(panX, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [committedScale, liveScale, panX, panY]);

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
  const [renderScale, setRenderScale] = useState(committedScale);
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
  
  // Double tap to zoom handler
  const lastTapInfo = useRef({ time: 0, x: 0, y: 0 });
  
  const handleDoubleTapZoom = (clientX: number, clientY: number) => {
    if (!readerContainerRef.current) return;
    const rect = readerContainerRef.current.getBoundingClientRect();
    
    // Tap position relative to container center
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ox = clientX - cx;
    const oy = clientY - cy;

    if (committedScale > 1.05) {
      // Zoom out to 1.0
      setCommittedScale(1.0);
      animate(panX, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    } else {
      // Zoom in to 2.5
      const nextScaleValue = 2.5;
      setCommittedScale(nextScaleValue);
      setShowControls(false);

      // Target pan to bring tap location to center
      const targetPanX = -ox * nextScaleValue;
      const targetPanY = -oy * nextScaleValue;

      // Clamp to margins
      const aspect = 1.414;
      const spreadWidth = baseWidth * (viewMode === 'double' ? 2 : 1);
      const zoomedWidth = spreadWidth * nextScaleValue;
      const zoomedHeight = (baseWidth * aspect) * nextScaleValue;
      const viewportWidth = rect.width;
      const viewportHeight = rect.height;
      
      const hMargin = Math.max(0, (zoomedWidth - viewportWidth) / 2);
      const vMargin = Math.max(0, (zoomedHeight - viewportHeight) / 2);

      const clampedX = Math.max(-hMargin, Math.min(hMargin, targetPanX));
      const clampedY = Math.max(-vMargin, Math.min(vMargin, targetPanY));

      animate(panX, clampedX, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, clampedY, { type: 'spring', stiffness: 300, damping: 30 });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
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
  };
  
  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, {
    stiffness: 450,
    damping: 45,
    mass: 0.8
  });

  // Toggle direction manually
  const toggleDirection = () => {
    setDirection(prev => prev === 'ltr' ? 'rtl' : 'ltr');
  };

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
    // If we are already in a specific mode, don't re-evaluate
    if (gestureMode.current !== GestureMode.Idle) return;
    
    // Stop any running animations
    panX.stop();
    panY.stop();
    liveScale.stop();
    
    // We stay Idle until movement threshold is met or long-press triggers
  };

  const handlePanMove = (_: any, info: any) => {
    // If in SelectingText, browsers handle everything
    if (gestureMode.current === GestureMode.SelectingText) return;

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
      const aspect = 1.414;
      const spreadWidth = baseWidth * (viewMode === 'double' ? 2 : 1);
      const zoomedWidth = spreadWidth * currentScaleValue;
      const zoomedHeight = (baseWidth * aspect) * currentScaleValue;
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
  };

  const handlePanEnd = (_: any, info: any) => {
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
      
      const aspect = 1.414;
      const spreadWidth = baseWidth * (viewMode === 'double' ? 2 : 1);
      const zoomedWidth = spreadWidth * currentScaleValue;
      const zoomedHeight = (baseWidth * aspect) * currentScaleValue;
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
  };

  const baseWidth = React.useMemo(() => {
    if (readerDimensions.width === 0) return 300; // Fallback
    if (viewMode === 'double') {
      const maxWidth = readerDimensions.width * 0.95;
      const maxHeight = readerDimensions.height * 0.9;
      const idealWidth = (maxHeight * 0.707) * 2;
      return Math.min(idealWidth, maxWidth) / 2;
    } else {
      const maxWidth = readerDimensions.width * 0.9;
      const maxHeight = readerDimensions.height * 0.9;
      const idealWidth = maxHeight * 0.707;
      return Math.min(idealWidth, maxWidth);
    }
  }, [viewMode, readerDimensions]);
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("[PDFReader] Settle: Updating renderScale to", committedScale);
      setRenderScale(committedScale);
    }, 400); // Increased settle time for better stability
    return () => clearTimeout(timer);
  }, [committedScale]);

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
    if (e.touches.length === 2) {
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
    if (gestureMode.current === GestureMode.PinchZooming && e.touches.length === 2) {
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
      const nextPanX = p_v.x - (p_v.x - pinchRef.current.initialPanX) * actualScaleDelta;
      const nextPanY = p_v.y - (p_v.y - pinchRef.current.initialPanY) * actualScaleDelta;
      
      const aspect = 1.414;
      const spreadWidth = baseWidth * (viewMode === 'double' ? 2 : 1);
      const zoomedWidth = spreadWidth * nextScale;
      const zoomedHeight = (baseWidth * aspect) * nextScale;
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
      dir={direction === 'rtl' ? "rtl" : "ltr"}
    >
      <AnimatePresence>
        {isNavigatorOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-zinc-950/90 backdrop-blur-3xl flex items-center justify-center p-6 select-none"
            onClick={() => setIsNavigatorOpen(false)}
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
                    {useTransform(liveScale, v => `${Math.round(v * 100)}%`)}
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
        className="flex-1 relative flex items-center justify-center bg-zinc-950/40 overflow-hidden"
        style={{ touchAction: 'none' }}
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
            {Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i).map(sheetIndex => {
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
                  renderScale={renderScale}
                  committedScale={committedScale}
                  isLandscape={isLandscape}
                  containerDimensions={readerDimensions}
                  panX={panX}
                  panY={panY}
                  isCurrent={sheetIndex === pageIndex}
                />
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Debug Overlay */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 right-4 z-[999] bg-black/80 text-white p-4 rounded-xl font-mono text-[10px] pointer-events-none border border-white/10 flex flex-col gap-1">
          <div className="flex justify-between gap-4">
            <span className="opacity-40 uppercase tracking-widest">Scale</span>
            <motion.span>{useTransform(liveScale, v => typeof v === 'number' ? v.toFixed(3) : v)}</motion.span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="opacity-40 uppercase tracking-widest">Pan X</span>
            <motion.span>{useTransform(panX, v => typeof v === 'number' ? v.toFixed(1) : v)}</motion.span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="opacity-40 uppercase tracking-widest">Pan Y</span>
            <motion.span>{useTransform(panY, v => typeof v === 'number' ? v.toFixed(1) : v)}</motion.span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="opacity-40 uppercase tracking-widest">Mode</span>
            <span>{gestureMode.current}</span>
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
  renderScale, 
  committedScale,
  isLandscape,
  containerDimensions,
  panX,
  panY,
  isCurrent
}: { 
  index: number, 
  pdf: pdfjs.PDFDocumentProxy, 
  numPages: number, 
  viewMode: 'single' | 'double',
  direction: 'ltr' | 'rtl',
  virtualPage: any,
  liveScale: any,
  renderScale: number,
  committedScale: number,
  isLandscape: boolean,
  containerDimensions: { width: number, height: number },
  panX: any,
  panY: any,
  isCurrent: boolean
}) {
  const distance = useTransform(virtualPage, (v: number) => index - v);
  
  // Calculate display width in pixels (BASE SIZE at scale 1.0)
  const baseWidth = React.useMemo(() => {
    if (containerDimensions.width === 0) return 0;
    if (viewMode === 'double') {
      const maxWidth = containerDimensions.width * 0.95;
      const maxHeight = containerDimensions.height * 0.9;
      const idealWidth = (maxHeight * 0.707) * 2;
      return Math.min(idealWidth, maxWidth) / 2;
    } else {
      const maxWidth = containerDimensions.width * 0.9;
      const maxHeight = containerDimensions.height * 0.9;
      const idealWidth = maxHeight * 0.707;
      return Math.min(idealWidth, maxWidth);
    }
  }, [viewMode, containerDimensions]);

  // Use the recalculated one from parent if possible, but let's just use a simplified one here for CSS
  const [displayWidth, setDisplayWidth] = useState(0);
  useEffect(() => {
    if (containerDimensions.width === 0) return;
    let w = 0;
    if (viewMode === 'double') {
      const maxWidth = containerDimensions.width * 0.95;
      const maxHeight = containerDimensions.height * 0.9;
      const idealWidth = (maxHeight * 0.707) * 2;
      w = Math.min(idealWidth, maxWidth) / 2;
    } else {
      const maxWidth = containerDimensions.width * 0.9;
      const maxHeight = containerDimensions.height * 0.9;
      const idealWidth = maxHeight * 0.707;
      w = Math.min(idealWidth, maxWidth);
    }
    setDisplayWidth(w);
  }, [viewMode, containerDimensions]);
  
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
  
  useEffect(() => {
    if (isCurrent) {
      const unsub = totalScale.on("change", (v) => {
        if (v > 1.01 && Math.random() < 0.05) {
          console.log(`[ReaderSheet ${index}] visual scale update:`, v.toFixed(3));
        }
      });
      return unsub;
    }
  }, [isCurrent, index, totalScale]);

  const opacity = useTransform(distance, (d: number) => {
    if (d <= -1.5 || d >= 1.5) return 0;
    if (d <= -0.5) return (d + 1.5);
    if (d >= 0.5) return (1.5 - d);
    return 1;
  });
  
  const visibility = useTransform(distance, (d: number) => Math.abs(d) <= 1.5 ? 'visible' : 'hidden');

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
        "absolute inset-0 flex p-4 md:p-8 select-none",
        viewMode === 'double' ? "flex-row" : "flex-col",
        "items-center justify-center",
        "perspective-[1500px]"
      )}
    >
        <motion.div 
          id={`sheet-${index}-transform-container`}
          style={{ 
            x: panX,
            y: panY,
            scale: totalScale,
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            width: 'fit-content',
            height: 'fit-content',
            willChange: 'transform'
          } as any}
          className={cn(
            "flex flex-shrink-0 gap-0 lg:gap-4 my-auto origin-center",
            viewMode === 'double' ? "flex-row" : "flex-col"
          )}
        >
        {viewMode === 'double' ? (
          <>
            {direction === 'rtl' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} side="left" isLandscape={isLandscape} liveScale={liveScale} direction={direction} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} side="right" isLandscape={isLandscape} liveScale={liveScale} direction={direction} />
              </>
            ) : (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} side="left" isLandscape={isLandscape} liveScale={liveScale} direction={direction} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} side="right" isLandscape={isLandscape} liveScale={liveScale} direction={direction} />
              </>
            )}
          </>
        ) : (
          <div 
            className="flex-shrink-0 h-auto relative"
            style={{ 
              width: displayWidth || 'auto',
              maxHeight: '90vh'
            }}
          >
            <PDFPage pageNumber={index + 1} pdf={pdf} width={displayWidth} renderScale={renderScale} committedScale={committedScale} liveScale={liveScale} direction={direction} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

const SpreadPage = React.memo(function SpreadPage({ pdf, pageNumber, numPages, width, renderScale, committedScale, side, isLandscape, liveScale, direction }: { 
  pdf: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  numPages: number, 
  width: number, 
  renderScale: number,
  committedScale: number,
  side: 'left' | 'right', 
  isLandscape?: boolean, 
  liveScale: any,
  direction: 'ltr' | 'rtl'
}) {
  if (pageNumber > numPages) return <div className="flex-shrink-0 bg-white" style={{ width: width || 'auto', height: '100%', opacity: 0.1 }} />;
  
  return (
    <div 
      className={cn(
        "flex-shrink-0 h-auto relative flex items-center justify-center",
        side === 'left' ? "rounded-l-sm" : "rounded-r-sm"
      )}
      style={{ 
        width: width || 'auto'
      }}
    >
      {/* Decorative center seam shadow */}
      <div className={cn(
        "absolute inset-y-0 w-8 z-10 pointer-events-none opacity-20",
        side === 'left' ? "right-0 bg-gradient-to-l from-black via-black/20 to-transparent" : "left-0 bg-gradient-to-r from-black via-black/20 to-transparent"
      )} />
      <PDFPage pageNumber={pageNumber} pdf={pdf} width={width} renderScale={renderScale} committedScale={committedScale} liveScale={liveScale} direction={direction} />
    </div>
  );
});

interface PDFPageProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  width: number;
  renderScale: number;
  committedScale: number;
  liveScale: any;
  direction: 'ltr' | 'rtl';
}

const PDFPage: React.FC<PDFPageProps> = React.memo(({ pageNumber, pdf, width, renderScale, committedScale, liveScale, direction }) => {
  console.log(`[PDFPage] Render Page: ${pageNumber} | CSS Width: ${width} | resScale: ${renderScale}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerDivRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const aspectRatio = pageSize.width > 0 ? pageSize.height / pageSize.width : 1.414;
  const containerHeight = width * aspectRatio;

  const displayWidth = width;
  const displayHeight = containerHeight;

  useEffect(() => {
    const textLayer = textLayerDivRef.current;
    if (!textLayer) return;

    const handlePointerDown = (e: PointerEvent) => {
      // Allow browser to handle text selection normally
      // We don't want to stopPropagation here if it's hitting text
    };

    textLayer.addEventListener('pointerdown', handlePointerDown, { capture: false });
    
    return () => {
      textLayer.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    // Initial size fetch to establish aspect ratio
    const fetchSize = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        if (isMounted) {
          setPageSize({ width: viewport.width, height: viewport.height });
        }
      } catch (err) {
        if (isMounted) console.error("Failed to fetch initial page size", err);
      }
    };
    fetchSize();

    return () => { isMounted = false; };
  }, [pdf, pageNumber]);

  useEffect(() => {
    let isMounted = true;
    
    // Don't render until we have a width and intrinsic page size
    if (width === 0 || pageSize.width === 0) return;

    setIsRendering(true);
    setRenderError(false);

    const render = async () => {
      if (!canvasRef.current || !textLayerDivRef.current) return;

      try {
        const page = await pdf.getPage(pageNumber);
        if (!isMounted) return;

        // 1. Get the viewport at stable CSS target scale
        const baseViewportScale = width / pageSize.width;
        const textLayerViewportScale = baseViewportScale;
        
        const viewport = page.getViewport({ scale: textLayerViewportScale });

        // 2. Canvas Rendering Viewport (Adaptive based on renderScale settle)
        const dpr = (window.devicePixelRatio || 1) * renderScale;
        const canvasViewport = page.getViewport({ scale: baseViewportScale * dpr });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
          canvas.width = canvasViewport.width;
          canvas.height = canvasViewport.height;
          
          // Clear with white background explicitly
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);

          if (textLayerDivRef.current) {
            textLayerDivRef.current.innerHTML = '';
            textLayerDivRef.current.style.width = `${viewport.width}px`;
            textLayerDivRef.current.style.height = `${viewport.height}px`;
          }

          if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
          }

          renderTaskRef.current = page.render({
            canvasContext: context,
            viewport: canvasViewport,
            intent: 'display'
          } as any);
          
          await renderTaskRef.current.promise;

          if (!isMounted) return;

          try {
            if (textLayerDivRef.current) {
              const textContent = await page.getTextContent();
              
              await pdfjs.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDivRef.current,
                viewport: viewport
              }).promise;
              
              textLayerDivRef.current.style.setProperty('--scale-factor', textLayerViewportScale.toString());
            }
          } catch (textLayerErr) {
            console.warn("Text layer processing failed", textLayerErr);
          }

          if (isMounted) setIsRendering(false);
        }
      } catch (error: any) {
        if (error.name === 'RenderingCancelledException') return;
        console.error(`Error rendering page ${pageNumber}:`, error);
        if (isMounted) {
          setRenderError(true);
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdf, pageNumber, width, pageSize.width, renderScale]);

  return (
    <div 
      ref={containerRef} 
      className="relative flex items-center justify-center bg-white/5 overflow-hidden"
      style={{ 
        width: displayWidth,
        height: displayHeight
      }}
    >
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/10 z-10 text-white/20">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      {renderError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500/50 p-4 text-center z-10">
          <AlertCircle className="w-8 h-8 mb-2" />
          <p className="text-[10px] uppercase tracking-widest font-mono">Render Failed</p>
        </div>
      )}
      
      {pageSize.width > 0 && (
        <div 
          id={`page-${pageNumber}-container`}
          className="relative shadow-2xl bg-white transition-opacity duration-300 select-none"
          style={{ 
            width: displayWidth,
            height: displayHeight,
            transform: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            flexShrink: 0,
            opacity: isRendering ? 0 : 1,
            contain: 'content',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
        >
          <canvas 
            ref={canvasRef} 
            className="block pointer-events-none absolute inset-0 origin-top-left"
            style={{ 
              width: width,
              height: containerHeight,
              transform: 'none',
              WebkitTouchCallout: 'none' 
            }}
          />
          <div 
            ref={textLayerDivRef} 
            className="textLayer"
            dir={direction}
            style={{ 
              width: displayWidth,
              height: displayHeight,
              pointerEvents: 'auto',
              transform: 'none',
              zIndex: 5,
              userSelect: 'text',
              WebkitUserSelect: 'text',
              paddingTop: '2px'
            }} 
          />
        </div>
      )}
    </div>
  );
});
