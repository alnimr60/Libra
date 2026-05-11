import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { get } from 'idb-keyval';
import { motion, useMotionValue, animate } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Loader2, Maximize2 } from 'lucide-react';
import { Book } from '../types';

interface PDFReaderProps {
  book: Book;
  initialPage: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

enum GestureMode {
  Idle,
  Swiping,
  Pinching,
  Panning
}

/**
 * PHASE 6: Text Selection
 */
function PDFPage({ 
  pdf, 
  pageNumber,
  width,
  height,
  isDesktop,
  scale,
  panX,
  panY
}: { 
  pdf: pdfjs.PDFDocumentProxy; 
  pageNumber: number;
  width: number;
  height: number;
  isDesktop: boolean;
  scale?: any;
  panX?: any;
  panY?: any;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    async function renderPage() {
      if (!canvasRef.current || !textLayerRef.current || !pdf || pageNumber < 1 || pageNumber > pdf.numPages) return;
      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }

      // Clear text layer
      textLayer.innerHTML = '';

      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const rScale = (width / viewport.width) * 1.5;
        const scaledViewport = page.getViewport({ scale: rScale });
        
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        renderTaskRef.current = page.render({
          canvasContext: ctx,
          viewport: scaledViewport
        });

        await renderTaskRef.current.promise;

        // Render Text Layer
        const textContent = await page.getTextContent();
        pdfjs.renderTextLayer({
          textContent: textContent,
          container: textLayer,
          viewport: scaledViewport,
          enhanceTextSelection: true
        });
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("Render failed:", err);
        }
      }
    }

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch(e) {}
      }
    };
  }, [pdf, pageNumber, width, height, isDesktop]);

  return (
    <motion.div 
      className="relative shadow-2xl bg-white flex items-center justify-center origin-center touch-none select-text overflow-visible"
      style={{ 
        width: width,
        height: 'auto',
        aspectRatio: 'auto',
        scale: scale || 1,
        x: panX || 0,
        y: panY || 0
      }}
    >
      <canvas ref={canvasRef} className="block w-full h-auto pointer-events-none" />
      {/* 
          Text layer container. 
          Must match canvas exactly for selection alignment.
      */}
      <div 
        ref={textLayerRef}
        className="absolute inset-0 pointer-events-auto pdf-text-layer"
        style={{ 
          color: 'transparent',
          lineHeight: 1
        }}
      />
    </motion.div>
  );
}

function ReaderSheet({
  pdf,
  index,
  width,
  height,
  gap,
  isDesktop,
  activeScale,
  activePanX,
  activePanY
}: {
  pdf: pdfjs.PDFDocumentProxy;
  index: number;
  width: number;
  height: number;
  gap: number;
  isDesktop: boolean;
  activeScale?: any;
  activePanX?: any;
  activePanY?: any;
}) {
  const left = index * (width + gap);

  return (
    <div 
      className="absolute top-0 bottom-0 flex items-center justify-center p-4 lg:p-0"
      style={{ 
        left: left,
        width: width
      }}
    >
      <PDFPage 
        pdf={pdf} 
        pageNumber={index + 1} 
        width={width} 
        height={height} 
        isDesktop={isDesktop} 
        scale={activeScale}
        panX={activePanX}
        panY={activePanY}
      />
    </div>
  );
}

export default function PDFReader({ book, initialPage, onPageChange, onClose }: PDFReaderProps) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(initialPage);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout Constants
  const isDesktop = dimensions.width > 1024;
  const gap = isDesktop ? 72 : 32;
  const sheetWidth = isDesktop ? dimensions.width * 0.75 : dimensions.width * 0.9;
  const sheetHeight = dimensions.height * 0.85;
  const centeringOffset = (dimensions.width - sheetWidth) / 2;

  // Transforms
  const stripX = useMotionValue(0);
  const activeScale = useMotionValue(1);
  const activePanX = useMotionValue(0);
  const activePanY = useMotionValue(0);

  // Gesture state
  const mode = useRef<GestureMode>(GestureMode.Idle);
  const startPos = useRef({ x: 0, y: 0, stripX: 0, panX: 0, panY: 0, scale: 1, dist: 1 });

  useEffect(() => {
    async function load() {
      if (!book.fileDataId) return;
      const data = await get<Uint8Array>(book.fileDataId);
      if (!data) return;
      const doc = await pdfjs.getDocument({ data }).promise;
      setPdf(doc);
    }
    load();
  }, [book.fileDataId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (dimensions.width === 0) return;
    const targetX = centeringOffset - (pageIndex * (sheetWidth + gap));
    animate(stripX, targetX, { type: 'spring', damping: 30, stiffness: 200 });
    animate(activeScale, 1, { duration: 0.2 });
    animate(activePanX, 0, { duration: 0.2 });
    animate(activePanY, 0, { duration: 0.2 });
  }, [pageIndex, dimensions.width, sheetWidth, gap]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // If clicking on text, allow browser selection unless intentional drag
    const target = e.target as HTMLElement;
    if (target.classList.contains('pdf-text-layer') || target.parentElement?.classList.contains('pdf-text-layer')) {
      // Don't capture pointer immediately, let selection happen if it's a long click or move
    }

    const touches = (e as any).nativeEvent.touches || [e];
    
    if (touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      startPos.current = {
        ...startPos.current,
        dist: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
        scale: activeScale.get()
      };
      mode.current = GestureMode.Pinching;
    } else {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startPos.current = {
        ...startPos.current,
        x: e.clientX,
        y: e.clientY,
        stripX: stripX.get(),
        panX: activePanX.get(),
        panY: activePanY.get()
      };
      mode.current = GestureMode.Idle;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const touches = (e as any).nativeEvent.touches || [e];
    
    if (mode.current === GestureMode.Pinching && touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scaleDiff = dist / startPos.current.dist;
      const targetScale = Math.max(0.5, Math.min(5, startPos.current.scale * scaleDiff));
      activeScale.set(targetScale);
      return;
    }

    if (!startPos.current) return;
    
    // Check if user is currently selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return; 
    }

    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    if (mode.current === GestureMode.Idle && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      if (activeScale.get() > 1.02) {
        mode.current = GestureMode.Panning;
      } else {
        mode.current = GestureMode.Swiping;
      }
    }

    if (mode.current === GestureMode.Swiping) {
      stripX.set(startPos.current.stripX + dx);
    }

    if (mode.current === GestureMode.Panning) {
      activePanX.set(startPos.current.panX + dx);
      activePanY.set(startPos.current.panY + dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!startPos.current || !pdf) return;

    if (mode.current === GestureMode.Swiping) {
      const dx = e.clientX - startPos.current.x;
      const threshold = dimensions.width / 4;
      let target = pageIndex;

      if (Math.abs(dx) > threshold) {
        target = dx > 0 ? pageIndex - 1 : pageIndex + 1;
      }
      
      const safeTarget = Math.max(0, Math.min(target, pdf.numPages - 1));
      setPageIndex(safeTarget);
      onPageChange(safeTarget);
    }

    if (mode.current === GestureMode.Panning) {
      const currentScale = activeScale.get();
      const maxX = (sheetWidth * (currentScale - 1)) / 2;
      const maxY = (sheetHeight * (currentScale - 1)) / 2;
      
      animate(activePanX, Math.max(-maxX, Math.min(maxX, activePanX.get())), { type: 'spring', damping: 25 });
      animate(activePanY, Math.max(-maxY, Math.min(maxY, activePanY.get())), { type: 'spring', damping: 25 });
    }

    startPos.current = null;
    mode.current = GestureMode.Idle;
  };

  const toggleZoom = () => {
    if (activeScale.get() > 1.1) {
      animate(activeScale, 1, { duration: 0.3 });
      animate(activePanX, 0, { duration: 0.3 });
      animate(activePanY, 0, { duration: 0.3 });
    } else {
      animate(activeScale, 2.5, { duration: 0.3 });
    }
  };

  const goToPage = (idx: number) => {
    if (!pdf) return;
    const safeIdx = Math.max(0, Math.min(idx, pdf.numPages - 1));
    setPageIndex(safeIdx);
    onPageChange(safeIdx);
  };

  if (!pdf || dimensions.width === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" /> Loading...
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-[#0a0a0a] z-50 overflow-hidden flex flex-col font-sans"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={toggleZoom}
    >
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/60 to-transparent z-20 flex items-center justify-between px-6 pointer-events-none select-none">
        <div className="pointer-events-auto flex items-center gap-4">
          <h1 className="text-white font-medium truncate max-w-md text-shadow-sm">{book.title}</h1>
          <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded backdrop-blur-md">
            {pageIndex + 1} / {pdf.numPages}
          </span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={toggleZoom}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute inset-y-0 left-0 flex items-center pointer-events-none"
          style={{ x: stripX }}
        >
          {Array.from({ length: pdf.numPages }).map((_, idx) => {
            if (Math.abs(idx - pageIndex) > 1) return null;
            return (
              <ReaderSheet 
                key={idx}
                pdf={pdf}
                index={idx}
                width={sheetWidth}
                height={sheetHeight}
                gap={gap}
                isDesktop={isDesktop}
                activeScale={idx === pageIndex ? activeScale : undefined}
                activePanX={idx === pageIndex ? activePanX : undefined}
                activePanY={idx === pageIndex ? activePanY : undefined}
              />
            );
          })}
        </motion.div>
      </div>

      <div className="absolute bottom-10 left-0 right-0 z-20 flex items-center justify-center gap-8 pointer-events-none select-none">
        <button 
          onClick={() => goToPage(pageIndex - 1)}
          disabled={pageIndex === 0}
          className="p-4 bg-black/40 text-white rounded-full hover:bg-black/60 disabled:opacity-20 transition-all pointer-events-auto backdrop-blur-sm shadow-xl"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button 
          onClick={() => goToPage(pageIndex + 1)}
          disabled={pageIndex === pdf.numPages - 1}
          className="p-4 bg-black/40 text-white rounded-full hover:bg-black/60 disabled:opacity-20 transition-all pointer-events-auto backdrop-blur-sm shadow-xl"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
