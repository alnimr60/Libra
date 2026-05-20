import React, { useState, useEffect, useRef } from 'react';
import { pdfjs, samplePDFText, detectDirectionFromText } from '../../../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { get } from 'idb-keyval';
import { cn } from '../../../lib/utils';
import { Book, Bookmark } from '../../../types';
import { PDFTileEngine } from './PDFTileEngine';
import { useReader } from '../ReaderContext';
import ReaderShell from '../ReaderShell';

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
  SelectingText = 'SelectingText',
}

export default function PDFReader({ book, initialPage, onPageChange, updateBook, onUpdateBookmarks, onClose }: PDFReaderProps) {
  const { direction, setDirection } = useReader();
  
  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const isDraggingRef = useRef(false);
  const isAnimatingZoom = useRef(false);
  const lastTapInfo = useRef({ time: 0, x: 0, y: 0 });
  const touchStartInfo = useRef({ x: 0, y: 0 });
  const lastPanTime = useRef(0);
  const fileDataId = book.fileDataId;
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [committedScale, setCommittedScale] = useState(1.0);
  const liveScale = useMotionValue(1.0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);

  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'double'>(() => {
    if (typeof window !== 'undefined') return window.innerWidth > 1024 ? 'double' : 'single';
    return 'single';
  });
  const [pageIndex, setPageIndex] = useState(() => {
    if (initialPage > 1) {
      const mode = typeof window !== 'undefined' && window.innerWidth > 1024 ? 'double' : 'single';
      return mode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1;
    }
    return 0;
  });
  
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const [readerDimensions, setReaderDimensions] = useState({ width: 0, height: 0 });
  const pinchRef = useRef({ 
    initialDist: 0, 
    initialScale: 1, 
    initialPanX: 0, 
    initialPanY: 0, 
    midpoint: { x: 0, y: 0 } 
  });

  useEffect(() => {
    animate(liveScale, committedScale, { type: 'spring', stiffness: 300, damping: 30 });
    if (committedScale <= 1.05) {
      animate(panX, 0, { type: 'spring', stiffness: 300, damping: 30 });
      animate(panY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [committedScale]);

  useEffect(() => {
    if (!readerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        window.requestAnimationFrame(() => {
          setReaderDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
      }
    });
    observer.observe(readerContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function loadPDF() {
      try {
        setIsLoading(true);
        if (!fileDataId) return;
        const data = await get(fileDataId);
        if (!data) throw new Error('File not found');
        
        const loadingTask = pdfjs.getDocument({ 
          data: new Uint8Array(data),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
          cMapPacked: true,
        });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);

        if (!book.directionDetected) {
          const text = await samplePDFText(pdfDoc);
          const detected = detectDirectionFromText(text);
          setDirection(detected);
          updateBook({ ...book, readingDirection: detected, directionDetected: true });
        } else {
          setDirection(book.readingDirection || 'ltr');
        }
        setIsLoading(false);
      } catch (err) {
        console.error('PDF Load Error:', err);
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [fileDataId]);

  const baseWidth = React.useMemo(() => {
    if (readerDimensions.width === 0) return 300;
    const maxWidth = readerDimensions.width * (viewMode === 'double' ? 0.95 : 0.9);
    const maxHeight = readerDimensions.height * 0.9;
    const idealWidth = maxHeight * 0.707 * (viewMode === 'double' ? 2 : 1);
    return Math.min(idealWidth, maxWidth) / (viewMode === 'double' ? 2 : 1);
  }, [viewMode, readerDimensions]);

  const virtualPage = useMotionValue(pageIndex);
  const smoothPage = useSpring(virtualPage, { stiffness: 450, damping: 45, mass: 0.8 });

  useEffect(() => {
    animate(virtualPage, pageIndex, { type: 'spring', stiffness: 450, damping: 45 });
  }, [pageIndex, virtualPage]);

  const handlePageChange = (newIndex: number) => {
    const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    setPageIndex(safeIndex);
    const displayPage = viewMode === 'double' ? (safeIndex * 2) + 1 : safeIndex + 1;
    onPageChange(Math.min(displayPage, numPages));
  };

  const clampPan = (x: number, y: number, scaleValue = liveScale.get()) => {
    const spreadWidth = baseWidth * (viewMode === 'double' ? 2 : 1);
    const spreadHeight = baseWidth * 1.414;
    const hMargin = Math.max(0, (spreadWidth * scaleValue - readerDimensions.width) / 2);
    const vMargin = Math.max(0, (spreadHeight * scaleValue - readerDimensions.height) / 2);

    return {
      x: Math.max(-hMargin, Math.min(hMargin, x)),
      y: Math.max(-vMargin, Math.min(vMargin, y)),
    };
  };

  const handleDoubleTapZoom = (clientX: number, clientY: number) => {
    if (!readerContainerRef.current || isAnimatingZoom.current) return;

    isAnimatingZoom.current = true;
    liveScale.stop();
    panX.stop();
    panY.stop();

    const currentScale = liveScale.get();
    const targetScale = currentScale <= 1.05 ? 2.5 : 1;
    let targetPan = { x: 0, y: 0 };

    if (targetScale > 1) {
      const rect = readerContainerRef.current.getBoundingClientRect();
      const tapX = clientX - rect.left;
      const tapY = clientY - rect.top;
      targetPan = clampPan(
        (rect.width / 2 - tapX) * (targetScale / currentScale),
        (rect.height / 2 - tapY) * (targetScale / currentScale),
        targetScale
      );
    }

    const config = { type: 'spring' as const, stiffness: 300, damping: 30 };
    animate(liveScale, targetScale, config);
    animate(panX, targetPan.x, config);
    animate(panY, targetPan.y, {
      ...config,
      onComplete: () => {
        setCommittedScale(targetScale);
        isAnimatingZoom.current = false;
      }
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input')) return;

    const isText = !!target.closest('.textLayer span');
    touchStartInfo.current = { x: e.clientX, y: e.clientY };

    const now = Date.now();
    const dx = e.clientX - lastTapInfo.current.x;
    const dy = e.clientY - lastTapInfo.current.y;
    const dist = Math.hypot(dx, dy);

    if (!isText && now - lastTapInfo.current.time < 300 && dist < 20) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      handleDoubleTapZoom(e.clientX, e.clientY);
      lastTapInfo.current = { time: 0, x: 0, y: 0 };
      return;
    }

    lastTapInfo.current = { time: now, x: e.clientX, y: e.clientY };
    gestureMode.current = isText ? GestureMode.SelectingText : GestureMode.Idle;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && !isAnimatingZoom.current) {
      gestureMode.current = GestureMode.PinchZooming;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      if (!readerContainerRef.current) return;
      const rect = readerContainerRef.current.getBoundingClientRect();
      pinchRef.current = {
        initialDist: dist,
        initialScale: liveScale.get(),
        initialPanX: panX.get(),
        initialPanY: panY.get(),
        midpoint: { x: (t1.clientX + t2.clientX) / 2 - (rect.left + rect.width / 2), y: (t1.clientY + t2.clientY) / 2 - (rect.top + rect.height / 2) }
      };
      liveScale.stop(); panX.stop(); panY.stop();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (gestureMode.current === GestureMode.PinchZooming && e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const nextScale = Math.max(0.5, Math.min(6, pinchRef.current.initialScale * (dist / pinchRef.current.initialDist)));
      liveScale.set(nextScale);
      const sDelta = nextScale / pinchRef.current.initialScale;
      const p = pinchRef.current.midpoint;
      panX.set(p.x - (p.x - pinchRef.current.initialPanX) * sDelta);
      panY.set(p.y - (p.y - pinchRef.current.initialPanY) * sDelta);
    }
  };

  const handlePanStart = () => {
    if (gestureMode.current !== GestureMode.Idle || isAnimatingZoom.current) return;
    panX.stop();
    panY.stop();
    liveScale.stop();
  };

  const handlePanMove = (_: any, info: any) => {
    if (gestureMode.current === GestureMode.SelectingText || gestureMode.current === GestureMode.PinchZooming || isAnimatingZoom.current) return;

    const moveDist = Math.hypot(info.offset.x, info.offset.y);
    const currentScale = liveScale.get();

    if (gestureMode.current === GestureMode.Idle && moveDist > 10) {
      const isHorizontal = Math.abs(info.offset.x) > Math.abs(info.offset.y);
      gestureMode.current = currentScale > 1.05 ? GestureMode.PanningZoomedPage : (isHorizontal ? GestureMode.SwipingPages : GestureMode.Idle);
      isDraggingRef.current = gestureMode.current !== GestureMode.Idle;
    }

    if (gestureMode.current === GestureMode.PanningZoomedPage) {
      const next = clampPan(panX.get() + info.delta.x, panY.get() + info.delta.y, currentScale);
      panX.set(next.x);
      panY.set(next.y);
    } else if (gestureMode.current === GestureMode.SwipingPages) {
      const progress = info.offset.x / Math.max(1, readerDimensions.width || window.innerWidth);
      virtualPage.set(direction === 'rtl' ? pageIndex + progress : pageIndex - progress);
    }
  };

  const handlePanEnd = (_: any, info: any) => {
    lastPanTime.current = Date.now();

    if (gestureMode.current === GestureMode.PanningZoomedPage) {
      const target = clampPan(panX.get() + info.velocity.x * 0.08, panY.get() + info.velocity.y * 0.08);
      animate(panX, target.x, { type: 'spring', stiffness: 120, damping: 28 });
      animate(panY, target.y, { type: 'spring', stiffness: 120, damping: 28 });
    } else if (gestureMode.current === GestureMode.SwipingPages) {
      const width = Math.max(1, readerDimensions.width || window.innerWidth);
      const projectedOffsetX = info.offset.x + info.velocity.x * 0.2;
      const projectedProgress = projectedOffsetX / width;
      const projectedVirtualPage = direction === 'rtl' ? pageIndex + projectedProgress : pageIndex - projectedProgress;

      const shouldTurn = Math.abs(projectedVirtualPage - pageIndex) > 0.18;
      
      if (shouldTurn) {
        const movedForward = projectedVirtualPage > pageIndex;
        handlePageChange(movedForward ? pageIndex + 1 : pageIndex - 1);
      } else {
        animate(virtualPage, pageIndex, { type: 'spring', stiffness: 450, damping: 45 });
      }
    }

    if (gestureMode.current !== GestureMode.SelectingText) {
      gestureMode.current = GestureMode.Idle;
    }
    isDraggingRef.current = false;
  };

  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;
  const progress = Math.round(((pageIndex + 1) / totalSheets) * 100);

  return (
    <ReaderShell
      book={book}
      onClose={onClose}
      currentPage={viewMode === 'double' ? (pageIndex * 2) + 1 : pageIndex + 1}
      totalPages={numPages}
      progress={progress}
      onPageChange={(p) => handlePageChange(viewMode === 'double' ? Math.floor((p - 1) / 2) : p - 1)}
      onUpdateBookmarks={onUpdateBookmarks}
      onPrev={() => handlePageChange(direction === 'ltr' ? pageIndex - 1 : pageIndex + 1)}
      onNext={() => handlePageChange(direction === 'ltr' ? pageIndex + 1 : pageIndex - 1)}
      onJumpToPage={(p) => handlePageChange(viewMode === 'double' ? Math.floor((p - 1) / 2) : p - 1)}
      title={book.title}
      disableInteractionZones
    >
      <div 
        ref={readerContainerRef}
        className="w-full h-full relative"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { gestureMode.current = GestureMode.Idle; setCommittedScale(liveScale.get()); }}
        onClick={(e) => {
          if (Date.now() - lastPanTime.current < 150) return;
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
            const dist = Math.hypot(e.clientX - touchStartInfo.current.x, e.clientY - touchStartInfo.current.y);
            if (dist < 5) selection.removeAllRanges();
            return;
          }
        }}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-orange-500/40">
            <Loader2 className="w-12 h-12 animate-spin" />
            <p className="font-mono text-[10px] tracking-widest uppercase">Initializing Engine</p>
          </div>
        ) : (
          <motion.div
            className="w-full h-full relative"
            onPanStart={handlePanStart}
            onPan={handlePanMove}
            onPanEnd={handlePanEnd}
          >
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
                  committedScale={committedScale}
                  containerDimensions={readerDimensions}
                  panX={panX}
                  panY={panY}
                  baseWidth={baseWidth}
                />
              );
            })}
          </motion.div>
        )}
      </div>
    </ReaderShell>
  );
}

const ReaderSheet = React.memo(function ReaderSheet({ 
  index, pdf, numPages, viewMode, direction, virtualPage, liveScale, committedScale, containerDimensions, panX, panY, baseWidth 
}: any) {
  const distance = useTransform(virtualPage, (v: number) => direction === 'rtl' ? v - index : index - v);
  const x = useTransform(distance, (d: number) => 100 * d);
  const zIndex = useTransform(distance, (d: number) => 10 - Math.abs(Math.round(d)));
  const rotateY = useTransform(distance, (d: number) => d * (direction === 'rtl' ? -15 : 15));
  const tScale = useTransform(distance, (d: number) => 1 - (Math.abs(d) * 0.1));
  const opacity = useTransform(distance, (d: number) => 1 - Math.abs(d));

  return (
    <motion.div
      style={{ opacity, zIndex, x, rotateY, perspective: 2000 } as any}
      className={cn("absolute inset-0 flex items-center justify-center")}
    >
      <motion.div 
        style={{ scale: useTransform([liveScale, tScale], ([s, ts]: any) => s * ts), x: panX, y: panY } as any}
        className={cn("flex gap-0 shadow-2xl origin-center", viewMode === 'double' ? "flex-row" : "flex-col")}
      >
        {viewMode === 'double' ? (
          <>
            {direction === 'rtl' ? (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} width={baseWidth} numPages={numPages} committedScale={committedScale} direction={direction} panX={panX} panY={panY} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} width={baseWidth} numPages={numPages} committedScale={committedScale} direction={direction} panX={panX} panY={panY} />
              </>
            ) : (
              <>
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 1} width={baseWidth} numPages={numPages} committedScale={committedScale} direction={direction} panX={panX} panY={panY} />
                <SpreadPage pdf={pdf} pageNumber={(index * 2) + 2} width={baseWidth} numPages={numPages} committedScale={committedScale} direction={direction} panX={panX} panY={panY} />
              </>
            )}
          </>
        ) : (
          <PDFPage pageNumber={index + 1} pdf={pdf} width={baseWidth} committedScale={committedScale} direction={direction} panX={panX} panY={panY} />
        )}
      </motion.div>
    </motion.div>
  );
});

const SpreadPage = ({ pdf, pageNumber, width, numPages, committedScale, direction, panX, panY }: any) => {
  if (pageNumber > numPages) return <div style={{ width, height: width * 1.414 }} className="bg-white/5" />;
  return <PDFPage pageNumber={pageNumber} pdf={pdf} width={width} committedScale={committedScale} direction={direction} panX={panX} panY={panY} />;
};

const PDFPage = ({ pageNumber, pdf, width, committedScale, direction, panX, panY }: any) => {
  const [pageSize, setPageSize] = useState({ width: width || 1, height: (width || 1) * 1.414 });
  const textLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    pdf.getPage(pageNumber).then(async (page: any) => {
      if (!active) return;
      const viewport = page.getViewport({ scale: 1 });
      const fitScale = width / viewport.width;
      const textViewport = page.getViewport({ scale: fitScale });
      setPageSize({ width: viewport.width, height: viewport.height });

      if (!textLayerRef.current) return;
      textLayerRef.current.innerHTML = '';
      textLayerRef.current.style.setProperty('--scale-factor', String(textViewport.scale));
      const textContent = await page.getTextContent();
      if (!active || !textLayerRef.current) return;
      pdfjs.renderTextLayer({
        textContentSource: textContent,
        container: textLayerRef.current,
        viewport: textViewport,
        textDivs: [],
      });
    });
    return () => { active = false; };
  }, [pdf, pageNumber, width]);

  const height = width * (pageSize.height / pageSize.width || 1.414);

  return (
    <div className="bg-white flex-shrink-0 relative overflow-hidden" style={{ width, height }}>
      <PDFTileEngine 
        pageNumber={pageNumber} 
        pdf={pdf} 
        width={width} 
        height={height} 
        committedScale={committedScale}
        isVisible={true}
        panX={panX}
        panY={panY}
        liveScale={useMotionValue(1)}
        dims={{ width, height }}
        sheetRelX={0}
      />
      <div ref={textLayerRef} dir={direction} className="textLayer absolute inset-0" />
    </div>
  );
};