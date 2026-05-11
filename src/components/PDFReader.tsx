import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { X } from 'lucide-react';
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

// Minimal sheet component
function ReaderSheet({ 
  pdf, 
  pageNumber, 
  width, 
  height, 
  isActive,
  panX,
  panY,
  scale
}: { 
  pdf: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  width: number,
  height: number,
  isActive: boolean,
  panX: any,
  panY: any,
  scale: any
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  
  useEffect(() => {
    async function render() {
        console.log(`[ReaderSheet] Rendering page ${pageNumber}...`);
        if (!canvasRef.current) {
            console.error("[ReaderSheet] canvasRef not mounted");
            return;
        }
        
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        try {
            const page = await pdf.getPage(pageNumber);
            console.log(`[ReaderSheet] Page ${pageNumber} loaded.`);
            const viewport = page.getViewport({ scale: 1 });
            const renderScale = width / viewport.width;
            const scaledViewport = page.getViewport({ scale: renderScale });
            console.log(`[ReaderSheet] Page ${pageNumber} viewport:`, scaledViewport);
            
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) {
                console.error("[ReaderSheet] No 2D context");
                return;
            }
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            console.log(`[ReaderSheet] Canvas resized to ${canvas.width}x${canvas.height}`);
            
            const renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
            renderTaskRef.current = renderTask;
            
            await renderTask.promise;
            console.log(`[ReaderSheet] Page ${pageNumber} render completed.`);
        } catch (e: any) {
            if (e.name !== 'RenderingCancelledException') {
                console.error(`[ReaderSheet] Page ${pageNumber} render failed:`, e);
            } else {
                console.log(`[ReaderSheet] Page ${pageNumber} render cancelled.`);
            }
        }
    }
    render();
    return () => {
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }
    };
  }, [pdf, pageNumber, width]);
  
  const content = (
    <div className="relative border-4 border-red-500" style={{ width, height: 'auto', minHeight: '100%' }}>
      <p className="text-sm font-bold bg-white text-black p-1">Page {pageNumber} ({width}px)</p>
      <canvas ref={canvasRef} />
    </div>
  );

  return isActive ? (
    <motion.div
      className="absolute top-0 left-0"
      style={{
        x: panX,
        y: panY,
        scale: scale,
        transformOrigin: '0 0',
        willChange: 'transform',
        contain: 'strict'
      } as any}
    >
      {content}
    </motion.div>
  ) : (
    <div className="absolute top-0 left-0">{content}</div>
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
  const containerRef = useRef<HTMLDivElement>(null);
  
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const scale = useMotionValue(1);
  
  useEffect(() => {
    async function loadPdf() {
        console.log("[PDFReader] Starting PDF load...");
        if (!book.fileDataId) {
            console.error("[PDFReader] No fileDataId provided");
            return;
        }
        const data = await get<Uint8Array>(book.fileDataId);
        if (!data) {
            console.error("[PDFReader] Failed to get PDF data from IDB");
            return;
        }
        console.log("[PDFReader] PDF data retrieved. Length:", data.length);
        const loadingTask = pdfjs.getDocument({ data });
        const loadedPdf = await loadingTask.promise;
        console.log("[PDFReader] PDF loaded successfully. Pages:", loadedPdf.numPages);
        setPdf(loadedPdf);
    }
    loadPdf();
  }, [book.fileDataId]);

  if (!pdf) return <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">Loading PDF...</div>;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="font-bold">{book.title} (Page {pageIndex + 1})</h1>
        <button onClick={onClose} className="p-2 bg-gray-100 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* Viewport with diagnostic background */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden relative touch-none bg-gray-800" 
        id="viewport-clip"
      >
        <div className="flex h-full bg-gray-300 w-full" id="page-strip">
             <ReaderSheet 
                key={pageIndex}
                pdf={pdf} 
                pageNumber={pageIndex + 1} 
                width={containerRef.current?.clientWidth || 800} 
                height={containerRef.current?.clientHeight || 1000} 
                isActive={true}
                panX={panX}
                panY={panY}
                scale={scale}
             />
        </div>
      </div>
    </div>
  );
}
