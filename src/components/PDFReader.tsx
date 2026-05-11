import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { get } from 'idb-keyval';
import { Book, Bookmark } from '../types';

export interface PDFReaderProps {
  book: Book;
  initialPage: number;
  updateBook: (book: Book) => void;
  onPageChange: (page: number) => void;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onClose: () => void;
}

/**
 * PDFPage: Static rendering component with strict task management.
 * 1. SINGLE RENDER OWNER: Each PDFPage owns its canvas and rendering lifecycle.
 * 11. RENDER GUARDS: Verifies canvas and document before rendering.
 */
function PDFPage({ 
  pdf, 
  pageNumber, 
  availableWidth 
}: { 
  pdf: pdfjs.PDFDocumentProxy; 
  pageNumber: number; 
  availableWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function doRender() {
      if (!canvasRef.current || !pdf) return;
      if (pageNumber < 1 || pageNumber > pdf.numPages) return;

      console.group(`[RenderProbe] Page ${pageNumber}`);
      console.log(`Available Width: ${availableWidth}`);

      // 1. Task Cancellation - Prevent overlapping renders on same canvas
      if (renderTaskRef.current) {
        console.log("Cancelling existing task...");
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
        renderTaskRef.current = null;
      }

      try {
        // 2. Fetch Page
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        // 3. Viewport Calculation
        const viewport = page.getViewport({ scale: 1 });
        // availableWidth must be > 0
        const calcWidth = Math.max(100, availableWidth);
        const scale = calcWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        
        console.log(`Logical Viewport: ${scaledViewport.width}x${scaledViewport.height} @ ${scale}x`);

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        
        if (!context) {
          console.error("Failed to get 2D context");
          return;
        }

        // 4. Match logical/bitmap dimensions
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        // 9. Style width exactly matches expected viewport width
        canvas.style.width = `${scaledViewport.width}px`;
        canvas.style.height = `${scaledViewport.height}px`;

        console.log(`Canvas Bitmap: ${canvas.width}x${canvas.height}`);

        // 5. Start Render
        console.log("Render task started...");
        renderTaskRef.current = page.render({
          canvasContext: context,
          viewport: scaledViewport
        });

        await renderTaskRef.current.promise;
        
        if (!cancelled) {
          console.log("Render task COMPLETED successfully.");
        }
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') {
          console.log("Render task CANCELLED by state change.");
        } else {
          console.error("Render task FAILED:", err);
        }
      } finally {
        console.groupEnd();
      }
    }

    doRender();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdf, pageNumber, availableWidth]);

  return (
    <div style={{ border: '4px solid green', display: 'inline-block', margin: '20px auto' }}>
      <canvas 
        ref={canvasRef} 
        style={{ border: '4px solid blue', display: 'block' }} 
      />
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
  const [viewportDims, setViewportDims] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 6. PDF Loading Flow
  useEffect(() => {
    async function load() {
      console.log("[PDFReader] Starting fetch for fileDataId:", book.fileDataId);
      if (!book.fileDataId) return;
      
      try {
        const data = await get<Uint8Array>(book.fileDataId);
        if (!data) {
          console.error("[PDFReader] No data found in IDB.");
          return;
        }

        console.log("[PDFReader] Data retrieved. Parsing PDF...");
        const task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        
        console.log("[PDFReader] PDF PARSED. Total Pages:", doc.numPages);
        setPdf(doc);
      } catch (e) {
        console.error("[PDFReader] Document initialization failed:", e);
      }
    }
    load();
  }, [book.fileDataId]);

  // Viewport Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      console.log(`[ViewportProbe] Size detected: ${width}x${height}`);
      setViewportDims({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!pdf) return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-2" />
      <p className="text-gray-500 font-bold">RECOVERING RENDERING SYSTEM...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col text-white font-sans">
      {/* Simple Navigation Menu */}
      <div className="h-16 bg-zinc-900 border-b border-white/10 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div>
            <h1 className="font-semibold leading-tight truncate max-w-[200px] md:max-w-md">{book.title}</h1>
            <p className="text-xs text-gray-400">Stable Baseline - Page {pageIndex + 1} of {pdf.numPages}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            disabled={pageIndex === 0}
            onClick={() => {
              const prev = pageIndex - 1;
              setPageIndex(prev);
              onPageChange(prev);
            }}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
          >
            <ChevronLeft />
          </button>
          
          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-md">
            <span className="font-mono font-bold text-sm tracking-widest">
              {pageIndex + 1} / {pdf.numPages}
            </span>
          </div>

          <button 
            disabled={pageIndex === pdf.numPages - 1}
            onClick={() => {
              const next = pageIndex + 1;
              setPageIndex(next);
              onPageChange(next);
            }}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* VIEWPORT-CLIP (RED BORDER) */}
      <div 
        ref={containerRef}
        className="flex-1 w-full relative overflow-hidden" 
        style={{ border: '4px solid red' }}
      >
        {/* PAGE-CONTAINER (YELLOW/GREEN BORDER) */}
        {viewportDims.width > 0 && (
          <div 
            className="w-full h-full overflow-auto flex flex-col pt-10"
            style={{ border: '4px solid yellow' }}
          >
            <PDFPage 
              pdf={pdf} 
              pageNumber={pageIndex + 1} 
              availableWidth={Math.min(viewportDims.width * 0.9, 800)} 
            />
          </div>
        )}
      </div>

      <style>{`
        canvas {
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
        }
      `}</style>
    </div>
  );
}
