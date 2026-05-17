import React, { useState, useEffect, useRef } from 'react';
import { pdfjs, samplePDFText, detectDirectionFromText } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2, AlertCircle } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';
import { useSafeArea } from './SafeAreaProvider';
import { PDFTileEngine } from './PDFTileEngine';

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
  const touchStartOnTextLayer = useRef(false);
  const isPinching = useRef(false);
  const isPanning = useRef(false);
  const isAnimatingZoom = useRef(false);
  const isDoubleTapZooming = useRef(false);
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

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      
      // Clear all previous highlight containers
      const allHighlightContainers = document.querySelectorAll('.selection-highlights');
      allHighlightContainers.forEach(container => {
        container.innerHTML = '';
      });

      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);

      const allTextLayers = Array.from(document.querySelectorAll('.textLayer'));
      allTextLayers.forEach(tl => {
        const spans = Array.from(tl.querySelectorAll('span'));
        // Find which spans are inside the selection range using native containsNode
        const selectedSpans = spans.filter(span => selection.containsNode(span, true));
        
        if (selectedSpans.length === 0) return;
        
        let highlightContainer = tl.querySelector('.selection-highlights') as HTMLElement;
        if (!highlightContainer) {
          highlightContainer = document.createElement('div');
          highlightContainer.className = 'selection-highlights';
          Object.assign(highlightContainer.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '0'
          });
          tl.appendChild(highlightContainer);
        }
        
        const frag = document.createDocumentFragment();
        selectedSpans.forEach(span => {
          const div = document.createElement('div');
          Object.assign(div.style, {
            position: 'absolute',
            left: `${span.offsetLeft}px`,
            top: `${span.offsetTop}px`,
            width: `${span.offsetWidth}px`,
            height: `${span.offsetHeight}px`,
            backgroundColor: 'rgba(249, 115, 22, 0.35)', // Semi-transparent orange highlight
            pointerEvents: 'none',
            borderRadius: '2px'
          });
          frag.appendChild(div);
        });
        
        highlightContainer.appendChild(frag);
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);



  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(book.readingDirection || 'ltr');
  const [viewMode, setViewMode] = useState<'single' | 'double'>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 1024 ? 'double' : 'single';
    }
    return 'single';
  });
  const [pageIndex, setPageIndex] = useState(() => {
    if (initialPage > 1) {
      const mode = typeof window !== 'undefined' && window.innerWidth > 1024 ? 'double' : 'single';
      return mode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1;
    }
    return 0;
  }); // 0-based for internal math
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
  const isDraggingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const lastPanTime = useRef(0);
  const [showControls, setShowControls] = useState(true);
  const renderScale = committedScale;
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

  // Double tap to zoom handler
  const lastTapInfo = useRef({ time: 0, x: 0, y: 0 });
  
  // Motion transform for zoom percentage display
  const liveScalePercent = useTransform(liveScale, v => `${Math.round(v * 100)}%`);

  const handleDoubleTapZoom = (clientX: number, clientY: number) => {
    try {
      if (!readerContainerRef.current) return;
      if (isAnimatingZoom.current || isPinching.current) return;
      if (!Number.isFinite(liveScale.get())) return;

      isAnimatingZoom.current = true;
      liveScale.stop();
      panX.stop();
      panY.stop();

      const currentScaleValue = liveScale.get();
      const isZoomedOut = currentScaleValue <= 1.05;
      const targetScale = isZoomedOut ? 2.5 : 1.0;
      
      let targetPanX = 0;
      let targetPanY = 0;

      if (isZoomedOut) {
        const containerRect = readerContainerRef.current.getBoundingClientRect();
        const safeTapX = Math.max(containerRect.width * 0.2, Math.min(containerRect.width * 0.8, clientX - containerRect.left));
        const safeTapY = Math.max(containerRect.height * 0.2, Math.min(containerRect.height * 0.8, clientY - containerRect.top));
        
        targetPanX = (readerContainerRef.current.clientWidth / 2 - safeTapX) * (targetScale / currentScaleValue);
        targetPanY = (readerContainerRef.current.clientHeight / 2 - safeTapY) * (targetScale / currentScaleValue);
        
        const aspect = 1.414;
        const spreadWidth = baseWidth * (viewMode === 'double' ? 2 : 1);
        const zoomedWidth = spreadWidth * targetScale;
        const zoomedHeight = (baseWidth * aspect) * targetScale;
        const viewportWidth = readerDimensions.width;
        const viewportHeight = readerDimensions.height;
        
        const hMargin = Math.max(0, (zoomedWidth - viewportWidth) / 2);
        const vMargin = Math.max(0, (zoomedHeight - viewportHeight) / 2);
        
        targetPanX = Math.max(-hMargin, Math.min(hMargin, targetPanX));
        targetPanY = Math.max(-vMargin, Math.min(vMargin, targetPanY));
      }
      
      if (isZoomedOut && showControls) {
        setShowControls(false);
      }

      const animConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };
      animate(liveScale, targetScale, animConfig);
      animate(panX, targetPanX, animConfig);
      animate(panY, targetPanY, {
        ...animConfig,
        onComplete: () => {
          setCommittedScale(targetScale);
          isAnimatingZoom.current = false;
        }
      });
    } catch (err) {
      isAnimatingZoom.current = false;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    try {
      if (e.button === 2) return; // ignore right clicks
      const target = e.target as HTMLElement;
      if (target.closest('button, input')) return;
      
      // Clear any existing long press timer
      if (longPressTimer.current) clearTimeout(longPressTimer.current);

      const isText = target.tagName.toLowerCase() === 'span' || target.closest('.textLayer span');
      touchStartOnTextLayer.current = !!isText;
      touchStartInfo.current = { x: e.clientX, y: e.clientY, time: Date.now() };

      // Handle Double Tap Zoom (takes priority over everything)
      const now = Date.now();
      const dx = e.clientX - lastTapInfo.current.x;
      const dy = e.clientY - lastTapInfo.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (now - lastTapInfo.current.time < 300 && dist < 15) {
        e.preventDefault(); // Stop native double-tap word selection or browser zoom
        isDoubleTapZooming.current = true;
        window.getSelection()?.removeAllRanges();
        handleDoubleTapZoom(e.clientX, e.clientY);
        lastTapInfo.current = { time: 0, x: 0, y: 0 };
        return;
      } else {
        lastTapInfo.current = { time: now, x: e.clientX, y: e.clientY };
      }

      // Prevent Safari from natively collapsing selection on touch start when panning/zooming on the background
      const selection = window.getSelection();
      const hasActiveSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
      
      if (hasActiveSelection && e.pointerType === 'touch' && !isText) {
        e.preventDefault();
      }

      // On PC (mouse): if we click on text, lock into SelectingText to allow native selection
      if (e.pointerType === 'mouse' && isText) {
        gestureMode.current = GestureMode.SelectingText;
        return;
      }

      // On Mobile (touch): long press on a word initiates text selection
      if (e.pointerType === 'touch' && isText) {
        longPressTimer.current = setTimeout(() => {
          if (gestureMode.current === GestureMode.Idle) {
            gestureMode.current = GestureMode.SelectingText;
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

  const pageCache = useRef<Map<number, Map<number, HTMLCanvasElement>>>(new Map());

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

  // Automatic reading direction detection is now done during loadPDF

  // Keep virtualPage in sync with state
  useEffect(() => {
    if (!isDraggingRef.current) {
      animate(virtualPage, pageIndex, {
        type: 'spring',
        stiffness: 450,
        damping: 45
      });
    }
  }, [pageIndex, virtualPage]);

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
      // If in SelectingText, browsers handle everything natively
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
        isDraggingRef.current = true;
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
        // SWIPE MODE (selection is preserved — it will naturally become irrelevant on page change)
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
        // Reset mode so subsequent swipe gestures work on mouse/PC
        gestureMode.current = GestureMode.Idle;
      }

      const mode = gestureMode.current;
      if (mode === GestureMode.PanningZoomedPage) {
        isDraggingRef.current = false;
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
        isDraggingRef.current = false;
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

      lastPanTime.current = Date.now();
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
    }
  }, [isLandscape]);

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

        let finalDirection = book.readingDirection || 'ltr';
        if (!book.directionDetected) {
          try {
            const text = await samplePDFText(pdfDoc);
            finalDirection = detectDirectionFromText(text);
            updateBook({
              ...book,
              readingDirection: finalDirection,
              directionDetected: true
            });
          } catch (e) {
            console.error(`[DirectionDetection] Failed to run detection:`, e);
          }
        }
        setDirection(finalDirection);

        // Initial page index is handled by useState initializer

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
  const isReady = !isLoading && readerDimensions.width > 0;
  
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
      isDraggingRef.current = false;
      
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
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col overflow-hidden"
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
            transition={{ type: "tween", ease: "easeOut", duration: 0.2 }}
            style={{ 
              paddingTop: `${insets.top + (isLandscape ? 8 : 16)}px`,
              willChange: "transform",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)"
            }}
            dir={direction === 'rtl' ? "rtl" : "ltr"}
            className={cn(
              "fixed top-0 left-0 right-0 flex items-center justify-between gap-4 text-white/70 border-b border-white/5 bg-zinc-950 z-[310] select-none",
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
        className="flex-1 relative flex items-center justify-center bg-zinc-950/40 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          // If we just finished a double-tap zoom, consume the click events and return
          if (isDoubleTapZooming.current) {
            isDoubleTapZooming.current = false;
            return;
          }

          // Prevent controls flickering by ignoring clicks if we just finished a pan
          if (Date.now() - lastPanTime.current < 150) return;

          // If text is selected, clear it ONLY on a genuine quick tap/click (dist < 5 means no drag occurred)
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
            const dx = e.clientX - touchStartInfo.current.x;
            const dy = e.clientY - touchStartInfo.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
              selection.removeAllRanges();
              return;
            }
            // Keep selection active if it was a drag
            return;
          }

          // If controls are shown, clicking hides them. If hidden, clicking might show them OR turn page.
          if (!showControls) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            if (x < width * 0.25) {
              handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1);
              return;
            } else if (x > width * 0.75) {
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
        {!isReady ? (
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
                    key={`${sheetIndex}-${viewMode}`}
                    index={sheetIndex}
                    pdf={pdf!}
                    numPages={numPages}
                    viewMode={viewMode}
                    direction={direction}
                    virtualPage={smoothPage}
                    liveScale={liveScale}
                    renderScale={renderScale}
                    committedScale={committedScale}
                    pageCache={pageCache}
                    isLandscape={isLandscape}
                    containerDimensions={readerDimensions}
                    panX={panX}
                    panY={panY}
                    isCurrent={sheetIndex === pageIndex}
                  />
                );
              });
            })()}
          </motion.div>
        )}
      </div>

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
        {showControls && isReady && !error && (
          <motion.div 
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.2 }}
            dir={direction === 'rtl' ? "rtl" : "ltr"}
            style={{ 
              paddingBottom: `${insets.bottom + (isLandscape ? 8 : 16)}px`,
              willChange: "transform",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)"
            }}
            className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-zinc-950 shadow-2xl border-t border-white/5 z-[310] select-none"
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
  pageCache,
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
  pageCache: any,
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

  // Use the recalculated one from parent if possible
  const displayWidth = baseWidth;
  
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
  
  // Visual scale logging removed to prevent overhead during animations

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
            width: 'fit-content',
            height: 'fit-content',
            willChange: 'transform'
          } as any}
          className={cn(
            "flex flex-shrink-0 gap-0 my-auto origin-center",
            viewMode === 'double' ? "flex-row" : "flex-col"
          )}
        >
        {viewMode === 'double' ? (
          <>
            {direction === 'rtl' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} pageCache={pageCache} side="left" isLandscape={isLandscape} liveScale={liveScale} direction={direction} panX={panX} panY={panY} containerDimensions={containerDimensions} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} pageCache={pageCache} side="right" isLandscape={isLandscape} liveScale={liveScale} direction={direction} panX={panX} panY={panY} containerDimensions={containerDimensions} />
              </>
            ) : (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} pageCache={pageCache} side="left" isLandscape={isLandscape} liveScale={liveScale} direction={direction} panX={panX} panY={panY} containerDimensions={containerDimensions} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} numPages={numPages} width={displayWidth} renderScale={renderScale} committedScale={committedScale} pageCache={pageCache} side="right" isLandscape={isLandscape} liveScale={liveScale} direction={direction} panX={panX} panY={panY} containerDimensions={containerDimensions} />
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
            <PDFPage pageNumber={index + 1} pdf={pdf} width={displayWidth} renderScale={renderScale} committedScale={committedScale} pageCache={pageCache} liveScale={liveScale} direction={direction} panX={panX} panY={panY} containerDimensions={containerDimensions} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

const SpreadPage = React.memo(function SpreadPage({ pdf, pageNumber, numPages, width, renderScale, committedScale, pageCache, side, isLandscape, liveScale, direction, panX, panY, containerDimensions }: { 
  pdf: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  numPages: number, 
  width: number, 
  renderScale: number,
  committedScale: number,
  pageCache: any,
  side: 'left' | 'right', 
  isLandscape?: boolean, 
  liveScale: any,
  direction: 'ltr' | 'rtl',
  panX: any,
  panY: any,
  containerDimensions: { width: number, height: number }
}) {
  const isOutOfBounds = pageNumber > numPages;
  
  const content = isOutOfBounds ? (
    <div className="flex-shrink-0 bg-white" style={{ width: width || 'auto', height: '100%', opacity: 0.1 }} />
  ) : (
    <div 
      className={cn(
        "flex-shrink-0 h-auto relative flex items-center justify-center",
        side === 'left' ? "rounded-l-md" : "rounded-r-md",
        "bg-white"
      )}
      style={{ 
        width: width || 'auto'
      }}
    >
      <div className={cn(
        "absolute inset-y-0 w-2 z-[-1] bg-zinc-100 border border-zinc-300 shadow-sm rounded-sm",
        side === 'left' ? "-left-1" : "-right-1"
      )} />
      <div className={cn(
        "absolute inset-y-0 w-2 z-[-2] bg-zinc-100 border border-zinc-300 shadow-sm rounded-sm",
        side === 'left' ? "-left-2" : "-right-2"
      )} />

      <div className={cn(
        "absolute inset-y-0 w-16 z-10 pointer-events-none",
        side === 'left' 
          ? "right-0 bg-gradient-to-l from-black/20 via-black/5 to-transparent" 
          : "left-0 bg-gradient-to-r from-black/20 via-black/5 to-transparent"
      )} />

      <div className={cn(
        "absolute inset-0 z-20 pointer-events-none border-zinc-200",
        side === 'left' ? "border-l border-y rounded-l-md shadow-[inset_1px_0_1px_rgba(255,255,255,1)]" : "border-r border-y rounded-r-md shadow-[inset_-1px_0_1px_rgba(255,255,255,1)]"
      )} />

      <PDFPage pageNumber={pageNumber} pdf={pdf} width={width} renderScale={renderScale} committedScale={committedScale} pageCache={pageCache} liveScale={liveScale} direction={direction} isSpreadChild={true} panX={panX} panY={panY} containerDimensions={containerDimensions} side={side} />
    </div>
  );

  return <>{content}</>;
});

interface PDFPageProps {
  pageNumber: number;
  pdf: pdfjs.PDFDocumentProxy;
  width: number;
  renderScale: number;
  committedScale: number;
  liveScale: any;
  direction: 'ltr' | 'rtl';
  isSpreadChild?: boolean;
  pageCache: any;
  panX: any;
  panY: any;
  containerDimensions: { width: number, height: number };
  side?: 'left' | 'right' | 'center';
}

const PDFPage: React.FC<PDFPageProps> = React.memo(({ pageNumber, pdf, width, renderScale, committedScale, pageCache, liveScale, direction, isSpreadChild, panX, panY, containerDimensions, side }) => {
  const [pageSize, setPageSize] = useState(() => {
    // Start with a reasonable guess to minimize layout jump
    return { width: width || 1, height: (width || 1) * 1.414 };
  });
  const textLayerDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    pdf.getPage(pageNumber).then(page => {
      const viewport = page.getViewport({ scale: 1 });
      if (isMounted) {
        setPageSize({ width: viewport.width, height: viewport.height });
        
        // Render Text Layer
        if (textLayerDivRef.current) {
          textLayerDivRef.current.innerHTML = '';
          const fitScale = width / viewport.width;
          const textViewport = page.getViewport({ scale: fitScale });
          page.getTextContent().then(content => {
            if (!isMounted || !textLayerDivRef.current) return;
            textLayerDivRef.current.style.setProperty('--scale-factor', textViewport.scale.toString());
            pdfjs.renderTextLayer({ textContentSource: content, container: textLayerDivRef.current, viewport: textViewport, textDivs: [] });
            
            // Post-process: Wrap lines into textLine hit-test regions
            const textLayer = textLayerDivRef.current;
            
            const spans = Array.from(textLayer.querySelectorAll('span'));
            const lineGroups = new Map<number, HTMLElement[]>();
            
            spans.forEach(span => {
              const top = (span as HTMLElement).offsetTop;
              // Group with 2px tolerance
              const key = Math.round(top / 2) * 2;
              if (!lineGroups.has(key)) lineGroups.set(key, []);
              lineGroups.get(key)?.push(span as HTMLElement);
            });
            
            lineGroups.forEach(spansInLine => {
              const wrapper = document.createElement('div');
              wrapper.className = 'textLine';
              // Insert wrapper before first span
              spansInLine[0].parentNode!.insertBefore(wrapper, spansInLine[0]);
              // Move all spans into the wrapper
              spansInLine.forEach(span => wrapper.appendChild(span));
            });
          });
        }
      }
    });
    return () => { isMounted = false; };
  }, [pdf, pageNumber, width]);

  const aspectRatio = pageSize.height / pageSize.width || 1.414;
  const displayWidth = width;
  const displayHeight = width * aspectRatio;
  const sheetRelX = side === 'left' ? -width : side === 'right' ? 0 : -width/2;

  if (pageSize.width <= 1) return <div style={{ width: displayWidth, height: displayHeight }} className="bg-zinc-900 animate-pulse rounded-sm" />;

  return (
    <div 
      className="relative bg-white shadow-2xl overflow-hidden"
      style={{ width: displayWidth, height: displayHeight }}
    >
      <PDFTileEngine 
        pageNumber={pageNumber}
        pdf={pdf}
        width={displayWidth}
        height={displayHeight}
        panX={panX}
        panY={panY}
        liveScale={liveScale}
        committedScale={committedScale}
        dims={containerDimensions}
        isVisible={true}
        sheetRelX={sheetRelX}
      />
      <div 
        ref={textLayerDivRef} 
        className={cn(
          "textLayer absolute inset-0 z-[60] select-text",
          direction === 'rtl' ? "rtl" : "ltr"
        )}
      />
    </div>
  );
});
