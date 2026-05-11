import React, { useState, useEffect, useRef, useMemo } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { X, Maximize2, Loader2, ChevronLeft, ChevronRight, Settings as SettingsIcon } from 'lucide-react';
import { get } from 'idb-keyval';
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
  Swiping,
  Panning,
  Pinching
}

/**
 * 1. SINGLE RENDER OWNER
 * PDFPage handles canvas and textLayer rendering.
 * One renderTask per component instance, cancelled on cleanup.
 */
function PDFPage({ 
  pdf, 
  pageNumber, 
  width, 
  dpr 
}: { 
  pdf: pdfjs.PDFDocumentProxy; 
  pageNumber: number; 
  width: number;
  dpr: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!canvasRef.current || !pdf || pageNumber < 1 || pageNumber > pdf.numPages) return;

      // Cancel existing task
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }

      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = (width / viewport.width) * dpr;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        // Sync visual size
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${width}px`;
        canvas.style.height = 'auto';

        renderTaskRef.current = page.render({ canvasContext: context, viewport: scaledViewport });
        await renderTaskRef.current.promise;
        if (cancelled) return;

        // Text Layer
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          const textContent = await page.getTextContent();
          if (cancelled) return;

          const textTask = pdfjs.renderTextLayer({
            textContent,
            container: textLayerRef.current,
            viewport: scaledViewport,
            textDivs: []
          } as any);
          await textTask.promise;
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') console.error(err);
      }
    }

    render();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }
    };
  }, [pdf, pageNumber, width, dpr]);

  return (
    <div className="relative bg-white shadow-xl select-text" style={{ width }}>
      <canvas ref={canvasRef} className="block pointer-events-none" />
      <div 
        ref={textLayerRef} 
        className="textLayer absolute inset-0 pointer-events-auto overflow-hidden opacity-0 hover:opacity-10"
        style={{ transform: `scale(${1/dpr})`, transformOrigin: 'top left' }}
      />
    </div>
  );
}

/**
 * 2. READER SHEET
 * Positioned via absolute 'left' based on index.
 */
function ReaderSheet({
  pdf,
  index,
  viewMode,
  direction,
  width,
  gap,
  dpr
}: {
  pdf: pdfjs.PDFDocumentProxy;
  index: number;
  viewMode: 'single' | 'double';
  direction: 'ltr' | 'rtl';
  width: number;
  gap: number;
  dpr: number;
}) {
  const leftOffset = index * (width + gap);

  return (
    <div 
      className="absolute top-0 h-full flex items-center justify-center"
      style={{ 
        left: direction === 'rtl' ? 'auto' : leftOffset,
        right: direction === 'rtl' ? leftOffset : 'auto',
        width: width
      }}
    >
      <div className="flex items-center justify-center p-4">
        {viewMode === 'double' ? (
          <div className="flex items-center">
            {direction === 'rtl' ? (
              <>
                <PDFPage pdf={pdf} pageNumber={index * 2 + 2} width={width/2} dpr={dpr} />
                <PDFPage pdf={pdf} pageNumber={index * 2 + 1} width={width/2} dpr={dpr} />
              </>
            ) : (
              <>
                <PDFPage pdf={pdf} pageNumber={index * 2 + 1} width={width/2} dpr={dpr} />
                <PDFPage pdf={pdf} pageNumber={index * 2 + 2} width={width/2} dpr={dpr} />
              </>
            )}
          </div>
        ) : (
          <PDFPage pdf={pdf} pageNumber={index + 1} width={width} dpr={dpr} />
        )}
      </div>
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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Constants
  const isDesktop = dimensions.width > 1024;
  const viewMode = isDesktop ? 'double' : 'single';
  const direction = book.readingDirection || 'ltr';
  const gap = isDesktop ? 80 : 40;
  const sheetWidth = isDesktop ? Math.min(dimensions.width * 0.9, 1400) : Math.min(dimensions.width * 0.95, 800);
  const totalSheets = pdf ? (viewMode === 'double' ? Math.ceil(pdf.numPages / 2) : pdf.numPages) : 0;
  const dpr = window.devicePixelRatio || 1;

  // Motion values for Camera Layer ONLY
  const camX = useMotionValue(0);
  const camY = useMotionValue(0);
  const camScale = useMotionValue(1);

  // Transform for current page swipe
  const stripOffset = useTransform(camX, (x) => {
    // This connects the panning/swiping to the centered page
    return x; 
  });

  // State Management
  const mode = useRef<GestureMode>(GestureMode.Idle);
  const startPos = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  useEffect(() => {
    async function load() {
      if (!book.fileDataId) return;
      const data = await get<Uint8Array>(book.fileDataId);
      if (!data) return;
      const task = pdfjs.getDocument({ data });
      const doc = await task.promise;
      setPdf(doc);
    }
    load();
  }, [book.fileDataId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Center logic
  useEffect(() => {
    if (dimensions.width === 0) return;
    const centeringOffset = (dimensions.width - sheetWidth) / 2;
    const baseNavX = -pageIndex * (sheetWidth + gap);
    const targetX = direction === 'rtl' ? -baseNavX - centeringOffset : baseNavX + centeringOffset;
    
    // Smooth navigation
    animate(camX, targetX, { type: 'spring', damping: 30, stiffness: 200 });
    animate(camY, 0, { duration: 0.2 });
    animate(camScale, 1, { duration: 0.2 });
  }, [pageIndex, dimensions.width, sheetWidth, direction]);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startPos.current = { 
      x: e.clientX, 
      y: e.clientY,
      camX: camX.get(),
      camY: camY.get()
    };
    mode.current = GestureMode.Idle;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    if (mode.current === GestureMode.Idle && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      if (camScale.get() > 1.02) {
        mode.current = GestureMode.Panning;
      } else {
        mode.current = GestureMode.Swiping;
      }
    }

    if (mode.current === GestureMode.Panning) {
      camX.set(startPos.current.camX + dx);
      camY.set(startPos.current.camY + dy);
    } else if (mode.current === GestureMode.Swiping) {
      camX.set(startPos.current.camX + dx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = e.clientX - startPos.current.x;
    
    if (mode.current === GestureMode.Swiping) {
      const threshold = dimensions.width / 4;
      let newPage = pageIndex;
      if (Math.abs(dx) > threshold) {
        const moveDir = dx > 0 ? -1 : 1;
        const navDir = direction === 'rtl' ? -moveDir : moveDir;
        newPage = Math.max(0, Math.min(pageIndex + navDir, totalSheets - 1));
      }
      setPageIndex(newPage);
      onPageChange(newPage);
    }

    startPos.current = null;
    mode.current = GestureMode.Idle;
  };

  const toggleZoom = () => {
    if (camScale.get() > 1.1) {
      animate(camScale, 1, { duration: 0.3 });
      animate(camY, 0, { duration: 0.3 });
    } else {
      animate(camScale, 2.5, { duration: 0.3 });
    }
  };

  if (!pdf) return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
      <p className="text-gray-500 font-medium">Preparing your reading experience...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#121212] flex flex-col text-white">
      {/* 12. NO DEBUG - CLEAN UI */}
      <div className="h-16 flex items-center justify-between px-6 bg-[#1a1a1a] shadow-lg z-20">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div>
            <h1 className="font-semibold leading-tight truncate max-w-[200px] md:max-w-md">{book.title}</h1>
            <p className="text-xs text-gray-400">Sheet {pageIndex + 1} of {totalSheets}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleZoom} className="p-2 hover:bg-white/10 rounded-lg flex items-center gap-2 text-sm">
            <Maximize2 className="w-5 h-5" />
            <span className="hidden md:inline">Scale</span>
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={toggleZoom}
      >
        {/* 2. CAMERA LAYER - SOLE OWNER OF TRANSFORMS */}
        <motion.div
            id="camera-layer"
            className="absolute inset-0"
            style={{ 
              x: camX, 
              y: camY, 
              scale: camScale,
              transformOrigin: 'center center' 
            } as any}
        >
            <div id="page-strip" className="relative h-full">
                {Array.from({ length: totalSheets }).map((_, i) => {
                    // No complex virtualization yet, but hide very distant pages for stability
                    if (Math.abs(i - pageIndex) > 2) return null;
                    return (
                        <ReaderSheet
                            key={i}
                            index={i}
                            pdf={pdf}
                            viewMode={viewMode}
                            direction={direction}
                            width={sheetWidth}
                            gap={gap}
                            dpr={dpr}
                        />
                    );
                })}
            </div>
        </motion.div>
      </div>

      <div className="h-20 flex items-center px-6 gap-6 bg-[#1a1a1a] border-t border-white/10 z-20">
        <button 
          onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
          disabled={pageIndex === 0}
          className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30"
        >
          {direction === 'rtl' ? <ChevronRight /> : <ChevronLeft />}
        </button>

        <div className="flex-1 h-1.5 bg-white/10 rounded-full relative overflow-hidden">
            <div 
                className="absolute top-0 bottom-0 left-0 bg-blue-500 transition-all duration-300"
                style={{ width: `${((pageIndex + 1) / totalSheets) * 100}%` }}
            />
        </div>

        <button 
          onClick={() => setPageIndex(Math.min(totalSheets - 1, pageIndex + 1))}
          disabled={pageIndex === totalSheets - 1}
          className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30"
        >
          {direction === 'rtl' ? <ChevronLeft /> : <ChevronRight />}
        </button>
      </div>

      <style>{`
        .textLayer {
          position: absolute;
          left: 0; top: 0; right: 0; bottom: 0;
          overflow: hidden;
          line-height: 1.0;
          text-align: initial;
        }
        .textLayer span {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        .textLayer ::selection {
          background: rgba(0, 0, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
