import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pdfjs } from '../lib/pdf';
import 'pdfjs-dist/web/pdf_viewer.css';
import { motion, AnimatePresence, useMotionValue, useSpring, animate, useTransform } from 'motion/react';
import { X, Loader2, Bookmark as BookmarkIcon } from 'lucide-react';
import { get } from 'idb-keyval';
import { cn } from '../lib/utils';
import { useSafeArea } from './SafeAreaProvider';

export default function PremiumPDFReader({ book, initialPage, onPageChange, onUpdateBookmarks, onClose }: any) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const insets = useSafeArea();
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [viewMode] = useState<'single' | 'double'>(window.innerWidth > 1024 ? 'double' : 'single');
  
  // Camera & Panning
  const zoom = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const springScale = useSpring(zoom, { stiffness: 200, damping: 30 });
  
  // Swipe State
  const dragX = useMotionValue(0);
  const springDragX = useSpring(dragX, { stiffness: 200, damping: 30 });

  const totalSheets = viewMode === 'double' ? Math.ceil(numPages / 2) : numPages;

  useEffect(() => {
    async function load() {
      try {
        if (!book.fileDataId) return;
        const data = await get(book.fileDataId);
        if (!data) return;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
        const doc = await loadingTask.promise;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPageIndex(viewMode === 'double' ? Math.floor((initialPage - 1) / 2) : initialPage - 1);
        setIsLoading(false);
      } catch (e) {
        setIsLoading(false);
      }
    }
    load();
  }, [book.fileDataId]);

  const handlePageChange = (newIdx: number) => {
    const idx = Math.max(0, Math.min(newIdx, totalSheets - 1));
    if (idx === pageIndex) return;
    setPageIndex(idx);
    const p = viewMode === 'double' ? (idx * 2) + 1 : idx + 1;
    onPageChange(Math.min(p, numPages));
    // Reset camera
    animate(zoom, 1);
    animate(panX, 0);
    animate(panY, 0);
  };

  const handleDragEnd = (e: any, info: any) => {
    if (zoom.get() > 1.1) return; // Ignore swipe if zoomed
    const threshold = 100;
    if (info.offset.x < -threshold) handlePageChange(pageIndex + 1);
    else if (info.offset.x > threshold) handlePageChange(pageIndex - 1);
  };

  const lastTap = useRef<number>(0);
  const handleTap = (e: any) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (zoom.get() > 1.1) {
        animate(zoom, 1);
        animate(panX, 0);
        animate(panY, 0);
      } else {
        animate(zoom, 2.5);
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      setShowControls(!showControls);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-[#080808] flex flex-col overflow-hidden touch-none select-none">
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            style={{ paddingTop: `${insets.top + 16}px` }}
            className="fixed top-0 left-0 right-0 z-[350] flex items-center justify-between p-6 bg-black/60 backdrop-blur-2xl border-b border-white/5"
          >
            <button onClick={onClose} className="p-3 bg-white/5 rounded-full text-white/60"><X /></button>
            <div className="flex items-center gap-3 bg-white/10 px-6 py-2 rounded-full text-white font-mono text-sm">
              {pageIndex + 1} <span className="opacity-20 mx-2">/</span> {totalSheets}
            </div>
            <button className="p-3 bg-white/5 rounded-full text-white/20"><BookmarkIcon /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {isLoading ? <Loader2 className="animate-spin text-orange-500 w-12 h-12" /> : (
          <motion.div 
            className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
            drag={zoom.get() <= 1.1 ? "x" : true}
            dragConstraints={zoom.get() <= 1.1 ? { left: 0, right: 0 } : { left: -1000, right: 1000, top: -1000, bottom: 1000 }}
            onDragEnd={handleDragEnd}
            onClick={handleTap}
            style={{ 
              scale: springScale, 
              x: zoom.get() > 1.1 ? panX : 0, 
              y: zoom.get() > 1.1 ? panY : 0 
            }}
          >
            <div className="flex gap-20 px-[20%]">
              {Array.from({ length: 3 }, (_, i) => pageIndex - 1 + i).map(idx => {
                if (idx < 0 || idx >= totalSheets) return <div key={idx} className="w-[80vw] shrink-0" />;
                return (
                  <div key={idx} className="shrink-0 flex items-center justify-center w-[80vw]">
                     <motion.div 
                       animate={{ 
                         scale: idx === pageIndex ? 1 : 0.9,
                         opacity: idx === pageIndex ? 1 : 0.4,
                         rotateY: idx === pageIndex ? 0 : (idx < pageIndex ? 5 : -5)
                       }}
                       className="flex gap-4"
                     >
                        {viewMode === 'double' ? (
                          <>
                            <PageRenderer pdf={pdf!} pageNum={(idx * 2) + 1} numPages={numPages} />
                            <PageRenderer pdf={pdf!} pageNum={(idx * 2) + 2} numPages={numPages} />
                          </>
                        ) : (
                          <PageRenderer pdf={pdf!} pageNum={idx + 1} numPages={numPages} />
                        )}
                     </motion.div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            style={{ paddingBottom: `${insets.bottom + 24}px` }}
            className="fixed bottom-0 left-0 right-0 z-[350] px-12"
          >
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
               <motion.div className="h-full bg-orange-500" animate={{ width: `${((pageIndex + 1) / totalSheets) * 100}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PageRenderer({ pdf, pageNum, numPages }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (pageNum > numPages) return;
    async function render() {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.5 });
      const fit = Math.min((window.innerWidth * 0.8) / (viewport.width / 2.5), (window.innerHeight * 0.8) / (viewport.height / 2.5));
      const w = (viewport.width / 2.5) * fit;
      const h = (viewport.height / 2.5) * fit;
      setDim({ w, h });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      }

      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        const textLayer = new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(),
          container: textLayerRef.current,
          viewport: page.getViewport({ scale: 2.5 * fit })
        });
        await textLayer.render();
      }
    }
    render();
  }, [pdf, pageNum]);

  if (pageNum > numPages) return <div className="bg-zinc-900/20" style={{ width: dim.w, height: dim.h }} />;

  return (
    <div className="relative bg-white shadow-2xl" style={{ width: dim.w, height: dim.h }}>
      <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />
      <div ref={textLayerRef} className="textLayer absolute inset-0 select-text z-20" style={{ color: 'transparent', opacity: 1 }} />
    </div>
  );
}
