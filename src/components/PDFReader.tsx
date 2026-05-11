import React, { useState, useEffect, useRef, useMemo } from 'react';
import { pdfjs, detectDirectionFromText, samplePDFText } from '../lib/pdf';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2, AlertCircle } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { cn } from '../lib/utils';
import { Book, Bookmark } from '../types';

export interface PDFReaderProps {
  book: Book;
  initialPage: number;
  updateBook: (book: Book) => void;
  onPageChange: (page: number) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

enum GestureMode {
  Idle,
  SwipingPages,
  PanningZoomedPage,
  Pinching
}

// Sub-component for actual PDF page rendering (Canvas + TextLayer)
function PDFPage({ 
  pdf, 
  pageNumber, 
  width, 
  renderScale,
  dpr
}: { 
  pdf: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  width: number,
  renderScale: number,
  dpr: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (!canvasRef.current || !pdf) return;
      
      // Cancel any ongoing render on this component's canvas
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch(e) {}
        renderTaskRef.current = null;
      }

      try {
        console.log(`[RenderStart] Page ${pageNumber}`);
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        // Calculate scale to fit width
        const s = (width / viewport.width) * renderScale * dpr;
        const scaledViewport = page.getViewport({ scale: s });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;
        if (cancelled) return;
        console.log(`[RenderComplete] Page ${pageNumber}`);

        // Text Layer
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          const textContent = await page.getTextContent();
          if (cancelled) return;

          const textLayerTask = pdfjs.renderTextLayer({
            textContent,
            container: textLayerRef.current,
            viewport: scaledViewport,
            textDivs: []
          } as any);
          await textLayerTask.promise;
          console.log(`[TextLayerComplete] Page ${pageNumber}`);
        }

      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`[RenderFailed] Page ${pageNumber}:`, err);
        } else {
          console.log(`[RenderCancel] Page ${pageNumber}`);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      console.log(`[RenderCleanup] Page ${pageNumber}`);
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch(e) {}
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNumber, width, renderScale, dpr]);

  return (
    <div className="relative shadow-2xl bg-white overflow-hidden" style={{ width }}>
      <canvas ref={canvasRef} className="block" />
      <div 
        ref={textLayerRef} 
        className="textLayer absolute top-0 left-0 pointer-events-auto origin-top-left"
        style={{ 
          width: 'max-content',
          height: 'max-content',
          transform: `scale(${1 / (renderScale * dpr)})`,
          opacity: 1
        }}
      />
    </div>
  );
}

// Sheet component in the strip
function ReaderSheet({
  pdf,
  index,
  viewMode,
  direction,
  numPages,
  sheetWidth,
  gap,
  isActive,
  panX,
  panY,
  scale,
  renderScale,
  dpr
}: {
  pdf: pdfjs.PDFDocumentProxy;
  index: number;
  viewMode: 'single' | 'double';
  direction: 'ltr' | 'rtl';
  numPages: number;
  sheetWidth: number;
  gap: number;
  isActive: boolean;
  panX: any;
  panY: any;
  scale: any;
  renderScale: number;
  dpr: number;
}) {
  const layoutX = index * (sheetWidth + gap);

  const content = (
    <div className="flex items-center justify-center h-full select-none">
      {viewMode === 'double' ? (
        <div className="flex flex-row items-center justify-center">
           {direction === 'rtl' ? (
             <>
               <PDFPage 
                pdf={pdf} 
                pageNumber={index * 2 + 2} 
                width={sheetWidth/2} 
                renderScale={renderScale} 
                dpr={dpr} 
               />
               <PDFPage 
                pdf={pdf} 
                pageNumber={index * 2 + 1} 
                width={sheetWidth/2} 
                renderScale={renderScale} 
                dpr={dpr} 
               />
             </>
           ) : (
             <>
               <PDFPage 
                pdf={pdf} 
                pageNumber={index * 2 + 1} 
                width={sheetWidth/2} 
                renderScale={renderScale} 
                dpr={dpr} 
               />
               <PDFPage 
                pdf={pdf} 
                pageNumber={index * 2 + 2} 
                width={sheetWidth/2} 
                renderScale={renderScale} 
                dpr={dpr} 
               />
             </>
           )}
        </div>
      ) : (
        <PDFPage 
          pdf={pdf} 
          pageNumber={index + 1} 
          width={sheetWidth} 
          renderScale={renderScale} 
          dpr={dpr} 
        />
      )}
    </div>
  );

  return (
    <div 
      className="absolute top-0 h-full flex items-center justify-center"
      style={{ 
        left: direction === 'rtl' ? 'auto' : layoutX,
        right: direction === 'rtl' ? layoutX : 'auto',
        width: sheetWidth
      }}
    >
      {isActive ? (
        <motion.div
          id="activeTransformLayer"
          style={{ 
            x: panX, 
            y: panY, 
            scale: scale,
            transformOrigin: '50% 50%',
            willChange: 'transform'
          } as any}
        >
          {content}
        </motion.div>
      ) : (
        content
      )}
    </div>
  );
}

export default function PDFReader({ 
  book, 
  initialPage, 
  onPageChange, 
  onClose 
}: PDFReaderProps) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(initialPage);
  const [readerDimensions, setReaderDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const viewMode = readerDimensions.width > 1024 ? 'double' : 'single';
  const direction = book.readingDirection || 'ltr';
  const numPages = pdf ? pdf.numPages : 0;
  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;
  const sheetWidth = viewMode === 'double' ? Math.min(readerDimensions.width * 0.9, 1400) : Math.min(readerDimensions.width * 0.85, 800);
  const gap = 120;
  const dpr = window.devicePixelRatio || 1;

  const virtualPage = useMotionValue(pageIndex);
  const stripX = useTransform(virtualPage, (v) => {
    const centeringOffset = (readerDimensions.width - sheetWidth) / 2;
    const x = centeringOffset - v * (sheetWidth + gap);
    return direction === 'rtl' ? -x : x;
  });

  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const scale = useMotionValue(1);

  const gestureMode = useRef<GestureMode>(GestureMode.Idle);
  const startPoints = useRef<{ x: number, y: number, dist: number } | null>(null);
  const initialGestureState = useRef({ panX: 0, panY: 0, scale: 1, virtualPage: 0 });

  useEffect(() => {
    async function loadPdf() {
      if (!book.fileDataId) return;
      const data = await get<Uint8Array>(book.fileDataId);
      if (!data) return;
      const loadingTask = pdfjs.getDocument({ data });
      const loadedPdf = await loadingTask.promise;
      setPdf(loadedPdf);
      console.log(`[PDFDocumentLoaded] Pages: ${loadedPdf.numPages}`);
    }
    loadPdf();
  }, [book.fileDataId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setReaderDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handlePageChange = (newIndex: number) => {
    const safeIndex = Math.max(0, Math.min(newIndex, totalSheets - 1));
    setPageIndex(safeIndex);
    animate(virtualPage, safeIndex, { type: 'spring', damping: 30, stiffness: 300 });
    onPageChange(safeIndex);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const x = e.clientX;
    const y = e.clientY;
    startPoints.current = { x, y, dist: 0 };
    initialGestureState.current = {
      panX: panX.get(),
      panY: panY.get(),
      scale: scale.get(),
      virtualPage: virtualPage.get()
    };
    gestureMode.current = GestureMode.Idle;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPoints.current) return;

    const x = e.clientX;
    const y = e.clientY;
    const dx = x - startPoints.current.x;
    const dy = y - startPoints.current.y;
    const moveDist = Math.sqrt(dx * dx + dy * dy);

    if (gestureMode.current === GestureMode.Idle && moveDist > 10) {
      if (scale.get() > 1.02) {
        console.log("[SwipeBlockedZoomed] Mode set to PanningZoomedPage");
        gestureMode.current = GestureMode.PanningZoomedPage;
      } else {
        console.log("[SwipeEnabled] Mode set to SwipingPages");
        gestureMode.current = GestureMode.SwipingPages;
      }
    }

    if (gestureMode.current === GestureMode.SwipingPages) {
      const sensitivity = 1.0;
      const moveInPages = -(dx / (sheetWidth + gap)) * (direction === 'rtl' ? -1 : 1);
      virtualPage.set(initialGestureState.current.virtualPage + moveInPages * sensitivity);
    } else if (gestureMode.current === GestureMode.PanningZoomedPage) {
      panX.set(initialGestureState.current.panX + dx);
      panY.set(initialGestureState.current.panY + dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (gestureMode.current === GestureMode.SwipingPages) {
      const currentV = virtualPage.get();
      const diff = currentV - initialGestureState.current.virtualPage;
      let target = Math.round(currentV);
      if (Math.abs(diff) > 0.2) {
        target = diff > 0 ? Math.ceil(currentV) : Math.floor(currentV);
      }
      handlePageChange(target);
    } else if (gestureMode.current === GestureMode.Idle) {
      // Tap handling (maybe UI toggle)
    }

    startPoints.current = null;
    gestureMode.current = GestureMode.Idle;
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    if (scale.get() > 1.02) {
      animate(scale, 1, { duration: 0.3 });
      animate(panX, 0, { duration: 0.3 });
      animate(panY, 0, { duration: 0.3 });
    } else {
      animate(scale, 2.5, { duration: 0.3 });
      console.log("[ZoomAppliedActiveOnly] Scale to 2.5x");
    }
  };

  if (!pdf) return <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">Loading PDF...</div>;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white z-20">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900 leading-tight truncate max-w-[200px] md:max-w-md">{book.title}</h1>
            <p className="text-xs text-gray-500">Page {pageIndex + 1} of {numPages}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleDoubleTap({} as any)}
            className="p-2 hover:bg-gray-100 rounded-lg flex items-center gap-2 text-sm font-medium"
          >
            <Maximize2 className="w-5 h-5" />
            <span className="hidden md:inline">Zoom</span>
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden relative touch-none bg-gray-100" 
        id="viewport-clip"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleTap}
      >
        <motion.div 
          id="page-strip"
          className="absolute inset-0 flex items-center"
          style={{ x: stripX }}
        >
          {Array.from({ length: totalSheets }).map((_, i) => {
            // Virtualization: only render current and neighbors
            const isVisible = Math.abs(i - pageIndex) <= 1;
            if (!isVisible) return <div key={i} className="absolute" style={{ left: direction === 'rtl' ? 'auto' : i * (sheetWidth + gap), right: direction === 'rtl' ? i * (sheetWidth + gap) : 'auto', width: sheetWidth }} />;

            return (
              <ReaderSheet
                key={i}
                index={i}
                pdf={pdf}
                viewMode={viewMode}
                direction={direction}
                numPages={numPages}
                sheetWidth={sheetWidth}
                gap={gap}
                isActive={i === pageIndex}
                panX={panX}
                panY={panY}
                scale={scale}
                renderScale={1.5} // Higher render scale for crispness
                dpr={dpr}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Footer Navigation */}
      <div className="p-4 border-t bg-white z-20 flex items-center gap-4">
        <input 
          type="range" 
          min="0" 
          max={totalSheets - 1} 
          value={pageIndex}
          onChange={(e) => handlePageChange(parseInt(e.target.value))}
          className="flex-1 accent-blue-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm font-mono font-medium text-gray-600 min-w-[60px] text-right">
          {pageIndex + 1} / {totalSheets}
        </span>
      </div>
      
      <style>{`
        .textLayer {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          opacity: 0.2;
          line-height: 1.0;
        }
        .textLayer span {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        ::selection {
          background: rgba(0, 0, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

