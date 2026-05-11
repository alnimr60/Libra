import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion } from 'motion/react';
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

function PDFPage({ pdf, pageNumber, width }: { pdf: pdfjs.PDFDocumentProxy, pageNumber: number, width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
        if (!canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        // Cancel previous rendering
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        const page = await pdf.getPage(pageNumber);
        
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        
        const renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
        renderTaskRef.current = renderTask;
        
        try {
            await renderTask.promise;
        } catch (e: any) {
            // RenderingCancelledException is expected
        }
    }
    renderPage();
    return () => {
        isCancelled = true;
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }
    };
  }, [pdf, pageNumber, width]);
  
  return <canvas ref={canvasRef} />;
}

export default function PDFReader({ 
  book, 
  initialPage, 
  updateBook, 
  onPageChange, 
  onUpdateBookmarks, 
  onClose 
}: PDFReaderProps) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  
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
      <div className="flex-1 overflow-auto">
         <PDFPage pdf={pdf} pageNumber={initialPage + 1} width={800} />
      </div>
    </div>
  );
}
