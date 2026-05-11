import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { X, Maximize2, Loader2, Plus, Minus, Languages, Navigation, Check, Bookmark as BookmarkIcon, Trash2, AlertCircle } from 'lucide-react';
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

import React, { useState, useEffect, useRef } from 'react';
import { pdfjs } from '../lib/pdf';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
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
  
  useEffect(() => {
    async function renderPage() {
        if (!canvasRef.current) return;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    }
    renderPage();
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
        // Assume book.url contains the PDF URL
        const loadingTask = pdfjs.getDocument(book.url);
        const loadedPdf = await loadingTask.promise;
        setPdf(loadedPdf);
    }
    loadPdf();
  }, [book.url]);

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
