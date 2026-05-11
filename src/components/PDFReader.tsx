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
        if (!canvasRef.current) return;
        
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const renderScale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale: renderScale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        const renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
        renderTaskRef.current = renderTask;
        
        try {
            await renderTask.promise;
        } catch (e: any) {
            // Ignore rendering cancelled error
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
    <div className="relative" style={{ width, height: '100%' }}>
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
        if (!book.fileDataId) return;
        const data = await get<Uint8Array>(book.fileDataId);
        if (!data) return;
        const loadingTask = pdfjs.getDocument({ data });
        const loadedPdf = await loadingTask.promise;
        setPdf(loadedPdf);
    }
    loadPdf();
  }, [book.fileDataId]);

  if (!pdf) return <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">Loading PDF...</div>;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="font-bold">{book.title}</h1>
        <button onClick={onClose} className="p-2 bg-gray-100 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* Simple viewport-clip */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden relative touch-none" 
        id="viewport-clip"
      >
        {/* Simple page-strip (using motion for swipe/pan gestures) */}
        <motion.div 
            className="flex h-full"
            drag="x"
            dragConstraints={{ left: -1000, right: 1000 }} // Simplified constraints
            onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 50) {
                    const newPage = pageIndex + (info.offset.x > 0 ? -1 : 1);
                    setPageIndex(Math.max(0, Math.min(newPage, pdf.numPages - 1)));
                    onPageChange(Math.max(0, Math.min(newPage, pdf.numPages - 1)));
                }
            }}
        >
             {/* Only render current and maybe neighbors in a real implementation.
                 For now, simplify to just current page to be stable. */}
             <ReaderSheet 
                pdf={pdf} 
                pageNumber={pageIndex + 1} 
                width={800} 
                height={1000} 
                isActive={true}
                panX={panX}
                panY={panY}
                scale={scale}
             />
        </motion.div>
      </div>
    </div>
  );
}
