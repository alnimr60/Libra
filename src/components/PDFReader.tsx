import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { get } from 'idb-keyval';
import { cn } from '../lib/utils';

interface PDFReaderProps {
  fileDataId: string;
  initialPage: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

export default function PDFReader({ fileDataId, initialPage, onPageChange, onClose }: PDFReaderProps) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPDF() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await get(fileDataId);
        if (!data) {
          throw new Error('This book\'s PDF file could not be found. Try re-adding the book.');
        }

        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setIsLoading(false);
      } catch (err: any) {
        console.error('PDFReader: Error loading PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setIsLoading(false);
      }
    }
    loadPDF();
  }, [fileDataId]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let renderTask: any = null;

    async function renderPage() {
      try {
        const page = await pdf!.getPage(currentPage);
        // Use a higher base scale for sharper rendering, then apply user scale
        const viewport = page.getViewport({ scale: scale * 2.0 }); 
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d', { alpha: false });

        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          // Cancel previous render if any
          if (renderTask) {
            renderTask.cancel();
          }

          renderTask = page.render({
            canvasContext: context,
            viewport: viewport,
          });
          
          await renderTask.promise;
          onPageChange(currentPage);
        }
      } catch (error: any) {
        if (error.name === 'RenderingCancelledException') return;
        console.error('Error rendering page:', error);
      }
    }
    renderPage();

    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, currentPage, scale]);

  const handlePrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage(p => Math.min(numPages, p + 1));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "fixed inset-0 z-[300] bg-black/95 flex flex-col transition-all duration-500",
        isFullscreen ? "p-0" : "p-4 md:p-8"
      )}
    >
      {/* Reader Controls Top */}
      <div className="flex items-center justify-between gap-4 mb-4 px-4 text-white/70">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="text-sm font-medium">
            Page {currentPage} <span className="opacity-40">of</span> {numPages}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/10 rounded-full px-2 py-1">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-2 hover:bg-white/10 rounded-full">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[10px] font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-2 hover:bg-white/10 rounded-full">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button 
          onClick={() => setIsFullscreen(!isFullscreen)} 
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 overflow-auto flex items-start justify-center custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-20 text-white/40">
            <Loader2 className="w-12 h-12 animate-spin" />
            <p className="text-sm">Preparing spreads...</p>
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
            <button 
              onClick={onClose}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm transition-colors"
            >
              Close Reader
            </button>
          </div>
        ) : (
          <div className="relative shadow-2xl bg-white origin-top transition-transform duration-200">
            <canvas 
              ref={canvasRef} 
              style={{ 
                width: `${100 * scale}%`, 
                height: 'auto',
                maxWidth: scale > 1 ? 'none' : '100%'
              }} 
            />
            
            {/* Invisible Tap Zones for Navigation */}
            <div className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize" onClick={handlePrev} />
            <div className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize" onClick={handleNext} />
          </div>
        )}
      </div>

      {/* Reader Controls Bottom */}
      {!isLoading && (
        <div className="mt-4 flex items-center justify-center gap-8 px-4 py-4 bg-white/5 backdrop-blur-md rounded-2xl max-w-xs mx-auto mb-4 border border-white/10">
          <button 
            disabled={currentPage === 1}
            onClick={handlePrev} 
            className="p-3 bg-white/10 rounded-full disabled:opacity-20 hover:scale-110 active:scale-95 transition-all text-white"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <div className="flex-1 h-1 relative bg-white/10 rounded-full overflow-hidden">
            <div 
              className="absolute h-full bg-orange-400" 
              style={{ width: `${(currentPage / numPages) * 100}%` }} 
            />
          </div>

          <button 
            disabled={currentPage === numPages}
            onClick={handleNext} 
            className="p-3 bg-white/10 rounded-full disabled:opacity-20 hover:scale-110 active:scale-95 transition-all text-white"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
