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

export default function PDFReader({ book, initialPage, onPageChange, updateBook, onUpdateBookmarks, onClose }: PDFReaderProps) {
  console.log("[PDFReader] Render");
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const visualScale = useMotionValue(1.0);

  const [isLoading, setIsLoading] = useState(true);
  // Synchronize visualScale with scale state for control updates
  useEffect(() => {
    visualScale.set(scale);
  }, [scale]);

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
  const [renderScale, setRenderScale] = useState(scale);
  const [retryKey, setRetryKey] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const isSelectingText = useRef(false);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const [readerDimensions, setReaderDimensions] = useState({ width: 0, height: 0 });

  const readerDimensionsRef = useRef({ width: 0, height: 0 });
  const isPinching = useRef(false);

  useEffect(() => {
    if (!readerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      // Prevent recalculations during active pinching to avoid layout thrashing
      if (isPinching.current) {
        console.log("[PDFReader] ResizeObserver suppressed during active scaling gesture");
        return;
      }
      
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
  const lastTap = useRef<number>(0);
  const longPressTimer = useRef<any>(null);

  const startLongPressTimer = (e: React.TouchEvent) => {
    if (selectionMode) return;
    
    // Only for single touch
    if (e.touches.length !== 1) return;

    const target = e.target as HTMLElement;
    // Only trigger if touching near/on text elements or page area
    if (target.closest('.textLayer') || target.closest('[id^="page-"]')) {
      longPressTimer.current = setTimeout(() => {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(50);
        }
        setSelectionMode(true);
        setShowControls(false);
        console.log("[PDFReader] Entering Selection Mode via long press");
      }, 600);
    }
  };

  const cancelLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    // Only handle double tap on the main viewport area, not on controls or text
    if ((e.target as HTMLElement).closest('button, input, .textLayer')) return;

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Toggle zoom
      const nextScale = scale > 1.2 ? 1.0 : 2.5;
      setScale(nextScale);
      // Also hide controls when zooming in to focus
      if (nextScale > 1.2) setShowControls(false);
    }
    lastTap.current = now;
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

  const handlePanStart = (e: any) => {
    if (selectionMode) return;

    // Check if the user is clicking on text
    const target = e.target as HTMLElement;
    const isText = target.tagName.toLowerCase() === 'span' || target.closest('.textLayer');
    
    if (isText) {
      setIsDragging(false);
      return;
    }
    
    setIsDragging(true);
  };

  const handlePanMove = (_: any, info: any) => {
    if (!isDragging || selectionMode) return;

    // If zoomed in, we only allow swiping if it's a clear horizontal intent
    const currentScale = visualScale.get();
    if (currentScale > 1.3) {
      const isHorizontal = Math.abs(info.velocity.x) > Math.abs(info.velocity.y) * 2;
      const isFlick = Math.abs(info.velocity.x) > 600;
      if (!isHorizontal || !isFlick) return;
    }

    const scrollWidth = window.innerWidth;
    const progress = info.offset.x / scrollWidth;
    
    if (direction === 'rtl') {
      virtualPage.set(pageIndex + progress);
    } else {
      virtualPage.set(pageIndex - progress);
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    
    const currentScale = visualScale.get();
    // Adaptive thresholds based on scale
    const threshold = currentScale > 1.3 ? 100 : 50;
    const velocityThreshold = currentScale > 1.3 ? 800 : 500;
    
    let nextIndex = pageIndex;
    
    if (direction === 'rtl') {
      if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex + 1;
      else if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex - 1;
    } else {
      if (offset < -threshold || velocity < -velocityThreshold) nextIndex = pageIndex + 1;
      else if (offset > threshold || velocity > velocityThreshold) nextIndex = pageIndex - 1;
    }
    
    handlePageChange(Math.max(0, Math.min(nextIndex, totalSheets - 1)));
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isPinching.current) {
        console.log("[PDFReader] Settle: Updating renderScale to", scale);
        setRenderScale(scale);
      }
    }, 400); // Increased settle time for better stability
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

  const touchStateRef = useRef({ initialDist: 0, initialScale: 1, lastScale: 1 });

  useEffect(() => {
    if (selectionMode) {
      document.body.classList.add('selection-active');
      
      const logPrevented = (e: Event) => {
        if (e.defaultPrevented) {
          console.warn(`[SelectionDebug] Event ${e.type} was prevented!`, {
            target: e.target,
            currentTarget: e.currentTarget,
            defaultPrevented: e.defaultPrevented
          });
        }
      };
      
      window.addEventListener('touchstart', logPrevented, true);
      window.addEventListener('touchmove', logPrevented, true);
      window.addEventListener('touchend', logPrevented, true);
      window.addEventListener('mousedown', logPrevented, true);
      window.addEventListener('selectstart', logPrevented, true);
      
      return () => {
        window.removeEventListener('touchstart', logPrevented, true);
        window.removeEventListener('touchmove', logPrevented, true);
        window.removeEventListener('touchend', logPrevented, true);
        window.removeEventListener('mousedown', logPrevented, true);
        window.removeEventListener('selectstart', logPrevented, true);
      };
    } else {
      document.body.classList.remove('selection-active');
    }
  }, [selectionMode]);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Debug hit testing
    const touch = e.touches[0];
    if (touch) {
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      console.log(`[PDFReader] TouchStart Target:`, element?.tagName, element?.className, element?.id);
    }

    if (selectionMode) {
      console.log("[PDFReader] selectionMode active - bypassing custom handlers");
      return;
    }
    
    startLongPressTimer(e);

    if (e.touches.length === 2) {
      isPinching.current = true;
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      touchStateRef.current = {
        initialDist: dist,
        initialScale: scale,
        lastScale: scale
      };
      console.log("[PDFReader] PINCH_START - Initial Scale:", scale);
      
      // Stop ongoing animations
      visualScale.stop();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (selectionMode) {
      console.log(`[PDFReader] Bypassing touchmove preventDefault in selectionMode`);
      return;
    }

    // Cancel long press if moved significantly
    if (longPressTimer.current && e.touches.length === 1) {
      cancelLongPressTimer();
    }

    const safePreventDefault = (e: any, source: string) => {
      if (selectionMode) {
        console.warn(`[SelectionDebug] ${source} attempted preventDefault() but it was BYPASSED during selectionMode.`);
        return;
      }
      e.preventDefault();
    };

    if (e.touches.length === 2 && isPinching.current) {
      safePreventDefault(e, 'handleTouchMove (pinch)');
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      
      const delta = dist / touchStateRef.current.initialDist;
      let nextScale = touchStateRef.current.initialScale * delta;
      
      const MIN_SAFE_SCALE = 0.5;
      const MAX_SAFE_SCALE = 5.0;
      nextScale = Math.max(MIN_SAFE_SCALE, Math.min(MAX_SAFE_SCALE, nextScale));
      
      touchStateRef.current.lastScale = nextScale;
      visualScale.set(nextScale);
      
      // DO NOT setScale state here to avoid continuous rerenders
      // Only log at intervals to avoid flooding
      if (Math.random() < 0.1) {
        console.log("[PDFReader] PINCH_MOVE - Visual Scale:", nextScale.toFixed(2));
      }
    }
  };

  const handleTouchEnd = () => {
    cancelLongPressTimer();

    if (isPinching.current) {
      console.log("[PDFReader] PINCH_END - Settle Scale:", touchStateRef.current.lastScale.toFixed(2));
      isPinching.current = false;
      setScale(touchStateRef.current.lastScale);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-[300] bg-zinc-950 flex flex-col",
        selectionMode ? "overflow-visible" : "overflow-hidden transition-all duration-500",
        !selectionMode && "select-none"
      )}
      style={{ 
        transform: selectionMode ? 'none' : undefined,
        perspective: selectionMode ? 'none' : undefined,
        willChange: selectionMode ? 'auto' : undefined
      }}
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
                  onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.2, s - 0.2)); }} 
                  className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75 text-white/80"
                >
                  <Minus className={cn(isLandscape ? "w-3 h-3" : "w-4 h-4")} />
                </button>
                <div className="flex flex-col items-center min-w-[36px]">
                  <span className="text-[10px] font-mono font-bold leading-none text-center select-none text-white">{Math.round(scale * 100)}%</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.2)); }} 
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
        className={cn(
        "flex-1 relative flex items-center justify-center bg-zinc-950/40",
        selectionMode ? "overflow-visible" : "overflow-hidden",
        !selectionMode && "select-none"
      )}
        onClick={(e) => {
          if (selectionMode) return;
          
          // If text is selected, do not trigger page turn or click actions
          if (window.getSelection()?.toString().trim().length) {
            return;
          }

          if ((e.target as HTMLElement).closest('.textLayer')) return;

          handleDoubleTap(e);
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: selectionMode ? 'auto' : 'none' }}
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
        ) : selectionMode ? (
          <div 
            id="selection-isolation-layer"
            className="absolute inset-0 z-[500] bg-zinc-950 overflow-auto p-4 md:p-8 flex flex-col items-center"
            style={{ 
              touchAction: 'auto', 
              WebkitUserSelect: 'text',
              userSelect: 'text'
            }}
          >
            <div 
              className={cn(
                "flex-shrink-0 gap-0 lg:gap-4 mx-auto relative my-auto",
                viewMode === 'double' ? "flex-row" : "flex-col"
              )}
            >
              {viewMode === 'double' ? (
                <>
                  {direction === 'rtl' ? (
                    <>
                      <div style={{ width: (readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300 }}>
                        <PDFPage 
                          pageNumber={(pageIndex * 2) + 2} 
                          pdf={pdf!} 
                          isSelectingText={isSelectingText} 
                          width={(readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300} 
                          renderScale={renderScale} 
                          currentScale={scale} 
                          selectionMode={true} 
                          visualScale={visualScale} 
                        />
                      </div>
                      <div style={{ width: (readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300 }}>
                        <PDFPage 
                          pageNumber={(pageIndex * 2) + 1} 
                          pdf={pdf!} 
                          isSelectingText={isSelectingText} 
                          width={(readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300} 
                          renderScale={renderScale} 
                          currentScale={scale} 
                          selectionMode={true} 
                          visualScale={visualScale} 
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: (readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300 }}>
                        <PDFPage 
                          pageNumber={(pageIndex * 2) + 1} 
                          pdf={pdf!} 
                          isSelectingText={isSelectingText} 
                          width={(readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300} 
                          renderScale={renderScale} 
                          currentScale={scale} 
                          selectionMode={true} 
                          visualScale={visualScale} 
                        />
                      </div>
                      <div style={{ width: (readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300 }}>
                        <PDFPage 
                          pageNumber={(pageIndex * 2) + 2} 
                          pdf={pdf!} 
                          isSelectingText={isSelectingText} 
                          width={(readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300} 
                          renderScale={renderScale} 
                          currentScale={scale} 
                          selectionMode={true} 
                          visualScale={visualScale} 
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={{ width: (readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300 }}>
                  <PDFPage 
                    pageNumber={pageIndex + 1} 
                    pdf={pdf!} 
                    isSelectingText={isSelectingText} 
                    width={(readerDimensions.width > 0) ? (viewMode === 'double' ? Math.min((readerDimensions.height * 0.9 * 0.707) * 2, readerDimensions.width * 0.95) / 2 : Math.min(readerDimensions.height * 0.9 * 0.707, readerDimensions.width * 0.9)) : 300} 
                    renderScale={renderScale} 
                    currentScale={scale} 
                    selectionMode={true} 
                    visualScale={visualScale} 
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <motion.div 
            className="relative w-full h-full"
            onPanStart={handlePanStart}
            onPan={handlePanMove}
            onPanEnd={handlePanEnd}
            style={{ 
              touchAction: selectionMode ? 'auto' : 'none',
              userSelect: selectionMode ? 'text' : 'none',
              WebkitUserSelect: selectionMode ? 'text' : 'none'
            }}
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
                  scale={visualScale}
                  renderScale={renderScale}
                  currentScale={scale}
                  isLandscape={isLandscape}
                  constraintsRef={readerContainerRef}
                  isSelectingText={isSelectingText}
                  containerDimensions={readerDimensions}
                  selectionMode={selectionMode}
                />
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Selection Mode Close Button */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[450] flex flex-col items-center gap-4"
          >
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  console.log("[SelectionDebug] Manual Extraction Test Triggered");
                  const activePageNum = viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1;
                  try {
                    const page = await pdf?.getPage(activePageNum);
                    if (page) {
                      const content = await page.getTextContent();
                      const text = content.items.map((i: any) => i.str).join(' ');
                      alert(`Extraction Test Success!\nItems: ${content.items.length}\nText Length: ${text.length}\nPreview: ${text.substring(0, 200)}...`);
                    }
                  } catch (err: any) {
                    alert(`Extraction Test Failed: ${err.message}`);
                  }
                }}
                className="px-4 py-3 bg-zinc-800 text-white rounded-full font-mono text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 transition-transform flex items-center gap-2 hover:bg-zinc-700"
              >
                Test Extraction
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  window.getSelection()?.removeAllRanges();
                }}
                className="px-6 py-3 bg-orange-500 text-white rounded-full font-mono text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 transition-transform flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Done Selecting
              </button>
            </div>
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
  scale, 
  renderScale, 
  currentScale,
  isLandscape,
  constraintsRef,
  isSelectingText,
  containerDimensions,
  selectionMode
}: { 
  index: number, 
  pdf: pdfjs.PDFDocumentProxy, 
  numPages: number, 
  viewMode: 'single' | 'double',
  direction: 'ltr' | 'rtl',
  virtualPage: any,
  scale: any, // smoothScale MotionValue
  renderScale: number,
  currentScale: number,
  isLandscape: boolean,
  constraintsRef: React.RefObject<HTMLDivElement>,
  isSelectingText: React.RefObject<boolean>,
  containerDimensions: { width: number, height: number },
  selectionMode: boolean,
  key?: React.Key
}) {
  console.log(`[ReaderSheet] Rendering Sheet ${index} | renderScale: ${renderScale}`);
  const distance = useTransform(virtualPage, (v: number) => index - v);
  
  // Calculate display width in pixels (BASE SIZE at scale 1.0)
  const [displayWidth, setDisplayWidth] = useState(0);

  useEffect(() => {
    if (containerDimensions.width === 0) return;
    
    // Stable base sizing independent of renderScale
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
    console.log(`[ReaderSheet] Recalculated stable base width for Sheet ${index}: ${w}`);
  }, [viewMode, containerDimensions, index]);
  
  // Virtualization position
  const x = useTransform(distance, (d: number) => {
    if (selectionMode && index === Math.round(virtualPage.get())) {
      return 0; // Disable virtualization shift for active page in selection mode
    }
    const multiplier = direction === 'rtl' ? -100 : 100;
    return d * multiplier; // Using percentage in template
  });
  
  const zIndex = useTransform(distance, (d: number) => {
    if (selectionMode && index === Math.round(virtualPage.get())) return 500;
    return 10 - Math.abs(Math.round(d));
  });

  const rotateY = useTransform(distance, (d: number) => {
    if (selectionMode) return 0;
    const multiplier = direction === 'rtl' ? -10 : 10;
    return d * multiplier;
  });

  const transitionScale = useTransform(distance, (d: number) => {
    if (selectionMode) return 1.0;
    return 1 - (Math.abs(d) * 0.05);
  });
  
  const opacity = useTransform(distance, (d: number) => {
    if (selectionMode && index === Math.round(virtualPage.get())) return 1;
    if (d <= -1.5 || d >= 1.5) return 0;
    if (d <= -0.5) return (d + 1.5);
    if (d >= 0.5) return (1.5 - d);
    return 1;
  });
  
  const visibility = useTransform(distance, (d: number) => {
    if (selectionMode && index === Math.round(virtualPage.get())) return 'visible';
    return Math.abs(d) <= 1.5 ? 'visible' : 'hidden';
  });

  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  // Reset panning when zooming out
  useEffect(() => {
    if (scale.get() <= 1.1) {
      panX.set(0);
      panY.set(0);
    }
  }, [scale, panX, panY]);

  // UNIFIED TRANSFORM PIPELINE
  // We combine virtualization, panning, gesture scale, and transition scale into ONE string
  const totalScale = useTransform([scale, transitionScale], ([s, ts]) => (s as number) * (ts as number));
  
  // NOTE: x is percentage base, panX is pixels. We'll use calc or motion template
  const transform = React.useMemo(() => {
    return (latest: { x: number, panX: number, panY: number, rotateY: number, scale: number }) => {
      // IF selectionMode is active, we strip ALL transformations from the active sheet
      // to avoid GPU compositing issues that block text selection on mobile.
      const isActive = index === Math.round(virtualPage.get());
      if (selectionMode && isActive) {
        return 'none';
      }
      
      const s = selectionMode ? 1.0 : latest.scale;
      const t = `translate3d(calc(${latest.x}% + ${latest.panX}px), ${latest.panY}px, 0) scale(${s}) rotateY(${latest.rotateY}deg)`;
      // Log only occasionally
      if (Math.random() < 0.01) console.log(`[TransformContainer] Index ${index} | Rendered Transform: ${t}`);
      return t;
    };
  }, [index, selectionMode, virtualPage]);

  const transformValue = useTransform(
    [x, panX, panY, rotateY, totalScale],
    ([xv, px, py, ry, s]) => transform({ x: xv as number, panX: px as number, panY: py as number, rotateY: ry as number, scale: s as number })
  );

  return (
    <motion.div
      style={{ opacity, visibility, zIndex }}
      className={cn(
        "absolute inset-0 flex p-4 md:p-8",
        !selectionMode && "overflow-hidden select-none",
        selectionMode && "overflow-visible",
        viewMode === 'double' ? "flex-row" : "flex-col",
        "items-center justify-center",
        !selectionMode && "transform-gpu perspective-[1500px]"
      )}
    >
      <motion.div 
        id={`sheet-${index}-transform-container`}
        style={{ 
          transform: transformValue,
          transformStyle: selectionMode ? 'flat' : 'preserve-3d',
          backfaceVisibility: selectionMode ? 'visible' : 'hidden',
          width: 'fit-content',
          height: 'fit-content',
          touchAction: selectionMode ? 'auto' : 'none',
          userSelect: selectionMode ? 'text' : 'none',
          WebkitUserSelect: selectionMode ? 'text' : 'none',
          willChange: selectionMode ? 'auto' : 'transform'
        } as any}
        drag={scale.get() > 1.1 && !selectionMode}
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={true}
        className={cn(
          "flex flex-shrink-0 gap-0 lg:gap-4 my-auto origin-center transform-gpu",
          !selectionMode && "select-none",
          viewMode === 'double' ? "flex-row" : "flex-col",
          "mx-auto"
        )}
      >
        {viewMode === 'double' ? (
          <>
            {direction === 'rtl' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} renderScale={renderScale} currentScale={currentScale} side="left" isLandscape={isLandscape} isSelectingText={isSelectingText} selectionMode={selectionMode} visualScale={scale} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} renderScale={renderScale} currentScale={currentScale} side="right" isLandscape={isLandscape} isSelectingText={isSelectingText} selectionMode={selectionMode} visualScale={scale} />
              </>
            ) : (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} renderScale={renderScale} currentScale={currentScale} side="left" isLandscape={isLandscape} isSelectingText={isSelectingText} selectionMode={selectionMode} visualScale={scale} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} renderScale={renderScale} currentScale={currentScale} side="right" isLandscape={isLandscape} isSelectingText={isSelectingText} selectionMode={selectionMode} visualScale={scale} />
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
            <PDFPage pageNumber={index + 1} pdf={pdf} isSelectingText={isSelectingText} width={displayWidth} renderScale={renderScale} currentScale={currentScale} selectionMode={selectionMode} visualScale={scale} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

const SpreadPage = React.memo(function SpreadPage({ pdf, pageNumber, numPages, width, renderScale, currentScale, side, isLandscape, isSelectingText, selectionMode, visualScale }: { 
  pdf: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  numPages: number, 
  width: number, 
  renderScale: number,
  currentScale: number,
  side: 'left' | 'right', 
  isLandscape?: boolean, 
  isSelectingText: React.RefObject<boolean>,
  selectionMode: boolean,
  visualScale: any
}) {
  if (pageNumber > numPages) return <div className="flex-shrink-0 bg-white" style={{ width: width || 'auto', height: '100%', opacity: 0.1 }} />;
  
  return (
    <div 
      className={cn(
        "flex-shrink-0 h-auto relative flex items-center justify-center",
        !selectionMode && "select-none",
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
      <PDFPage pageNumber={pageNumber} pdf={pdf} isSelectingText={isSelectingText} width={width} renderScale={renderScale} currentScale={currentScale} selectionMode={selectionMode} visualScale={visualScale} />
    </div>
  );
});

interface PDFPageProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  isSelectingText: React.RefObject<boolean>;
  width: number;
  renderScale: number;
  currentScale: number;
  selectionMode: boolean;
  visualScale: any;
}

const PDFPage: React.FC<PDFPageProps> = React.memo(({ pageNumber, pdf, isSelectingText, width, renderScale, currentScale, selectionMode, visualScale }) => {
  console.log(`[PDFPage] Render Page: ${pageNumber} | CSS Width: ${width} | resScale: ${renderScale}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerDivRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [pageText, setPageText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extError, setExtError] = useState<any>(null);

  useEffect(() => {
    if (selectionMode && textLayerDivRef.current) {
      console.log(`[PDFPage] Debugging Ancestors for selectionMode (Page ${pageNumber})`);
      let el = textLayerDivRef.current.parentElement;
      while (el) {
        const style = window.getComputedStyle(el);
        console.log(`Ancestor [${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}]:`, {
          transform: style.transform,
          overflow: style.overflow,
          contain: style.contain,
          willChange: style.willChange,
          perspective: (style as any).perspective,
          filter: style.filter,
          backdropFilter: (style as any).backdropFilter
        });
        el = el.parentElement;
      }
    }
  }, [selectionMode, pageNumber]);

  const aspectRatio = pageSize.width > 0 ? pageSize.height / pageSize.width : 1.414;
  const containerHeight = width * aspectRatio;

  // Selection mode layout sizing (ISOLATION)
  // When selecting, we expand dimensions physically instead of CSS scaling.
  const displayScale = selectionMode ? currentScale : 1.0;
  const displayWidth = width * displayScale;
  const displayHeight = containerHeight * displayScale;

  useEffect(() => {
    const textLayer = textLayerDivRef.current;
    if (!textLayer) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!selectionMode) e.stopPropagation();
      else console.log("[SelectionDebug] Bypassing stopPropagation on textLayer pointerdown");
      if (isSelectingText) (isSelectingText as any).current = true;
    };

    const handlePointerUp = () => {
      if (isSelectingText) (isSelectingText as any).current = false;
    };

    textLayer.addEventListener('pointerdown', handlePointerDown, { capture: false });
    window.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      textLayer.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isSelectingText]);

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
        // In selection mode, we render textLayer at full zoomed layout size
        const baseViewportScale = width / pageSize.width;
        const textLayerViewportScale = selectionMode ? (displayWidth / pageSize.width) : baseViewportScale;
        
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

          console.log(`[PDFPage] Rendering Page ${pageNumber} | selectionMode: ${selectionMode} | viewportScale: ${textLayerViewportScale.toFixed(2)}`);
          renderTaskRef.current = page.render({
            canvasContext: context,
            viewport: canvasViewport,
            intent: 'display'
          } as any);
          
          await renderTaskRef.current.promise;

          if (!isMounted) return;

          try {
            if (textLayerDivRef.current) {
              // Robust Text Extraction for Diagnostic Flow Mode
              setIsExtracting(true);
              setExtError(null);
              
              console.log(`[PDFPage] Page ${pageNumber} Extraction Pre-Check:`, {
                pageObject: page,
                isDestroyed: (page as any)._destroyed || (page as any).destroyed,
                pageNumber: (page as any).pageNumber,
                getTextContentAvailable: typeof page.getTextContent,
                workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
                pdfjsVersion: pdfjs.version,
                compatibility: {
                  PromiseWithResolvers: typeof (Promise as any).withResolvers,
                  structuredClone: typeof window.structuredClone,
                  ReadableStream: typeof window.ReadableStream,
                  ArrayFrom: typeof Array.from,
                  SymbolIterator: typeof Symbol.iterator,
                  OffscreenCanvas: typeof window.OffscreenCanvas
                }
              });

              console.log("[PDFPage] getTextContent started...");
              let textContent;
              try {
                textContent = await page.getTextContent();
                console.log(`[PDFPage] getTextContent resolved for Page ${pageNumber}. Items:`, textContent.items.length);
                // SIMPLE EXTRACTION TEST ON PAGE LOAD (as requested)
                console.log(`[PDFPage] TEXT ITEMS: ${textContent.items.length}`);
                
                if (textContent.items.length === 0) {
                  console.warn(`[PDFPage] Page ${pageNumber} returned ZERO text items. This may be a scanned PDF or images-only.`);
                }
              } catch (getContentErr: any) {
                console.log("[PDFPage] getTextContent rejected!");
                console.error(`[PDFPage] RAW ERROR for Page ${pageNumber}:`, getContentErr);
                setExtError(getContentErr);
                setIsExtracting(false);
                throw getContentErr;
              }
              
              console.log(`[PDFPage] Page ${pageNumber} strings (first 10):`, textContent.items.slice(0, 10).map((i: any) => i.str));

              const extractedText = textContent.items
                .map((item: any) => item.str)
                .join(" ");

              setPageText(extractedText);
              setIsExtracting(false);

              await pdfjs.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDivRef.current,
                viewport: viewport
              }).promise;
              
              textLayerDivRef.current.style.setProperty('--scale-factor', textLayerViewportScale.toString());

              // DIAGNOSTIC LOGGING
              if (textLayerDivRef.current) {
                const spans = textLayerDivRef.current.querySelectorAll('span');
                console.log(`[PDFPage] Page ${pageNumber} textLayer rendered with ${spans.length} spans.`);
                
                if (selectionMode) {
                  spans.forEach(span => {
                    // Ensure text is accessible to browser selection
                    if (span.getAttribute('aria-hidden') === 'true') {
                      span.removeAttribute('aria-hidden');
                    }
                    // PDF.js often uses transparent text, our CSS handles it but we can force it here too
                    span.style.color = 'rgba(0,0,0,0.01)';
                  });
                }
              }
            }
          } catch (textLayerErr) {
            console.warn("Text layer processing failed", textLayerErr);
            if (!extError) setExtError(textLayerErr);
            setIsExtracting(false);
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
  }, [pdf, pageNumber, width, pageSize.width, renderScale, selectionMode, currentScale]);

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "relative flex items-center justify-center bg-white/5",
        selectionMode ? "overflow-visible" : "overflow-hidden",
        !selectionMode && "select-none"
      )}
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
          className={cn(
            "relative shadow-2xl bg-white transition-opacity duration-300",
            !selectionMode && "transform-gpu select-none"
          )}
          style={{ 
            width: displayWidth,
            height: displayHeight,
            transform: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            flexShrink: 0,
            opacity: isRendering ? 0 : 1,
            contain: selectionMode ? 'none' : 'content'
          }}
        >
          <canvas 
            ref={canvasRef} 
            className="block pointer-events-none absolute inset-0 origin-top-left"
            style={{ 
              width: width,
              height: containerHeight,
              transform: `scale(${displayScale})`,
              WebkitTouchCallout: 'none' 
            }}
          />
          <div 
            ref={textLayerDivRef} 
            className={cn("textLayer absolute inset-0 origin-top-left", selectionMode && "selection-active")}
            style={{ 
              zIndex: selectionMode ? 100 : 1,
              width: displayWidth,
              height: displayHeight,
              pointerEvents: selectionMode ? 'auto' : 'none',
              userSelect: selectionMode ? 'text' : 'none',
              WebkitUserSelect: selectionMode ? 'text' : 'none',
              touchAction: selectionMode ? 'auto' : 'none',
              transform: 'none',
              display: selectionMode ? 'none' : 'block'
            }} 
          />
          
          {selectionMode && (
            <div 
              className="flow-text-page"
              style={{
                position: "absolute",
                inset: 0,
                background: "white",
                color: "black",
                zIndex: 99999,
                overflow: "auto",
                padding: 20,
                fontSize: 18,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                userSelect: "text",
                WebkitUserSelect: "text",
                textAlign: 'left'
              }}
            >
              <div className="mb-4 pb-2 border-b border-zinc-200 flex justify-between items-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Flow Text Diagnostic (Page {pageNumber})</span>
                {isExtracting && <span className="text-[10px] text-zinc-500 animate-pulse">Extracting...</span>}
              </div>
              {extError ? (
                <div className="bg-red-50 p-4 border border-red-200 rounded-lg">
                  <div className="text-red-600 font-bold flex items-center gap-2 mb-4">
                    <AlertCircle className="w-5 h-5" />
                    <span>CRITICAL EXTRACTION FAILURE</span>
                  </div>
                  <pre className="text-[10px] font-mono text-red-800 whitespace-pre-wrap overflow-auto max-h-[300px] leading-tight">
                    {`Error: ${String(extError)}\n\n`}
                    {extError.stack && `Stack:\n${extError.stack}\n\n`}
                    {`JSON:\n${JSON.stringify(extError, Object.getOwnPropertyNames(extError), 2)}`}
                  </pre>
                </div>
              ) : (isExtracting && !pageText) ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p>Extracting text content...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pageText ? (
                    <>
                      <div className="p-4 bg-zinc-50 border border-zinc-100 rounded text-xs text-zinc-500 font-mono">
                        Extracted {pageText.split(' ').length} words | {pageText.length} characters
                      </div>
                      <div className="whitespace-pre-wrap">
                        {pageText}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-zinc-400 border-2 border-dashed border-zinc-100 rounded-xl">
                      <AlertCircle className="w-8 h-8 mb-4 opacity-20" />
                      <p className="font-medium">No selectable text found on this page.</p>
                      <p className="text-xs mt-2 opacity-60">This typically happens with scanned documents or PDFs where text is rendered as images.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
